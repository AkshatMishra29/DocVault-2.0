import Groq from 'groq-sdk';
import { config } from '../../config/index.js';
import { normalizeDateToIso } from '../../modules/extraction/ruleExtraction.service.js';
import { classifyConversationalIntent } from '../../modules/ai/conversationalIntent.service.js';

function getGroqClient() {
  const apiKey = (config.groq.apiKey || process.env.GROQ_API_KEY || '').trim();
  return new Groq({ apiKey });
}

const CANDIDATE_CHAT_MODELS = [
  config.groq.model,
  'qwen/qwen3.8-27b',             // High-speed (380ms) multimodal 27B model for reliable production chat
  'openai/gpt-oss-120b',          // 120-Billion parameter flagship model for deep logic & complex reasoning
  'openai/gpt-oss-20b',           // Fast 20B reasoning model
  'openai/gpt-oss-safeguard-20b', // Safety fallback
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
      const isReasoningModel = model.includes('120b') || model.includes('20b');
      const timeoutMs = isReasoningModel ? 25000 : 10000;
      const requestedMaxTokens = params.max_tokens || 2500;
      const effectiveMaxTokens = isReasoningModel ? Math.max(requestedMaxTokens, 3000) : requestedMaxTokens;

      const response = await groq.chat.completions.create({
        ...params,
        model,
        max_tokens: effectiveMaxTokens,
      }, { timeout: timeoutMs });

      const content = response.choices?.[0]?.message?.content?.trim() || '';
      if (!content) {
        throw new Error(`Model ${model} returned empty content (reasoning exhausted tokens or finished on length)`);
      }
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
Analyze the provided document image (such as a resume, CV, academic certificate, project architecture, invoice, policy, receipt, or identity card) and extract its complete content and metadata.
Pay special attention to candidate/recipient names, project titles, technical skills, dates (issue date, graduation, experience duration), organization names, credential IDs, and all readable text.

Return ONLY a valid JSON object (no markdown, no backticks):
{
  "title": "A short, descriptive title for this document (e.g. 'Akshat Mishra - Full Stack AI Engineer Resume' or 'Stanford Machine Learning Certificate')",
  "category": "One of: 'Resume / CV', 'Technical Architecture', 'Project Portfolio', 'Academic Certificate', 'Tax Invoice', 'Purchase Receipt', 'Insurance Policy', 'Warranty Document', 'Medical Report', 'Admit Card', 'Bank Statement', 'Identity Document', 'Employment Document', 'Other'",
  "documentDate": "Primary document date (e.g. Issue Date, Certificate Award Date, Resume Date, Invoice Date, Completion Date) in YYYY-MM-DD or readable format if found, otherwise null",
  "expiryDate": "YYYY-MM-DD format if an expiration, renewal, or validity end date is present, otherwise null",
  "summary": "A concise 2-3 sentence executive summary explaining what this document is, recipient/candidate, and critical facts or technical projects.",
  "keyDetails": {
    "Candidate or Recipient Name": "Name of candidate/person if present",
    "Current Title / Role": "Professional title or target role if resume",
    "Core Skills / Tech Stack": "Key technologies, programming languages, and frameworks",
    "Projects": "Key project names and descriptions mentioned",
    "Issuing Organization": "Institution, University, Company, or Authority",
    "Certificate or Credential ID": "Certificate No, Roll No, or ID if present",
    "Issue Date": "Date issued, awarded, or signed",
    "Course or Program": "Course/degree title if applicable",
    "Additional Details": "Any other critical numbers, links, or values"
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
Extract all critical metadata, paying special attention to candidate/recipient names, technical skills, projects, certificate dates, issuing organizations, and identifiers.

{
  "title": "A short, descriptive title for this document (e.g. 'Akshat Mishra - Full Stack AI Engineer Resume' or 'Stanford Machine Learning Certificate')",
  "category": "One of: 'Resume / CV', 'Technical Architecture', 'Project Portfolio', 'Academic Certificate', 'Tax Invoice', 'Purchase Receipt', 'Insurance Policy', 'Warranty Document', 'Medical Report', 'Admit Card', 'Bank Statement', 'Identity Document', 'Employment Document', 'Other'",
  "documentDate": "Primary date of this document (e.g. Issue Date, Certificate Date, Resume Date, Invoice Date, Award Date, Completion Date) in YYYY-MM-DD or readable format if found, otherwise null",
  "expiryDate": "YYYY-MM-DD format if an expiration, renewal, or warranty end date is present, otherwise null",
  "summary": "A concise 2-3 sentence executive summary explaining what this document is, recipient/candidate, and key technical facts or projects.",
  "keyDetails": {
    "Candidate or Recipient Name": "Name of candidate/person if present",
    "Current Title / Role": "Professional title or role if resume",
    "Core Skills / Tech Stack": "Key technologies, programming languages, and frameworks",
    "Projects": "Key project names and descriptions mentioned",
    "Issuing Organization": "Institution, Company, or Authority",
    "Certificate or Credential ID": "Certificate No, Roll No, or ID if present",
    "Issue Date": "Date issued, awarded, or signed",
    "Course or Program": "Course/degree title if applicable"
  },
  "tags": ["array", "of", "3-5", "relevant", "search", "keywords"]
}

Filename: ${filename}
Document Text:
${rawText ? rawText.slice(0, 24000) : 'No OCR text available. Infer from filename.'}
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
  // Support deep context budget: single targeted document gets up to 60,000 characters
  // Multi-document queries get up to 25,000 characters per document
  const maxDocChars = contextDocs.length === 1 ? 60000 : (contextDocs.length <= 3 ? 25000 : 12000);

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
Provide an executive, beautifully formatted production-grade response grounded strictly in the provided documents and tracked assets. Adapt your formatting dynamically to the user's intent: provide rich, itemized, structured Markdown when asked for resumes, profiles, certifications, or bills; provide direct laser-focused answers when asked for a specific single fact.

FORMATTING BLUEPRINTS BY INTENT:
1. Resumes, CVs, Profiles & Work History:
   - When the user asks for a resume, detailed content, profile, career history, or skills:
     Do NOT summarize into a single sentence. Render a rich, comprehensive candidate profile:
     ### 📄 [Candidate Name] - [Professional Focus / Role]
     #### 🎯 Professional Summary
     [2-3 sentence impactful executive summary]
     #### 📜 Certifications & Accreditations
     • **[Certification Name]** - [Issuing Body / Academy] ([Date/Year if present])
     #### 💻 Technical Skills & Competencies
     • **Core Stack:** [Languages, frameworks, e.g. Node.js, SAP, Python, React]
     • **Tools & Platforms:** [Databases, Cloud, DevOps, Tools]
     #### 💼 Work Experience
     • **[Role / Company]** ([Dates]): [Key responsibilities, measurable impacts, and systems built]
     #### 🚀 Featured Projects
     • **[Project Title]:** [Overview and tech stack]
     #### 🎓 Education
     • [Degree / Institution / Graduation Year]

2. Certifications & Credentials Queries:
   - When the user asks for certifications (e.g. "give me the list of certifications", "certifications present in it"):
     Provide an itemized, numbered or bulleted list of all certifications extracted from the document:
     ### 📜 Verified Certifications & Credentials in **[Document Title]**
     1. **[Certification 1]** - [Issuing Organization/Body] ([Year/Status if known])
     2. **[Certification 2]** - ...
     • **Candidate / Credential Holder:** **[Candidate Name]**

3. Financial Documents, Utility Bills, Invoices & Receipts:
   - When the user asks about an electricity bill, tax invoice, or purchase receipt:
     Render a clean, high-clarity key metrics card:
     ### ⚡ Verified Details for **[Document Title]**
     • **Consumer / Billed To:** **[Name]**
     • **Account / Consumer ID:** \`[Account Number]\`
     • **Service Provider / Issuer:** [Utility or Company Name]
     • **Total Amount:** **[Amount in ₹ or $]**
     • **Billing / Payment Date:** **[YYYY-MM-DD]**
     • **Status:** Verified Record

4. Academic & Professional Certificates:
   - When asked about an academic certificate or award:
     ### 🎓 [Certificate Title]
     • **Recipient:** **[Candidate Name]**
     • **Issuing Authority:** [University / Academy / Company]
     • **Completion / Award Date:** **[YYYY-MM-DD]**
     • **Credential / Verification ID:** \`[ID if present]\`

5. Single-Fact or Specific Clause Queries:
   - When asked for a specific date, amount, account number, or contractual clause/SLA:
     State the exact answer directly in bold in your first sentence, and cite the exact page number (e.g. "According to **[Document Title]** (Page 5): ...").

RULES:
- Strict Entity Isolation: If the user asks about a resume, do NOT cite or mention an electricity bill. If the user asks about an electricity bill, do NOT cite a certificate or resume.
- Referral Notice: Conclude document answers with "*For full details or complete verification, you can view the original document directly below.*"
- Conclude asset flashcard answers with "*For complete details, you can open your asset flashcard directly below.*"
- Not Found: If the answer is not contained in the context, state cleanly: "I cannot find that information in your currently uploaded documents or tracked assets."

CONTEXT - TRACKED ASSETS & FLASHCARDS:
${assetContextString}

CONTEXT - STORED DOCUMENTS:
${docContextString}

USER QUESTION:
${question}
`;

  try {
    const response = await executeGroqChatCompletion({
      model: config.groq.model || 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 2500,
    });

    return response.choices[0].message.content;
  } catch (err) {
    console.warn('[Groq] Chat query fallback across candidate models:', err.message);
    // Deterministic grounding fallback: answers the user's specific query using verified document facts
    return answerWithDeterministicGrounding(question, contextDocs, contextAssets);
  }
}

/**
 * Robust extraction of structured resume sections directly from OCR text
 */
export function parseStructuredResume(text, doc = {}) {
  const rawLines = (text || '').split(/\n+/).map(l => l.trim()).filter(Boolean);
  const cleanLines = rawLines.filter(l => !/^(?:--- Page \d+ ---|page \d+ of \d+)$/i.test(l));

  // 1. Candidate Name Detection
  let candidateName = doc.keyDetails?.['Candidate or Recipient Name'] || doc.keyDetails?.['Candidate Name'] || null;
  if (!candidateName) {
    for (const line of cleanLines.slice(0, 10)) {
      const clean = line.replace(/^(?:resume|cv|curriculum\s*vitae)[\s:\-_]*/i, '').trim();
      if (/^[A-Z][a-zA-Z\s\.]{2,40}$/.test(clean) && !/(?:email|phone|address|summary|skills|experience|education|github|linkedin|roles|profile)/i.test(clean)) {
        candidateName = clean;
        break;
      }
    }
  }

  // 2. Section Extraction
  const certLines = [];
  const skillLines = [];
  const expLines = [];
  const eduLines = [];
  const summaryLines = [];

  let currentSection = null;

  for (const line of cleanLines) {
    const lowerLine = line.toLowerCase();

    // Section header detection
    if (/^(?:certifications?|certificates?|licenses?|credentials?|accreditations?)\b/i.test(line)) {
      currentSection = 'certs';
      continue;
    } else if (/^(?:skills?|technical\s*skills?|core\s*competencies|tech\s*stack|technologies)\b/i.test(line)) {
      currentSection = 'skills';
      continue;
    } else if (/^(?:experience|work\s*experience|employment\s*history|professional\s*experience)\b/i.test(line)) {
      currentSection = 'exp';
      continue;
    } else if (/^(?:education|academic\s*background|qualifications|degrees?)\b/i.test(line)) {
      currentSection = 'edu';
      continue;
    } else if (/^(?:summary|professional\s*summary|profile|about\s*me|objective)\b/i.test(line)) {
      currentSection = 'summary';
      continue;
    } else if (/^(?:projects?|technical\s*projects?)\b/i.test(line)) {
      currentSection = 'projects';
      continue;
    }

    // Accumulate lines by active section
    if (currentSection === 'certs') {
      if (line.length > 3) certLines.push(line.replace(/^[•\-\*\d\.\)\s]+/, '').trim());
    } else if (currentSection === 'skills') {
      if (line.length > 2) skillLines.push(line.replace(/^[•\-\*\s]+/, '').trim());
    } else if (currentSection === 'exp') {
      if (line.length > 3) expLines.push(line.replace(/^[•\-\*\s]+/, '').trim());
    } else if (currentSection === 'edu') {
      if (line.length > 3) eduLines.push(line.replace(/^[•\-\*\s]+/, '').trim());
    } else if (currentSection === 'summary') {
      if (line.length > 3) summaryLines.push(line.trim());
    }

    // Direct standalone line pattern matching for certifications (catches certifications mentioned anywhere)
    if (/(?:certified|certification|certificate\s*of|sap\s*certified|aws\s*certified|google\s*certified|azure\s*certified|academy)\b/i.test(line)) {
      const cleanCert = line.replace(/^[•\-\*\d\.\)\s]+/, '').trim();
      if (currentSection !== 'summary' && cleanCert.length < 80) {
        if (!certLines.includes(cleanCert) && cleanCert.length > 5) {
          certLines.push(cleanCert);
        }
      } else {
        // Extract the exact certification title from a long sentence
        const certSubMatch = cleanCert.match(/((?:SAP|AWS|Google|Azure|Microsoft|AMD|Oracle|Cisco|Coursera)?\s*(?:Certified|Certificate\s*of)[A-Za-z0-9\s\-]+?(?:Developer|Architect|Associate|Professional|Practitioner|Engineer|Specialist|Administrator|Expert|Agent))/i);
        if (certSubMatch) {
          const subCert = certSubMatch[1].trim();
          if (!certLines.includes(subCert) && subCert.length > 5) {
            certLines.push(subCert);
          }
        }
      }
    }
  }

  // Deduplicate and filter noise
  const uniqueCerts = Array.from(new Set(certLines)).filter(c => c.length > 5 && !/(?:certifications?|licenses?)$/i.test(c));

  return {
    candidateName: candidateName || doc.title?.replace(/resume.*$/i, '').trim() || 'Candidate',
    certifications: uniqueCerts,
    skills: Array.from(new Set(skillLines)),
    experience: expLines.slice(0, 10),
    education: Array.from(new Set(eduLines)),
    summary: summaryLines.join(' ').trim() || (doc.summary && !doc.summary.includes('stored securely') ? doc.summary : null),
  };
}
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
  // Check fast conversational intent (greetings, pleasantries, gratitude, capabilities)
  const conv = classifyConversationalIntent(question);
  if (conv) return conv.response;

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
  const isResumeQ = /(?:resume|cv|curriculum\s*vitae|candidate|experience|work\s*history|skills?|qualification|applicant|developer|engineer|tech\s*stack)/i.test(lowerQ);
  const isProjectQ = /(?:project|architecture|stack|technology|tech\s*stack|features?|implementation|backend|frontend|framework|design|system|guardrail)/i.test(lowerQ);
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

    if (isResumeQ) {
      if (category === 'resume / cv' || category === 'employment document' || /resume|cv|curriculum/i.test(title)) {
        score += 20;
      }
      if (/bill|receipt|invoice|statement|electricity/i.test(title) || /purchase receipt|tax invoice/i.test(category)) {
        score -= 20;
      }
    }

    if (isProjectQ) {
      if (category === 'technical architecture' || category === 'project portfolio' || /project|architecture|portfolio/i.test(title)) {
        score += 20;
      }
      if (/bill|receipt|invoice|statement|electricity/i.test(title) || /purchase receipt|tax invoice/i.test(category)) {
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

    const isResumeDoc = primaryDoc.category === 'Resume / CV' || /resume|cv/i.test(primaryDoc.title) || /(?:curriculum\s*vitae|work\s*experience|skills\s*matrix|employment\s*history)/i.test(text);
    const isBillOrReceiptDoc = ['Purchase Receipt', 'Tax Invoice', 'Bank Statement'].includes(primaryDoc.category) || /bill|receipt|invoice|electricity|consumer/i.test(primaryDoc.title);
    const isCertDoc = primaryDoc.category === 'Academic Certificate' || /certif|certf/i.test(primaryDoc.title);

    const isCertificationsListQ = /(?:list\s*(?:of\s*)?(?:certif|certf)|(?:certif|certf)(?:ication|ications|icate|ied)?|credentials?|licenses?|accreditations?)/i.test(lowerQ);
    const isDetailedResumeQ = isResumeQ || /(?:detailed|content|full|overview|all|profile|summary|work|skills|projects|roles?)/i.test(lowerQ);

    const isDateQ = /(?:when\s+(?:was|is|did|are)|what\s+is\s+the\s+(?:due\s*date|bill\s*date|issue\s*date|expiry|payment\s*date|date)|due\s*date|expiry\s*date|expiration\s*date|date\s+of\s+issue|issued\s+on)/i.test(lowerQ);
    const isNameQ = /(?:who\s+is|who\s+issued|issued\s+to|whom|whose|consumer\s*name|customer\s*name|recipient\s*name|billed\s*to)/i.test(lowerQ);
    const isAccountQ = /(?:what\s+is\s+the\s+account|account\s*no|account\s*number|consumer\s*no|ca\s*no|policy\s*no)/i.test(lowerQ);
    const isTxIdQ = /(?:transaction\s*id|receipt\s*no|receipt\s*number|reference\s*number)/i.test(lowerQ);
    const isAmountQ = /(?:what\s+is\s+the\s+(?:total|amount|bill|cost|fee|price)|how\s*much|total\s*amount|bill\s*amount|payable\s*amount|total\s*due|net\s*payable)/i.test(lowerQ);

    const docReferral = `\n\n*For full details or complete verification, you can view the original document directly below.*`;

    // 1. Resume: Explicit Certifications List Query
    if (isResumeDoc && isCertificationsListQ) {
      const parsed = parseStructuredResume(text, primaryDoc);
      if (parsed.certifications.length > 0) {
        let certAnswer = `### 📜 Verified Certifications & Credentials in **${primaryDoc.title}**:\n\n`;
        parsed.certifications.forEach((c, idx) => {
          certAnswer += `${idx + 1}. **${c}**\n`;
        });
        if (parsed.candidateName) {
          certAnswer += `\n• **Candidate / Credential Holder:** **${parsed.candidateName}**\n`;
        }
        certAnswer += docReferral;
        return certAnswer;
      }
    }

    // 2. Resume: Detailed Profile & Section Query
    if (isResumeDoc && isDetailedResumeQ) {
      const parsed = parseStructuredResume(text, primaryDoc);
      let resumeAnswer = `### 📄 Verified Profile: **${parsed.candidateName}**\n`;
      resumeAnswer += `*Source Document: ${primaryDoc.title}*\n\n`;

      if (parsed.summary) {
        resumeAnswer += `#### 🎯 Professional Summary\n${parsed.summary}\n\n`;
      }
      if (parsed.certifications.length > 0) {
        resumeAnswer += `#### 📜 Certifications & Accreditations\n`;
        parsed.certifications.forEach((c, idx) => {
          resumeAnswer += `${idx + 1}. **${c}**\n`;
        });
        resumeAnswer += '\n';
      }
      if (parsed.skills.length > 0) {
        resumeAnswer += `#### 💻 Technical Skills & Core Stack\n`;
        parsed.skills.slice(0, 10).forEach(s => {
          resumeAnswer += `• ${s}\n`;
        });
        resumeAnswer += '\n';
      }
      if (parsed.experience.length > 0) {
        resumeAnswer += `#### 💼 Work Experience\n`;
        parsed.experience.slice(0, 8).forEach(e => {
          resumeAnswer += `• ${e}\n`;
        });
        resumeAnswer += '\n';
      }
      if (parsed.education.length > 0) {
        resumeAnswer += `#### 🎓 Education\n`;
        parsed.education.slice(0, 4).forEach(ed => {
          resumeAnswer += `• ${ed}\n`;
        });
        resumeAnswer += '\n';
      }
      resumeAnswer += docReferral;
      return resumeAnswer;
    }

    // 3. Financial Bills & Purchase Receipts (Electricity Bills, Tax Invoices)
    if (isBillOrReceiptDoc) {
      let consumer = keyDetails['CONSUMER NAME'] || keyDetails['Consumer Name'] || keyDetails['Recipient Name'] || keyDetails['Owner Name'] || null;
      if (!consumer) {
        const cMatch = text.match(/(?:consumer\s*name|customer\s*name|billed\s*to|recipient(?:\s*name)?|name)[:.\s]+([A-Z][A-Za-z\s\/\.]{2,40})/i);
        if (cMatch) consumer = cMatch[1].trim().split('\n')[0];
      }
      let accountNo = keyDetails['ACCOUNT NUMBER'] || keyDetails['Account No'] || keyDetails['ACCOUNT NO'] || null;
      if (!accountNo) {
        const accMatch = text.match(/(?:account\s*no\.?|consumer\s*no\.?|ca\s*no\.?)[:.\s]*([A-Za-z0-9\-_]{4,25})/i);
        if (accMatch) accountNo = accMatch[1].trim();
      }
      let amount = keyDetails['TOTAL AMOUNT'] || keyDetails['Total Amount'] || keyDetails['Amount'] || null;
      if (!amount) {
        const amtMatch = text.match(/(?:total\s*amount\s*(?:received|paid|due|payable)?|amount\s*(?:received|paid|due|payable)?|total\s*(?:received|paid|payable)?|grand\s*total|net\s*payable|bill\s*amount)[:.\s]*(?:₹|rs\.?|inr|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{2})?(?:\s*\([^\)]+\))?(?:\s*only)?)/i);
        if (amtMatch) amount = amtMatch[1].trim();
      }
      let txId = keyDetails['TRANSACTION ID'] || keyDetails['Transaction Id'] || keyDetails['Transaction ID'] || keyDetails['Receipt No'] || keyDetails['REFERENCE NUMBER'] || null;
      if (!txId) {
        const txMatch = text.match(/(?:transaction\s*id|receipt\s*no\.?|ref(?:\s*no|\s*id|\s*number)?|reference\s*no\.?)[:.\s]*([A-Za-z0-9\-_]{6,35})/i);
        if (txMatch) txId = txMatch[1].trim();
      }
      let docDate = primaryDoc.documentDate || keyDetails['ISSUE DATE'] || keyDetails['Issue Date'] || null;
      if (!docDate) {
        const dateMatch = text.match(/(?:collection\s*date|printed\s*date|payment\s*date|bill\s*date|issue\s*date|due\s*date|date[:.\s-]*|[¢|~]?\s*)([0-9]{1,2}[-\/.][0-9]{1,2}[-\/.][0-9]{2,4})/i);
        if (dateMatch) {
          const raw = dateMatch[1].trim();
          docDate = normalizeDateToIso(raw) || raw;
        }
      }
      let provider = null;
      const provMatch = text.match(/([A-Z][A-Za-z\s]+(?:Vidyut|Nigam|Power|Electric|Energy|Distribution|Corporation|Ltd|Limited|Board|Utility))/i);
      if (provMatch) provider = provMatch[1].trim();

      // Safely convert amount to string to avoid TypeError when stored as a number
      const amtStr = amount != null ? String(amount).trim() : '';
      const formattedAmt = amtStr ? (amtStr.startsWith('₹') || amtStr.startsWith('$') ? amtStr : `₹${amtStr}`) : '';

      // If user specifically asked for transaction ID
      if (isTxIdQ && txId) {
        return `The transaction ID for **${primaryDoc.title}** is \`${txId}\`.${docReferral}`;
      }

      // If user specifically asked for amount ONLY
      if (isAmountQ && !lowerQ.includes('bill') && !lowerQ.includes('detail') && amtStr) {
        return `The total amount for **${primaryDoc.title}** is **${formattedAmt}**.${docReferral}`;
      }

      // If user asked for consumer name ONLY
      if (isNameQ && !lowerQ.includes('bill') && consumer) {
        return `The document **${primaryDoc.title}** is issued to **${consumer}**.${docReferral}`;
      }

      // Complete structured bill breakdown
      let billCard = `### ⚡ Verified Details for **${primaryDoc.title}**\n\n`;
      if (consumer) billCard += `• **Consumer Name:** **${consumer}**\n`;
      if (accountNo) billCard += `• **Account / Consumer ID:** \`${accountNo}\`\n`;
      if (txId) billCard += `• **Transaction ID / Reference:** \`${txId}\`\n`;
      if (provider) billCard += `• **Utility Provider:** ${provider}\n`;
      if (amtStr) {
        billCard += `• **Total Amount:** **${formattedAmt}**\n`;
      }
      if (docDate) billCard += `• **Billing / Payment Date:** **${docDate}**\n`;
      if (primaryDoc.expiryDate) billCard += `• **Due Date:** **${primaryDoc.expiryDate}**\n`;
      billCard += `• **Status:** Verified Payment Record\n`;
      billCard += docReferral;
      return billCard;
    }

    // 4. Specific Date Queries across documents
    if (isDateQ) {
      let docDate = primaryDoc.documentDate || keyDetails['ISSUE DATE'] || keyDetails['Issue Date'] || keyDetails['DOCUMENT DATE'] || keyDetails['Document Date'] || null;
      if (!docDate) {
        const dateMatch = text.match(/(?:collection\s*date|printed\s*date|payment\s*date|bill\s*date|issue\s*date|completion\s*date|award\s*date|due\s*date|date[:.\s-]*|[¢|~]?\s*)([0-9]{1,2}[-\/.][0-9]{1,2}[-\/.][0-9]{2,4})/i);
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

    // 5. Academic Certificates
    if (isCertDoc) {
      let recipient = keyDetails['Candidate or Recipient Name'] || keyDetails['Recipient Name'] || keyDetails['Name'] || null;
      if (!recipient) {
        const recMatch = text.match(/(?:awarded\s*to|presented\s*to|certify\s*that|recipient(?:\s*name)?|name)[:.\s]+([A-Z][A-Za-z\s\/\.]{2,40})/i);
        if (recMatch) recipient = recMatch[1].trim().split('\n')[0];
      }
      let certDate = primaryDoc.documentDate || keyDetails['ISSUE DATE'] || keyDetails['Issue Date'] || null;
      let certId = keyDetails['Certificate or Credential ID'] || keyDetails['Certificate No'] || null;

      let certCard = `### 🎓 Verified Records for **${primaryDoc.title}**\n\n`;
      if (recipient) certCard += `• **Recipient:** **${recipient}**\n`;
      if (certDate) certCard += `• **Issue / Completion Date:** **${certDate}**\n`;
      if (certId) certCard += `• **Credential / Certificate ID:** \`${certId}\`\n`;
      if (primaryDoc.summary) certCard += `• **Program Details:** ${primaryDoc.summary}\n`;
      certCard += docReferral;
      return certCard;
    }

    // 5. Technical Architecture & Project Portfolio Query
    if (isProjectQ || ['Technical Architecture', 'Project Portfolio'].includes(primaryDoc.category) || /architecture|project/i.test(primaryDoc.title)) {
      let projAnswer = `### 🛠️ Verified Architecture & Specifications: **${primaryDoc.title}**\n\n`;
      if (primaryDoc.summary) projAnswer += `#### 📌 Executive Overview\n${primaryDoc.summary}\n\n`;
      const techStack = keyDetails['Core Skills / Tech Stack'] || keyDetails['Tech Stack'] || keyDetails['Technologies'] || null;
      if (techStack) projAnswer += `#### 💻 Tech Stack & Frameworks\n• ${techStack}\n\n`;
      const projects = keyDetails['Projects'] || null;
      if (projects) projAnswer += `#### 🧩 Architecture Components\n• ${projects}\n\n`;
      const matchedExcerpt = findMatchingExcerptWithPage(text, queryTokens);
      if (matchedExcerpt) projAnswer += `#### 🔍 Key Specification (Page ${matchedExcerpt.page})\n> ${matchedExcerpt.excerpt}\n`;
      projAnswer += docReferral;
      return projAnswer;
    }

    // 6. Specific Clause / Contractual Condition Query (e.g. SLA, termination, liability, penalty)
    const matchedExcerpt = findMatchingExcerptWithPage(text, queryTokens);
    if (matchedExcerpt && matchedExcerpt.score >= 6) {
      return `According to **${primaryDoc.title}** (Page ${matchedExcerpt.page}):\n\n> ${matchedExcerpt.excerpt}${docReferral}`;
    }

    return `### Verified Records for **${primaryDoc.title}**\n\n` +
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
