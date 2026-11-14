import Groq from 'groq-sdk';
import { config } from '../../config/index.js';
import { normalizeDateToIso } from '../../modules/extraction/ruleExtraction.service.js';

function getGroqClient() {
  const apiKey = (config.groq.apiKey || process.env.GROQ_API_KEY || '').trim();
  return new Groq({ apiKey });
}

const CANDIDATE_CHAT_MODELS = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'openai/gpt-oss-safeguard-20b',
  config.groq.model,
].filter(Boolean);

/**
 * Resilient Groq execution with multi-model fallback chain
 */
export async function executeGroqChatCompletion(params) {
  const groq = getGroqClient();
  const models = Array.from(new Set([
    params.model,
    ...CANDIDATE_CHAT_MODELS,
  ].filter(Boolean)));

  let lastError = null;
  for (const model of models) {
    try {
      const response = await groq.chat.completions.create({
        ...params,
        model,
      });
      return response;
    } catch (err) {
      lastError = err;
      console.warn(`[Groq] Model "${model}" failed: ${err.message}. Trying next fallback...`);
    }
  }

  throw lastError;
}

/**
 * Extract structured metadata, entity fields, and expiry dates from document text
 */
export async function extractDocumentMetadata(rawText, filename, imageBase64 = null) {
  // If no text was extracted (e.g. image document or scanned PDF), use Groq Multimodal Vision (Qwen 3.8 27B)
  if ((!rawText || rawText.trim().length < 20) && imageBase64) {
    try {
      console.log(`[Groq Vision OCR] Attempting visual multimodal extraction for: ${filename} using qwen/qwen3.8-27b...`);
      const visionPrompt = `You are the DocVault Universal Production Document Vision Engine.
Analyze the provided document image (such as an academic certificate, invoice, policy, receipt, or identity card) and extract its complete content and metadata.
Pay special attention to dates (issue date, completion date, award date), recipient/organization names, certificate/credential IDs, and all readable text.

Return ONLY a valid JSON object (no markdown, no backticks):
{
  "title": "A short, descriptive title for this document (e.g. 'Stanford Machine Learning Certificate')",
  "category": "One of: 'Academic Certificate', 'Tax Invoice', 'Purchase Receipt', 'Insurance Policy', 'Warranty Document', 'Medical Report', 'Admit Card', 'Bank Statement', 'Identity Document', 'Employment Document', 'Other'",
  "documentDate": "Primary document date (e.g. Issue Date, Certificate Award Date, Invoice Date, Completion Date) in YYYY-MM-DD or readable format if found, otherwise null",
  "expiryDate": "YYYY-MM-DD format if an expiration, renewal, or validity end date is present, otherwise null",
  "summary": "A concise 2-3 sentence executive summary explaining what this document is, recipient/issuer, and critical facts.",
  "keyDetails": {
    "Recipient Name": "Name of person awarded/billed/insured if present",
    "Issuing Organization": "Institution, University, Company, or Authority",
    "Certificate or Credential ID": "Certificate No, Roll No, or ID if present",
    "Issue Date": "Date issued, awarded, or signed",
    "Course or Program": "Course/degree title if applicable",
    "Additional Details": "Any other critical numbers or values"
  },
  "tags": ["array", "of", "3-5", "relevant", "search", "keywords"],
  "extractedText": "Complete readable verbatim transcription of all text and labels detected in this document image"
}
Filename: ${filename}`;

      const visionResponse = await getGroqClient().chat.completions.create({
        model: 'qwen/qwen3.8-27b',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: visionPrompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' }
      });

      const parsed = JSON.parse(visionResponse.choices[0].message.content);
      console.log(`[Groq Vision Success] Successfully extracted metadata visually from ${filename}`);

      // Auto-normalize dates
      if (parsed.documentDate) {
        const norm = normalizeDateToIso(parsed.documentDate);
        if (norm) parsed.documentDate = norm;
      }
      if (parsed.expiryDate) {
        const norm = normalizeDateToIso(parsed.expiryDate);
        if (norm) parsed.expiryDate = norm;
      }
      if (parsed.keyDetails && typeof parsed.keyDetails === 'object') {
        for (const [k, v] of Object.entries(parsed.keyDetails)) {
          if (typeof v === 'string' && /(?:date|issued|expiry|completion|valid)/i.test(k)) {
            const norm = normalizeDateToIso(v);
            if (norm) parsed.keyDetails[k] = norm;
          }
        }
      }

      return parsed;
    } catch (visionErr) {
      console.warn('[Groq Vision Warning] Vision fallback failed, proceeding with text-based model:', visionErr.message);
    }
  }

  const prompt = `You are the DocVault AI Universal Information Extraction Engine.
Analyze the following document text and return ONLY a valid JSON object (no markdown, no backticks, no commentary).
Extract all critical metadata, paying special attention to certificate dates, recipient names, issuing organizations, and identifiers.

{
  "title": "A short, descriptive title for this document (e.g. 'Stanford Machine Learning Certificate')",
  "category": "One of: 'Academic Certificate', 'Tax Invoice', 'Purchase Receipt', 'Insurance Policy', 'Warranty Document', 'Medical Report', 'Admit Card', 'Academic Certificate', 'Bank Statement', 'Identity Document', 'Employment Document', 'Other'",
  "documentDate": "Primary date of this document (e.g. Issue Date, Certificate Date, Invoice Date, Award Date, Completion Date) in YYYY-MM-DD or readable format if found, otherwise null",
  "expiryDate": "YYYY-MM-DD format if an expiration, renewal, or warranty end date is present, otherwise null",
  "summary": "A concise 2-3 sentence executive summary explaining what this document is, recipient/issuer, and key facts.",
  "keyDetails": {
    "Recipient Name": "Name of person awarded/billed/insured if present",
    "Issuing Organization": "Institution, Company, or Authority",
    "Certificate or Credential ID": "Certificate No, Roll No, or ID if present",
    "Issue Date": "Date issued, awarded, or signed",
    "Course or Program": "Course/degree title if applicable"
  },
  "tags": ["array", "of", "3-5", "relevant", "search", "keywords"]
}

Filename: ${filename}
Document Text:
${rawText ? rawText.slice(0, 4000) : 'No OCR text available. Infer from filename.'}
`;

  try {
    const response = await executeGroqChatCompletion({
      model: config.groq.model || 'qwen/qwen3.8-27b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(response.choices[0].message.content);

    // Auto-normalize dates
    if (parsed.documentDate) {
      const norm = normalizeDateToIso(parsed.documentDate);
      if (norm) parsed.documentDate = norm;
    }
    if (parsed.expiryDate) {
      const norm = normalizeDateToIso(parsed.expiryDate);
      if (norm) parsed.expiryDate = norm;
    }
    if (parsed.keyDetails && typeof parsed.keyDetails === 'object') {
      for (const [k, v] of Object.entries(parsed.keyDetails)) {
        if (typeof v === 'string' && /(?:date|issued|expiry|completion|valid)/i.test(k)) {
          const norm = normalizeDateToIso(v);
          if (norm) parsed.keyDetails[k] = norm;
        }
      }
    }

    return parsed;
  } catch (err) {
    console.error('[Groq] Metadata extraction failed:', err.message);
    return {
      title: filename.replace(/\.[^/.]+$/, ''),
      category: 'Other',
      documentDate: null,
      summary: 'Uploaded document stored securely in your encrypted DocVault.',
      expiryDate: null,
      keyDetails: { 'File Name': filename },
      tags: ['Document', 'Vault'],
    };
  }
}

/**
 * Answer questions based on retrieved document context and tracked assets (RAG Q&A)
 */
export async function answerDocumentQuery(question, contextDocs = [], contextAssets = []) {
  const docContextString = contextDocs.length > 0 ? contextDocs.map((doc, idx) => `
[Document ${idx + 1}]: "${doc.title}" (Category: ${doc.category})
Primary Document Date / Issue Date: ${doc.documentDate || doc.keyDetails?.['Issue Date'] || doc.keyDetails?.['Date'] || doc.keyDetails?.['Date of Issue'] || doc.keyDetails?.['ISSUE DATE'] || 'N/A'}
Expiry / Due Date: ${doc.expiryDate || doc.keyDetails?.['Expiry Date'] || doc.keyDetails?.['EXPIRY DATE'] || 'N/A'}
Summary: ${doc.summary || 'N/A'}
Key Structured Details: ${JSON.stringify(doc.keyDetails || {})}
Extracted Document Content / Text:
${doc.extractedText ? doc.extractedText.slice(0, 3500) : 'N/A'}
`).join('\n---\n') : 'No documents found.';

  const assetContextString = contextAssets.length > 0 ? contextAssets.map((asset, idx) => `
[Asset ${idx + 1}]: "${asset.name}" (Category: ${asset.category})
Estimated Value: ${asset.estimatedValue || 'N/A'}
Status: ${asset.status || 'Active'}
Purchase Date: ${asset.purchaseDate || 'N/A'}
Warranty Expiry: ${asset.warrantyExpiry || 'N/A'}
Insurance Expiry: ${asset.insuranceExpiry || 'N/A'}
Next Scheduled Service: ${asset.nextService || 'N/A'}
`).join('\n---\n') : 'No tracked assets found.';

  const prompt = `You are the DocVault AI Assistant.
SECURITY & ACCURACY RULES:
1. You operate strictly within the user's isolated encrypted DocVault ecosystem.
2. Answer the user's question directly, professionally, and accurately using the provided verified document records and tracked asset inventory below.
3. If the user is asking a conversational greeting or overview (such as "hi", "hello", "what can you do?", "how does DocVault work?"), respond politely, introduce yourself as the DocVault AI Assistant, and briefly explain how you can help analyze and answer questions about their encrypted documents and assets.
4. When asked about DATES (e.g. "when was my certificate issued?", "what is the date on my document?", "when does it expire?"), check "Primary Document Date / Issue Date", "Expiry / Due Date", and "Key Structured Details" first.
5. If the user asks about names, certificates, courses, organizations, or numbers, locate the exact values from "Key Structured Details" and "Extracted Document Content".
6. State dates and critical entities directly and prominently in bold.
7. If neither the provided documents nor the tracked assets contain the answer, reply cleanly:
"I cannot find that information in your currently uploaded documents or tracked assets."
8. Structure your responses cleanly with clear headings, bullet points, and highlight key identifiers.

CONTEXT - TRACKED ASSETS:
${assetContextString}

CONTEXT - STORED DOCUMENTS:
${docContextString}

USER QUESTION:
${question}
`;

  try {
    const response = await executeGroqChatCompletion({
      model: config.groq.model || 'qwen/qwen3.8-27b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1000,
    });

    return response.choices[0].message.content;
  } catch (err) {
    console.warn('[Groq] Chat query fallback across candidate models:', err.message);
    // Deterministic grounding fallback: answers the user's specific query using verified document facts
    return answerWithDeterministicGrounding(question, contextDocs, contextAssets);
  }
}

/**
 * Deterministic Grounded Query Solver:
 * Directly extracts answers from verified document context and structured attributes
 * when live LLM execution is unavailable or rate-limited.
 */
export function answerWithDeterministicGrounding(question, contextDocs = [], contextAssets = []) {
  const lowerQ = (question || '').toLowerCase();
  const isDateQ = /(?:when|date|day|month|year|expiry|expire|due\s*date|issued|collection|printed)/i.test(lowerQ);
  const isNameQ = /(?:who|name|consumer|customer|recipient|person|whom|billed\s*to)/i.test(lowerQ);
  const isAccountQ = /(?:account\s*no|account\s*number|consumer\s*no|ca\s*no|receipt\s*no|transaction\s*id|policy\s*no)/i.test(lowerQ);
  const isAmountQ = /(?:amount|how\s*much|cost|price|total|payable|paid|fee|charge|balance|bill\s*amount|bill\s*total)/i.test(lowerQ);

  if (contextDocs.length > 0) {
    const primaryDoc = contextDocs[0];
    const text = primaryDoc.extractedText || '';
    const keyDetails = primaryDoc.keyDetails || {};

    // 1. Extract amount
    let amount = keyDetails['TOTAL AMOUNT'] || keyDetails['Total Amount'] || keyDetails['Amount'] || keyDetails['AMOUNT'] || null;
    if (!amount) {
      const amountMatch = text.match(/(?:total\s*amount\s*(?:received|paid|due|payable)?|amount\s*(?:received|paid|due|payable)?|total\s*(?:received|paid|payable)?|grand\s*total|net\s*payable|bill\s*amount)[:.\s]*(?:₹|rs\.?|inr|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?(?:\s*\([^\)]+\))?(?:\s*only)?)/i);
      if (amountMatch) amount = amountMatch[1].trim();
    }

    // 2. Extract consumer / recipient
    let consumer = keyDetails['CONSUMER NAME'] || keyDetails['Consumer Name'] || keyDetails['Recipient Name'] || keyDetails['RECIPIENT NAME'] || null;
    if (!consumer) {
      const consumerMatch = text.match(/(?:consumer\s*name|customer\s*name|billed\s*to|recipient(?:\s*name)?|name)[:.\s]+([A-Z][A-Za-z\s\/\.]{2,45})/i);
      if (consumerMatch) consumer = consumerMatch[1].trim().split('\n')[0];
    }

    // 3. Extract account number
    let accountNo = keyDetails['ACCOUNT NUMBER'] || keyDetails['Account No'] || keyDetails['ACCOUNT NO'] || null;
    if (!accountNo) {
      const accMatch = text.match(/(?:account\s*no\.?|consumer\s*no\.?|ca\s*no\.?)[:.\s]*([A-Za-z0-9\-_]{4,25})/i);
      if (accMatch) accountNo = accMatch[1].trim();
    }

    // 4. Extract transaction / receipt ID
    let txId = keyDetails['TRANSACTION ID'] || keyDetails['Transaction ID'] || null;
    if (!txId) {
      const txMatch = text.match(/(?:transaction\s*id\.?|receipt\s*no\.?|bill\s*no\.?)[:.\s]*([A-Za-z0-9\-_]{5,35})/i);
      if (txMatch) txId = txMatch[1].trim();
    }

    // 5. Extract date
    let docDate = primaryDoc.documentDate || keyDetails['ISSUE DATE'] || keyDetails['DOCUMENT DATE'] || null;
    if (!docDate) {
      const dateMatch = text.match(/(?:collection\s*date|printed\s*date|payment\s*date|bill\s*date|issue\s*date|due\s*date)[:.\s]*([0-9]{1,2}[-\/.][0-9]{1,2}[-\/.][0-9]{2,4})/i);
      if (dateMatch) docDate = dateMatch[1].trim();
    }

    // 6. Extract issuer / provider
    let issuer = keyDetails['ISSUING AUTHORITY'] || keyDetails['Issuing Organization'] || null;
    if (!issuer && text) {
      const firstLines = text.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 3);
      const authorityLine = firstLines.find(l => /(?:nigam|ltd|limited|board|corporation|bank|department|university|hospital)/i.test(l));
      if (authorityLine) issuer = authorityLine;
    }

    let directAnswer = '';
    if (isNameQ && consumer) {
      directAnswer = `The **${primaryDoc.title}** is issued to **${consumer}**.\n\n`;
    } else if (isDateQ && (docDate || primaryDoc.expiryDate)) {
      directAnswer = `The recorded date for **${primaryDoc.title}** is **${docDate || primaryDoc.expiryDate}**.\n\n`;
    } else if (isAccountQ && (accountNo || txId)) {
      directAnswer = `The account identifier for **${primaryDoc.title}** is ` + (accountNo ? `**${accountNo}**` : `**${txId}**`) + `.\n\n`;
    } else if (isAmountQ && amount) {
      const formattedAmt = amount.startsWith('₹') || amount.startsWith('$') ? amount : `₹${amount}`;
      directAnswer = `The amount of your **${primaryDoc.title}** is **${formattedAmt}**.\n\n`;
    } else {
      directAnswer = `Here are the verified records from your vault for **${primaryDoc.title}**:\n\n`;
    }

    directAnswer += `### Verified Vault Record\n`;
    if (amount) directAnswer += `• **Total Amount:** **${amount.startsWith('₹') || amount.startsWith('$') ? amount : `₹${amount}`}**\n`;
    if (consumer) directAnswer += `• **Consumer / Recipient:** ${consumer}\n`;
    if (accountNo) directAnswer += `• **Account Number:** \`${accountNo}\`\n`;
    if (docDate) directAnswer += `• **Issue / Payment Date:** ${docDate}\n`;
    if (primaryDoc.expiryDate) directAnswer += `• **Expiry / Due Date:** ${primaryDoc.expiryDate}\n`;
    if (txId) directAnswer += `• **Transaction ID:** \`${txId}\`\n`;
    if (issuer) directAnswer += `• **Issuing Authority:** ${issuer}\n`;
    if (primaryDoc.summary && primaryDoc.summary !== 'Uploaded document stored securely in your encrypted DocVault.') {
      directAnswer += `• **Summary:** ${primaryDoc.summary}\n`;
    }

    return directAnswer.trim();
  }

  if (contextAssets.length > 0) {
    const asset = contextAssets[0];
    return `### Tracked Asset Details\n• **Asset:** ${asset.name} (${asset.category})\n• **Estimated Value:** ${asset.estimatedValue || 'N/A'}\n• **Status:** ${asset.status || 'Active'}\n• **Warranty Expiry:** ${asset.warrantyExpiry || 'N/A'}`;
  }

  return "I could not find matching records in your currently uploaded documents or tracked assets.";
}
