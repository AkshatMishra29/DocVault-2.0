import Groq from 'groq-sdk';
import { config } from '../../config/index.js';

const groq = new Groq({
  apiKey: config.groq.apiKey,
});

/**
 * Extract structured metadata, entity fields, and expiry dates from document text
 */
export async function extractDocumentMetadata(rawText, filename, imageBase64 = null) {
  // If no text was extracted (e.g. image document or scanned PDF), use Groq Multimodal Vision (Qwen 3.8 27B)
  if ((!rawText || rawText.trim().length < 20) && imageBase64) {
    try {
      console.log(`[Groq Vision OCR] Attempting visual multimodal extraction for: ${filename} using qwen/qwen3.8-27b...`);
      const visionPrompt = `You are the DocVault AI Document Vision Engine.
Analyze the provided document image and extract its complete content and metadata. Return ONLY a valid JSON object (no markdown, no backticks):
{
  "title": "A short, descriptive title for this document (e.g., 'Honda City Comprehensive Insurance Policy')",
  "category": "Document category (e.g. 'Tax Invoice', 'Purchase Receipt', 'Insurance Policy', 'Warranty Document', 'Medical Report', 'Admit Card', 'Academic Certificate', 'Bank Statement', 'Identity Document', 'Other')",
  "summary": "A concise 2-3 sentence executive summary explaining what this document is and any critical policy numbers or conditions.",
  "expiryDate": "YYYY-MM-DD format if an expiration, renewal, or warranty end date is present, otherwise null",
  "keyDetails": {
    "Key Name (e.g. Policy Number, Account Number, Serial Number, Date)": "Value"
  },
  "tags": ["array", "of", "3-5", "relevant", "search", "keywords"],
  "extractedText": "Full readable transcription of all text detected in this document"
}
Filename: ${filename}`;

      const visionResponse = await groq.chat.completions.create({
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
      return parsed;
    } catch (visionErr) {
      console.warn('[Groq Vision Warning] Vision fallback failed, proceeding with text-based model:', visionErr.message);
    }
  }

  const prompt = `You are the DocVault AI Extraction Engine.
Analyze the following document text and return ONLY a valid JSON object (no markdown, no backticks, no commentary).

Extract the following fields:
{
  "title": "A short, descriptive title for this document (e.g., 'Honda City Comprehensive Insurance Policy')",
  "category": "Document category (e.g. 'Tax Invoice', 'Purchase Receipt', 'Insurance Policy', 'Warranty Document', 'Medical Report', 'Admit Card', 'Academic Certificate', 'Bank Statement', 'Identity Document', 'Other')",
  "summary": "A concise 2-3 sentence executive summary explaining what this document is and any critical policy numbers or conditions.",
  "expiryDate": "YYYY-MM-DD format if an expiration, renewal, or warranty end date is present, otherwise null",
  "keyDetails": {
    "Key Name (e.g. Policy Number, Sum Insured, Serial Number, Premium)": "Value"
  },
  "tags": ["array", "of", "3-5", "relevant", "search", "keywords"]
}

Filename: ${filename}
Document Text:
${rawText ? rawText.slice(0, 4000) : 'No OCR text available. Infer from filename.'}
`;

  try {
    const response = await groq.chat.completions.create({
      model: config.groq.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    return parsed;
  } catch (err) {
    console.error('[Groq] Metadata extraction failed:', err.message);
    return {
      title: filename.replace(/\.[^/.]+$/, ''),
      category: 'Other',
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
Summary: ${doc.summary || 'N/A'}
Key Details: ${JSON.stringify(doc.keyDetails || {})}
Expiry Date: ${doc.expiryDate || 'N/A'}
Full Extracted Content / Notes: ${doc.extractedText ? doc.extractedText.slice(0, 3000) : 'N/A'}
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
2. Answer the user's question directly, professionally, and accurately using ONLY the provided verified document records and tracked asset inventory below.
3. NEVER assume, hallucinate, or fabricate information from external sources.
4. If neither the provided documents nor the tracked assets contain the answer, reply cleanly:
"I cannot find that information in your currently uploaded documents or tracked assets."
5. FORMATTING: Structure your responses cleanly with clear headings, bullet points, and highlight key identifiers (dates, policy numbers, amounts, contact info). Be professional, crisp, and direct.

CONTEXT - TRACKED ASSETS:
${assetContextString}

CONTEXT - STORED DOCUMENTS:
${docContextString}

USER QUESTION:
${question}
`;

  try {
    // Prefer powerful text model openai/gpt-oss-120b for Q&A, fallback to config model
    const chatModel = 'openai/gpt-oss-120b';
    const response = await groq.chat.completions.create({
      model: chatModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 1000,
    });

    return response.choices[0].message.content;
  } catch (err) {
    console.warn(`[Groq] Chat query with primary model failed, trying fallback (${config.groq.model}):`, err.message);
    try {
      const response = await groq.chat.completions.create({
        model: config.groq.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 600,
      });
      return response.choices[0].message.content;
    } catch (fallbackErr) {
      console.error('[Groq] Chat query failed:', fallbackErr.message);
      throw fallbackErr;
    }
  }
}
