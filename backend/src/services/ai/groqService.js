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
 * Resilient Groq execution with multi-model fallback chain and fail-fast timeouts
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
      }, { timeout: 10000 });
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
/**
 * Extracts a query-relevant context window from multi-page documents
 * ensuring specific clauses, page markers, and customer sections are preserved.
 */
export function extractRelevantContextWindow(fullText, question, budget = 45000) {
  if (!fullText || fullText.length <= budget) {
    return fullText || '';
  }

  const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'in', 'of', 'and', 'or', 'for', 'to', 'my', 'what', 'tell', 'show', 'give', 'me', 'about', 'this', 'that', 'with', 'from', 'have', 'i', 'as', 'please']);
  const queryTokens = (question || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !stopWords.has(t));

  // Split into page sections if available, else paragraphs
  const rawSections = fullText.split(/(?=--- Page \d+ ---)/g);
  const sections = rawSections.length > 1 ? rawSections : fullText.split(/\n\s*\n/);

  // Always keep Section 1 (first page / metadata / introductory terms)
  let result = sections[0].trim();
  let currentLength = result.length;

  const scoredSections = sections.slice(1).map(sec => {
    const secLower = sec.toLowerCase();
    let score = 0;
    for (const t of queryTokens) {
      if (secLower.includes(t)) score += 1;
    }
    return { sec: sec.trim(), score, len: sec.length };
  });

  // Prioritize sections with keyword hits
  scoredSections.sort((a, b) => b.score - a.score);

  const selectedExtraSections = [];
  for (const item of scoredSections) {
    if (currentLength + item.len + 50 <= budget) {
      selectedExtraSections.push(item.sec);
      currentLength += item.len + 50;
    }
  }

  if (selectedExtraSections.length > 0) {
    result += '\n\n[... Additional Multi-Page Sections ...]\n\n' + selectedExtraSections.join('\n\n');
  }

  return result.slice(0, budget);
}

/**
 * Answer questions based on retrieved document context and tracked assets (RAG Q&A)
 */
export async function answerDocumentQuery(question, contextDocs = [], contextAssets = []) {
  // Support deep context budget: single targeted document gets up to 45,000 characters
  // Multi-document queries get up to 18,000 characters per document
  const maxDocChars = contextDocs.length === 1 ? 45000 : (contextDocs.length <= 3 ? 18000 : 10000);

  const docContextString = contextDocs.length > 0 ? contextDocs.map((doc, idx) => {
    let content = (doc.extractedText || '').trim();
    if (content.length > maxDocChars) {
      content = extractRelevantContextWindow(content, question, maxDocChars);
    }

    return `
[Document ${idx + 1}]: "${doc.title}" (Category: ${doc.category || 'General'}, Pages: ${doc.pageCount || 1})
Primary Document Date / Issue Date: ${doc.documentDate || doc.keyDetails?.['Issue Date'] || doc.keyDetails?.['Date'] || doc.keyDetails?.['Date of Issue'] || doc.keyDetails?.['ISSUE DATE'] || 'N/A'}
Expiry / Due Date: ${doc.expiryDate || doc.keyDetails?.['Expiry Date'] || doc.keyDetails?.['EXPIRY DATE'] || 'N/A'}
Summary: ${doc.summary || 'N/A'}
Key Structured Details: ${JSON.stringify(doc.keyDetails || {})}
Extracted Document Content / Text:
${content || 'N/A'}
`;
  }).join('\n---\n') : 'No documents found.';

  const assetContextString = contextAssets.length > 0 ? contextAssets.map((asset, idx) => {
    const customFieldsFormatted = (asset.customFields && asset.customFields.length > 0)
      ? asset.customFields.map(f => `${f.label}: ${f.value}`).join(' | ')
      : 'None';

    const metadataFormatted = (asset.metadata && Object.keys(asset.metadata).length > 0)
      ? Object.entries(asset.metadata).map(([k, v]) => `${k}: ${v}`).join(' | ')
      : 'None';

    return `
[Asset ${idx + 1} - Flashcard]: "${asset.name}" (Category: ${asset.category || 'General'})
Status: ${asset.status || 'Active'}
Estimated Value / Price: ${asset.estimatedValue || (asset.purchasePrice ? `₹${asset.purchasePrice}` : 'N/A')}
Purchase Date: ${asset.purchaseDate || 'N/A'}
Warranty Expiration: ${asset.warrantyExpiry || 'N/A'}
Insurance Expiration: ${asset.insuranceExpiry || 'N/A'}
Next Scheduled Service: ${asset.nextService || 'N/A'}
Description / Purchase Notes: ${asset.description || 'N/A'}
Additional Notes: ${asset.notes || 'N/A'}
Custom Flashcard Fields: ${customFieldsFormatted}
Technical Specs & Metadata: ${metadataFormatted}
Tags: ${(asset.tags || []).join(', ') || 'None'}
`;
  }).join('\n---\n') : 'No tracked assets found.';

  const prompt = `You are the DocVault AI Assistant.
SECURITY & ACCURACY RULES:
1. You operate strictly within the user's isolated encrypted DocVault ecosystem.
2. Answer the user's question directly, professionally, and accurately using the provided verified document records and tracked asset flashcards below.
3. For multi-page documents (marked with "--- Page X ---"), thoroughly inspect all pages from Page 1 to Page 25. When the user asks about specific content, customer details, clauses, terms, conditions, numbers, or statements, locate and extract the specific content from the corresponding page, and cite the page number (e.g. "On Page 5...", "According to Page 11...").
4. If the user asks about an item, device, vehicle, warranty, or flashcard (e.g. laptop, MacBook, car, appliance, gadget, serial number), check "CONTEXT - TRACKED ASSETS & FLASHCARDS" first.
5. If the user asks about an uploaded document (e.g. bill, invoice, certificate, policy, customer agreement), check "CONTEXT - STORED DOCUMENTS".
6. If the user is asking a conversational greeting or overview (such as "hi", "hello", "what can you do?", "how does DocVault work?"), respond politely, introduce yourself as the DocVault AI Assistant, and briefly explain how you can help analyze and answer questions about their encrypted documents and tracked asset flashcards.
7. When asked about DATES or WARRANTY (e.g. "when was my macbook purchased?", "when does it expire?", "warranty details"), inspect Warranty Expiration, Purchase Date, Description, and Custom Flashcard Fields.
8. State dates, serial numbers, amounts, and critical entities directly and prominently in bold.
9. If neither the provided documents nor the tracked assets contain the answer after checking all available pages, reply cleanly:
"I cannot find that information in your currently uploaded documents or tracked assets."
10. Structure your responses cleanly with clear headings, bullet points, and highlight key identifiers.

CONTEXT - TRACKED ASSETS & FLASHCARDS:
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
      max_tokens: 1200,
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
 * Directly extracts answers from verified document context or tracked asset flashcards
 * when live LLM execution is unavailable or rate-limited.
 */
export function answerWithDeterministicGrounding(question, contextDocs = [], contextAssets = []) {
  const lowerQ = (question || '').toLowerCase();
  const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'in', 'of', 'and', 'or', 'for', 'to', 'my', 'what', 'tell', 'show', 'give', 'me', 'about', 'this', 'that', 'with', 'from', 'have', 'i', 'as']);
  const queryTokens = lowerQ.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t.length > 1 && !stopWords.has(t));

  // 1. Evaluate Asset Match
  let bestAsset = null;
  let bestAssetScore = 0;
  for (const asset of contextAssets) {
    const name = (asset.name || '').toLowerCase();
    const category = (asset.category || '').toLowerCase();
    const desc = (asset.description || '').toLowerCase();
    const customFieldsStr = (asset.customFields || []).map(f => `${f.label} ${f.value}`).join(' ').toLowerCase();

    let score = 0;
    for (const t of queryTokens) {
      if (name.includes(t)) score += 8;
      if (category.includes(t)) score += 4;
      if (customFieldsStr.includes(t)) score += 6;
      if (desc.includes(t)) score += 3;
    }
    if (score > bestAssetScore) {
      bestAssetScore = score;
      bestAsset = asset;
    }
  }

  // 2. Evaluate Document Match
  let bestDoc = null;
  let bestDocScore = 0;
  for (const doc of contextDocs) {
    const title = (doc.title || '').toLowerCase();
    const category = (doc.category || '').toLowerCase();
    const text = (doc.extractedText || '').toLowerCase();

    let score = 0;
    for (const t of queryTokens) {
      if (title.includes(t)) score += 8;
      if (category.includes(t)) score += 4;
      if (text.includes(t)) score += 2;
    }
    if (score > bestDocScore) {
      bestDocScore = score;
      bestDoc = doc;
    }
  }

  // Determine Primary Target: Asset vs Document
  const preferAsset = (bestAssetScore > 0 && bestAssetScore > bestDocScore) || (bestAssetScore > 0 && bestDocScore === 0);

  // A. Answer from Asset Flashcard
  if (preferAsset && bestAsset) {
    const asset = bestAsset;
    const isWarranty = /(?:warranty|expire|expiry|validity|guarantee)/i.test(lowerQ);
    const isSerial = /(?:serial|imei|chassis|engine|id|number|model)/i.test(lowerQ);
    const isPurchase = /(?:purchase|bought|buy|when|date)/i.test(lowerQ);
    const isPrice = /(?:price|cost|amount|value|worth)/i.test(lowerQ);

    const customMap = {};
    (asset.customFields || []).forEach(f => {
      customMap[f.label.toLowerCase()] = f.value;
    });

    let directHighlight = '';
    if (isWarranty && (asset.warrantyExpiry || customMap['warranty expiration'] || customMap['warranty'])) {
      const exp = asset.warrantyExpiry || customMap['warranty expiration'] || customMap['warranty'];
      directHighlight = `The recorded warranty expiration for your **${asset.name}** is **${exp}**.\n\n`;
    } else if (isSerial && (customMap['serial number'] || customMap['serial'] || asset.metadata?.serialNumber)) {
      const sn = customMap['serial number'] || customMap['serial'] || asset.metadata?.serialNumber;
      directHighlight = `The serial number for your **${asset.name}** is **${sn}**.\n\n`;
    } else if (isPurchase && (asset.purchaseDate || asset.description)) {
      directHighlight = `The purchase record for your **${asset.name}** indicates: **${asset.purchaseDate || asset.description}**.\n\n`;
    } else if (isPrice && (asset.estimatedValue || asset.purchasePrice || customMap['price'])) {
      directHighlight = `The recorded value/price for your **${asset.name}** is **${asset.estimatedValue || (asset.purchasePrice ? '₹' + asset.purchasePrice : customMap['price'])}**.\n\n`;
    } else {
      directHighlight = `Here are the verified records from your vault for **${asset.name}** (${asset.category}):\n\n`;
    }

    let record = `### Verified Asset Record (Flashcard)\n`;
    record += `• **Asset Name:** ${asset.name} (${asset.category || 'General'})\n`;
    record += `• **Status:** ${asset.status || 'Active'}\n`;
    if (asset.warrantyExpiry || customMap['warranty expiration']) {
      record += `• **Warranty Expiration:** **${asset.warrantyExpiry || customMap['warranty expiration']}**\n`;
    }
    if (customMap['serial number'] || asset.metadata?.serialNumber) {
      record += `• **Serial Number:** \`${customMap['serial number'] || asset.metadata?.serialNumber}\`\n`;
    }
    if (asset.description) {
      record += `• **Description / Purchase Note:** ${asset.description}\n`;
    }
    if (asset.estimatedValue || asset.purchasePrice) {
      record += `• **Estimated Value:** ${asset.estimatedValue || ('₹' + asset.purchasePrice)}\n`;
    }
    (asset.customFields || []).forEach(f => {
      if (!/warranty|serial/i.test(f.label)) {
        record += `• **${f.label}:** ${f.value}\n`;
      }
    });

    return directHighlight + record;
  }

  // B. Answer from Document
  if (contextDocs.length > 0) {
    const primaryDoc = bestDoc || contextDocs[0];
    const text = primaryDoc.extractedText || '';
    const keyDetails = primaryDoc.keyDetails || {};

    const isDateQ = /(?:when|date|day|month|year|expiry|expire|due\s*date|issued|collection|printed)/i.test(lowerQ);
    const isNameQ = /(?:who|name|consumer|customer|recipient|person|whom|billed\s*to)/i.test(lowerQ);
    const isAccountQ = /(?:account\s*no|account\s*number|consumer\s*no|ca\s*no|receipt\s*no|transaction\s*id|policy\s*no)/i.test(lowerQ);
    const isAmountQ = /(?:amount|how\s*much|cost|price|total|payable|paid|fee|charge|balance|bill\s*amount|bill\s*total)/i.test(lowerQ);

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

    // 7. Search for specific content matching user query tokens across multi-page text
    if (queryTokens.length > 0 && text) {
      const matchingExcerpts = [];
      const paragraphs = text.split(/\n+/).map(l => l.trim()).filter(l => l.length > 15);
      for (const p of paragraphs) {
        const pLower = p.toLowerCase();
        const hits = queryTokens.filter(t => pLower.includes(t)).length;
        if (hits >= Math.min(2, queryTokens.length)) {
          matchingExcerpts.push(p);
          if (matchingExcerpts.length >= 3) break;
        }
      }
      if (matchingExcerpts.length > 0) {
        directAnswer += `\n**Relevant Document Content:**\n` + matchingExcerpts.map(e => `> ${e}`).join('\n\n') + '\n';
      }
    }

    return directAnswer.trim();
  }

  // C. Fallback to Asset if any exists
  if (contextAssets.length > 0) {
    const asset = contextAssets[0];
    return `### Tracked Asset Details\n• **Asset:** ${asset.name} (${asset.category || 'General'})\n• **Estimated Value:** ${asset.estimatedValue || 'N/A'}\n• **Status:** ${asset.status || 'Active'}\n• **Warranty Expiry:** ${asset.warrantyExpiry || 'N/A'}`;
  }

  return "I could not find matching records in your currently uploaded documents or tracked assets.";
}
