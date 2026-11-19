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
  // If no text was extracted, text is sparse, or missing critical fields (like date/identifiers), and imageBase64 is available, use Groq Multimodal Vision (Qwen 3.8 27B)
  const isSparseOrNeedsVision = (!rawText || rawText.trim().length < 250 || !/(?:date|issued|awarded|completion|receipt|invoice|policy|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i.test(rawText));
  if (isSparseOrNeedsVision && imageBase64) {
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
CORE OPERATING PRINCIPLE:
Provide an executive, production-grade response that is laser-focused, direct, and concise. Answer EXACTLY and ONLY what the user asked without dumping unrelated fields, excessive preamble, or redundant document metadata tables. The user can view the original document or asset flashcard directly for full context.

RULES:
1. Direct & Laser-Focused:
   - Provide the answer directly in your first sentence. Highlight critical values, dates, amounts, names, terms, and numbers in bold.
   - If the user asks for a date, state that specific date directly.
   - If the user asks for an amount, state that specific amount directly.
   - If the user asks for a specific clause, condition, term, notice period, or SLA, provide that exact clause/statement and cite the page number (e.g. "According to **[Document Title]** (Page 5): ...").
   - If the user asks about an asset/flashcard (e.g. MacBook, laptop, car, appliance, warranty), answer the specific requested field (warranty date, serial number, purchase date) directly.
   - Do NOT dump unrelated fields (like account numbers, transaction IDs, or other clauses) unless the user specifically asked for them.
2. Context-Aware Document / Flashcard Referral:
   - If answering primarily from an asset flashcard:
     Conclude your answer with: "*For complete details, you can open your asset flashcard directly below.*"
   - If answering primarily from a document:
     Conclude your answer with: "*For full details or complete verification, you can view the original document directly below.*"
   - If answering an overview or both:
     Conclude with: "*For full details, you can view the verified records directly below.*"
3. Strict Entity & Document Isolation:
   - If the user asks about a specific document (e.g. a certificate, policy, or electricity bill), answer strictly regarding that matching document. If multiple documents are in the context, do NOT substitute or cite an unrelated document (e.g. do not answer with an electricity bill when the user asked about a certificate).
   - If the matching document does not state the requested field (e.g. issue date), state clearly: "I could not find a recorded issue date on your **[Document Title]**", rather than borrowing details from another document.
   - If the user asks about an asset (such as MacBook), answer strictly regarding that asset and its linked records. Do NOT mention or cite unrelated documents (such as electricity bills, tax forms, or utilities) present in the context.
   - If the user asks about a document (such as an electricity bill), answer strictly regarding that document and do NOT mention unrelated assets.
4. Multi-Page Accuracy:
   - For multi-page documents (marked with "--- Page X ---"), thoroughly inspect all pages from Page 1 to Page 25 to find the exact statement or clause requested. Cite the specific page where the answer is found.
5. Not Found:
   - If neither the provided documents nor the tracked assets contain the answer after checking all available pages, reply cleanly:
     "I cannot find that information in your currently uploaded documents or tracked assets."
6. Professional & Crisp:
   - Keep answers clear, readable, and free of unnecessary introductory filler.

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
 * Locates the most relevant paragraph/clause across multi-page document text
 * and identifies the exact page number where it appears.
 */
export function findMatchingExcerptWithPage(text, queryTokens) {
  if (!text || !queryTokens || queryTokens.length === 0) return null;

  // Split into page sections if annotated
  const rawPages = text.split(/(?=--- Page \d+ ---)/g);
  const pages = [];

  for (const pageBlock of rawPages) {
    const pageMatch = pageBlock.match(/--- Page (\d+) ---/);
    const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : 1;
    const cleanContent = pageBlock.replace(/--- Page \d+ ---/g, '').trim();
    pages.push({ pageNum, content: cleanContent });
  }

  let bestParagraph = null;
  let bestScore = 0;
  let bestPage = 1;

  for (const p of pages) {
    const paragraphs = p.content
      .split(/\n+/)
      .map(l => l.trim())
      .filter(l => l.length > 15);

    for (const para of paragraphs) {
      const paraLower = para.toLowerCase();
      let score = 0;
      let matchedTokens = 0;

      for (const t of queryTokens) {
        if (paraLower.includes(t)) {
          matchedTokens++;
          score += 2;
          if (new RegExp(`\\b${t}\\b`, 'i').test(paraLower)) {
            score += 2;
          }
        }
      }

      if (score > bestScore && matchedTokens >= Math.min(2, queryTokens.length)) {
        bestScore = score;
        bestParagraph = para;
        bestPage = p.pageNum;
      }
    }
  }

  if (bestScore >= 4 && bestParagraph) {
    return { excerpt: bestParagraph, page: bestPage, score: bestScore };
  }
  return null;
}

/**
 * Deterministic Grounded Query Solver:
 * Directly extracts answers from verified document context or tracked asset flashcards
 * when live LLM execution is unavailable or rate-limited.
 */
export function answerWithDeterministicGrounding(question, contextDocs = [], contextAssets = []) {
  const lowerQ = (question || '').toLowerCase();
  const stopWords = new Set(['the', 'is', 'at', 'which', 'on', 'a', 'an', 'in', 'of', 'and', 'or', 'for', 'to', 'my', 'what', 'tell', 'show', 'give', 'me', 'about', 'this', 'that', 'with', 'from', 'have', 'i', 'as', 'please']);
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
  const isCertQ = /(?:certif|certf|degree|diploma|grade|score|course|university|college|completion|mark|award)/i.test(lowerQ);
  const isFinanceQ = /(?:amount|total|bill|invoice|gst|price|cost|paid|tax|expense|salary|statement|electricity)/i.test(lowerQ);
  const intentTokens = new Set(['date', 'issue', 'issued', 'due', 'expiry', 'expire', 'amount', 'total', 'price', 'cost', 'fee', 'who', 'name', 'account', 'number', 'status', 'summary', 'details']);

  let bestDoc = null;
  let bestDocScore = 0;
  for (const doc of contextDocs) {
    const title = (doc.title || '').toLowerCase();
    const category = (doc.category || '').toLowerCase();
    const text = (doc.extractedText || '').toLowerCase();

    let score = 0;
    for (const t of queryTokens) {
      const isIntent = intentTokens.has(t);
      const tokenRegex = (t === 'certificate' || t === 'certficate') ? /certif|certf/ : new RegExp(t);
      if (tokenRegex.test(title)) score += isIntent ? 2 : 10;
      if (tokenRegex.test(category)) score += isIntent ? 2 : 8;
      if (tokenRegex.test(text)) score += isIntent ? 0.5 : 3;
    }

    if (isCertQ) {
      if (category === 'academic certificate' || category === 'certificates' || /certif|certf/i.test(title)) {
        score += 15;
      }
      if (/bill|receipt|invoice|tax|salary|statement/i.test(title) || /purchase receipt|tax invoice|bank statement/i.test(category)) {
        score -= 20;
      }
    }

    if (isFinanceQ) {
      if (/bill|receipt|invoice|tax|salary|statement/i.test(title) || /purchase receipt|tax invoice|bank statement/i.test(category)) {
        score += 15;
      }
      if (category === 'academic certificate' || /certif|certf/i.test(title)) {
        score -= 20;
      }
    }

    if (score > bestDocScore) {
      bestDocScore = score;
      bestDoc = doc;
    }
  }

  // Determine Primary Target: Asset vs Document
  const preferAsset = (bestAssetScore > 0 && bestAssetScore > bestDocScore) || (bestAssetScore > 0 && bestDocScore === 0);

  // A. Answer from Asset Flashcard (Laser-focused, direct field response)
  if (preferAsset && bestAsset) {
    const asset = bestAsset;
    const isWarranty = /\b(?:warranty|expire|expiry|validity|guarantee)\b/i.test(lowerQ);
    const isSerial = /\b(?:serial|imei|chassis|engine|id|number|model)\b/i.test(lowerQ);
    const isPurchase = /\b(?:purchase|purchased|bought|buy)\b|(?:when\s+(?:did|was|i))/i.test(lowerQ);
    const isPrice = /\b(?:price|cost|amount|value|worth)\b/i.test(lowerQ);

    const customMap = {};
    (asset.customFields || []).forEach(f => {
      customMap[f.label.toLowerCase()] = f.value;
    });

    const docReferral = `\n\n*For complete details, you can open your asset flashcard directly below.*`;

    if (isWarranty && (asset.warrantyExpiry || customMap['warranty expiration'] || customMap['warranty'] || customMap['panel warranty'])) {
      const exp = asset.warrantyExpiry || customMap['warranty expiration'] || customMap['warranty'] || customMap['panel warranty'];
      return `The recorded warranty expiration for your **${asset.name}** is **${exp}**.${docReferral}`;
    }

    if (isSerial && (customMap['serial number'] || customMap['serial'] || customMap['engine number'] || customMap['chassis number'] || asset.metadata?.serialNumber)) {
      if (customMap['engine number']) {
        const eng = customMap['engine number'];
        const chs = customMap['chassis number'] ? ` (Chassis: \`${customMap['chassis number']}\`)` : '';
        return `The engine number for your **${asset.name}** is \`${eng}\`${chs}.${docReferral}`;
      }
      const sn = customMap['serial number'] || customMap['serial'] || customMap['chassis number'] || asset.metadata?.serialNumber;
      return `The serial number for your **${asset.name}** is \`${sn}\`.${docReferral}`;
    }

    if (isPurchase && (asset.purchaseDate || asset.description || asset.notes || customMap['purchase date'] || customMap['purchased'])) {
      const explicitDate = asset.purchaseDate || customMap['purchase date'] || customMap['purchased'] || customMap['date of purchase'];
      if (explicitDate) {
        return `The recorded purchase date for your **${asset.name}** is **${explicitDate}**.${docReferral}`;
      }
      const rawNotes = `${asset.description || ''} ${asset.notes || ''}`.trim();
      const dateMatch = rawNotes.match(/\b((?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?),?\s+\d{4}|\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}|\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4})\b/i);
      if (dateMatch) {
        const cleanDate = dateMatch[1].replace(/(\d+)(st|nd|rd|th)/i, '$1');
        const descSuffix = asset.description ? ` (${asset.description})` : '';
        return `The recorded purchase date for your **${asset.name}** is **${cleanDate}**${descSuffix}.${docReferral}`;
      }
      return `The purchase record for your **${asset.name}** indicates: ${asset.description || asset.notes}.${docReferral}`;
    }

    if (isPrice && (asset.estimatedValue || asset.purchasePrice || customMap['price'])) {
      const val = asset.estimatedValue || (asset.purchasePrice ? '₹' + asset.purchasePrice : customMap['price']);
      return `The recorded price/value for your **${asset.name}** is **${val}**.${docReferral}`;
    }

    // General flashcard query
    let record = `Here are the verified records for your **${asset.name}** (${asset.category || 'General'}):\n\n`;
    record += `• **Status:** ${asset.status || 'Active'}\n`;
    if (asset.warrantyExpiry || customMap['warranty expiration']) {
      record += `• **Warranty Expiration:** **${asset.warrantyExpiry || customMap['warranty expiration']}**\n`;
    }
    if (customMap['serial number'] || asset.metadata?.serialNumber) {
      record += `• **Serial Number:** \`${customMap['serial number'] || asset.metadata?.serialNumber}\`\n`;
    }
    if (asset.description) {
      record += `• **Description:** ${asset.description}\n`;
    }
    if (asset.estimatedValue || asset.purchasePrice) {
      record += `• **Estimated Value:** ${asset.estimatedValue || ('₹' + asset.purchasePrice)}\n`;
    }
    (asset.customFields || []).forEach(f => {
      if (!/warranty|serial/i.test(f.label)) {
        record += `• **${f.label}:** ${f.value}\n`;
      }
    });
    record += docReferral;
    return record;
  }

  // B. Answer from Document (Laser-focused on user's exact requested detail)
  if (bestDoc && bestDocScore > 0) {
    const primaryDoc = bestDoc;
    const text = primaryDoc.extractedText || '';
    const keyDetails = primaryDoc.keyDetails || {};

    const matchedExcerpt = findMatchingExcerptWithPage(text, queryTokens);

    const isDateQ = /(?:when\s+(?:was|is|did|are)|what\s+is\s+the\s+(?:due\s*date|bill\s*date|issue\s*date|expiry|payment\s*date|date)|due\s*date|expiry\s*date|expiration\s*date|date\s+of\s+issue|issued\s+on)/i.test(lowerQ);
    const isNameQ = /(?:who\s+is|who\s+issued|issued\s+to|whom|whose|consumer\s*name|customer\s*name|recipient\s*name|billed\s*to)/i.test(lowerQ);
    const isAccountQ = /(?:what\s+is\s+the\s+account|account\s*no|account\s*number|consumer\s*no|ca\s*no|policy\s*no)/i.test(lowerQ);
    const isTxIdQ = /(?:transaction\s*id|receipt\s*no|receipt\s*number|reference\s*number)/i.test(lowerQ);
    const isAmountQ = /(?:what\s+is\s+the\s+(?:total|amount|bill|cost|fee|price)|how\s*much|total\s*amount|bill\s*amount|payable\s*amount|total\s*due|net\s*payable)/i.test(lowerQ);

    const docReferral = `\n\n*For full details or complete verification, you can view the original document directly below.*`;

    // 1. Specific Clause / Multi-Page Excerpt Match (e.g. SLA, termination, liability, penalty, contract terms)
    const isPureMetadataQ = (isDateQ || isAmountQ || isNameQ || isAccountQ || isTxIdQ);
    if (matchedExcerpt && (!isPureMetadataQ || matchedExcerpt.score >= 8)) {
      return `According to **${primaryDoc.title}** (Page ${matchedExcerpt.page}):\n\n> ${matchedExcerpt.excerpt}${docReferral}`;
    }

    // 2. Amount Query
    if (isAmountQ) {
      let amount = keyDetails['TOTAL AMOUNT'] || keyDetails['Total Amount'] || keyDetails['Amount'] || keyDetails['AMOUNT'] || null;
      if (!amount) {
        const amountMatch = text.match(/(?:total\s*amount\s*(?:received|paid|due|payable)?|amount\s*(?:received|paid|due|payable)?|total\s*(?:received|paid|payable)?|grand\s*total|net\s*payable|bill\s*amount)[:.\s]*(?:₹|rs\.?|inr|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?(?:\s*\([^\)]+\))?(?:\s*only)?)/i);
        if (amountMatch) amount = amountMatch[1].trim();
      }
      if (amount) {
        const formattedAmt = amount.startsWith('₹') || amount.startsWith('$') ? amount : `₹${amount}`;
        return `The total amount for **${primaryDoc.title}** is **${formattedAmt}**.${docReferral}`;
      }
    }

    // 3. Consumer / Recipient Name Query
    if (isNameQ) {
      let consumer = keyDetails['CONSUMER NAME'] || keyDetails['Consumer Name'] || keyDetails['Recipient Name'] || keyDetails['RECIPIENT NAME'] || keyDetails['Owner Name'] || null;
      if (!consumer) {
        const consumerMatch = text.match(/(?:consumer\s*name|customer\s*name|billed\s*to|recipient(?:\s*name)?|name)[:.\s]+([A-Z][A-Za-z\s\/\.]{2,45})/i);
        if (consumerMatch) consumer = consumerMatch[1].trim().split('\n')[0];
      }
      if (consumer) {
        return `The document **${primaryDoc.title}** is issued to **${consumer}**.${docReferral}`;
      }
    }

    // 4. Account Number Query
    if (isAccountQ) {
      let accountNo = keyDetails['ACCOUNT NUMBER'] || keyDetails['Account No'] || keyDetails['ACCOUNT NO'] || keyDetails['Registration No'] || null;
      if (!accountNo) {
        const accMatch = text.match(/(?:account\s*no\.?|consumer\s*no\.?|ca\s*no\.?)[:.\s]*([A-Za-z0-9\-_]{4,25})/i);
        if (accMatch) accountNo = accMatch[1].trim();
      }
      if (accountNo) {
        return `The account number for **${primaryDoc.title}** is \`${accountNo}\`.${docReferral}`;
      }
    }

    // 5. Transaction ID Query
    if (isTxIdQ) {
      let txId = keyDetails['TRANSACTION ID'] || keyDetails['Transaction ID'] || null;
      if (!txId) {
        const txMatch = text.match(/(?:transaction\s*id\.?|receipt\s*no\.?|bill\s*no\.?)[:.\s]*([A-Za-z0-9\-_]{5,35})/i);
        if (txMatch) txId = txMatch[1].trim();
      }
      if (txId) {
        return `The transaction ID for **${primaryDoc.title}** is \`${txId}\`.${docReferral}`;
      }
    }

    // 6. Date Query
    if (isDateQ) {
      let docDate = primaryDoc.documentDate || keyDetails['ISSUE DATE'] || keyDetails['Issue Date'] || keyDetails['DOCUMENT DATE'] || keyDetails['Document Date'] || null;
      if (!docDate) {
        const dateMatch = text.match(/(?:collection\s*date|printed\s*date|payment\s*date|bill\s*date|issue\s*date|due\s*date|date[:.\s-]*|[¢|~]?\s*)([0-9]{1,2}[-\/.][0-9]{1,2}[-\/.][0-9]{2,4})/i);
        if (dateMatch) {
          const raw = dateMatch[1].trim();
          docDate = normalizeDateToIso(raw) || raw;
        }
      }
      if (docDate || primaryDoc.expiryDate) {
        const dateStr = docDate ? `**${docDate}**` : '';
        const expiryStr = primaryDoc.expiryDate ? ` (due: **${primaryDoc.expiryDate}**)` : '';
        return `The recorded date for **${primaryDoc.title}** is ${dateStr}${expiryStr}.${docReferral}`;
      } else {
        return `I could not find a recorded issue date on your **${primaryDoc.title}**.${docReferral}`;
      }
    }

    // 7. Fallback: Excerpt or Summary
    if (matchedExcerpt) {
      return `According to **${primaryDoc.title}** (Page ${matchedExcerpt.page}):\n\n> ${matchedExcerpt.excerpt}${docReferral}`;
    }

    return `Here are the verified records for **${primaryDoc.title}** (${primaryDoc.category}):\n\n` +
      (primaryDoc.summary ? `• **Summary:** ${primaryDoc.summary}\n` : '') +
      (primaryDoc.documentDate ? `• **Date:** ${primaryDoc.documentDate}\n` : '') +
      docReferral;
  }

  // C. Overview Query Support
  const isOverviewQuery = /(?:all|every|overview|summarize|summary|inventory|list|what\s*(?:do\s*i\s*have|are\s*my\s*documents|documents\s*do\s*i\s*have|assets\s*do\s*i\s*have|is\s*in\s*my\s*vault)|my\s*vault)/i.test(lowerQ);
  if (isOverviewQuery && (contextDocs.length > 0 || contextAssets.length > 0)) {
    let summary = `### Vault Summary\n`;
    if (contextAssets.length > 0) {
      summary += `\n**Tracked Assets & Flashcards:**\n`;
      contextAssets.forEach(a => {
        summary += `• **${a.name}** (${a.category || 'General'})\n`;
      });
    }
    if (contextDocs.length > 0) {
      summary += `\n**Verified Stored Documents:**\n`;
      contextDocs.forEach(d => {
        summary += `• **${d.title}** (${d.category || 'Document'})\n`;
      });
    }
    summary += `\n*You can tap any document or flashcard below to open and view it directly.*`;
    return summary.trim();
  }

  return 'I could not find matching records in your currently uploaded documents or tracked assets.';
}
