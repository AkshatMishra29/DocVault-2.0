# Comprehensive Document Pipeline Audit: DocVault

**Repository:** `DocVault-New` (`feature/universal-pipeline`)  
**Audit Date:** November 2, 2026  
**Target Architecture:** Universal Document Pipeline (Ingest → Adapter → Quality Gate → OCR → Classify → Extract → Verify → Persist)  
**Evaluator:** Senior Node.js & React Systems Engineer  

---

## 1. Executive Summary & Critical Findings

This audit evaluates the current implementation of document ingestion, processing, OCR, and AI reasoning across the DocVault codebase against the target **Universal Document Pipeline Specification**.

### Top-Line System Metrics & Facts
* **Express Framework Version:** **Express 5.3.0** (`backend/package.json#L20: "express": "^5.3.0"`). Documentation stating Express 4.x is outdated.
* **OCR In-Request Execution:** **YES (Blocking).** Ingestion runs synchronously inside `POST /api/documents/upload` (`backend/src/modules/documents/document.routes.js#L64-L100`), executing PDF parsing, multi-page image rendering, Tesseract OCR, and Groq cloud LLM calls before returning an HTTP response.
* **Multer Storage & Size Limit:** **25 MB in-memory buffer** (`backend/src/middleware/upload.middleware.js#L4-L7: storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 }`). Files are held in Node.js process heap memory.
* **Embeddings Storage:** **Embedded inside MongoDB Document Schema** (`backend/src/modules/documents/document.model.js#L27: embedding: [{ type: Number }]`). Stored as a raw 384-dimensional floating-point array on the individual document record.
* **Core Architectural Discrepancy:** `PROJECT_REPORT.md` advertises an "intelligent, zero-knowledge personal document vault" with client-side decryption. In reality, files are stored unencrypted in MongoDB as Base64 strings (`fileData: buffer.toString('base64')`), and extracted document text is stored in plaintext (`extractedText`).

---

## 2. Stage-by-Stage Architectural Comparison

| Pipeline Stage | Target Architecture Specification | Current Codebase Implementation | Status & File:Line Evidence |
| :--- | :--- | :--- | :--- |
| **1. Ingest** | Content-based file-type detection (`file-type`), env-driven allow-list, memory guard, multer limit, non-blocking response. | Multer memory storage (25 MB), sync blocking upload handler. Basic magic byte validation for PDF/PNG/JPEG/WebP and regex page-count estimation. | ⚠️ **Partial.** `backend/src/middleware/upload.middleware.js#L4-L7`; `backend/src/modules/extraction/ingestionGuard.service.js#L15-L88`. Blocking upload at `backend/src/modules/documents/document.routes.js#L74`. |
| **2. Adapter** | Universal Page Model `{documentId, pageNo, width, height, rotation, qualityScore, lang, blocks:[{text, bbox, conf, source}]}`. Dedicated `pages` collection for `ai_enabled` docs. Adapters for PDF Text, PDF Scan, Image, Office. | No Universal Page model. No `pages` collection. Ad-hoc extraction: PDF uses `pdf-parse` (unpositioned string); images use Tesseract (raw string). No position coordinates or bounding boxes preserved. | ❌ **Missing.** `backend/src/services/ocr/ocrService.js#L10-L39`. |
| **3. Quality Gate** | Per image page: resolution, blur (Laplacian convolution + std dev), brightness/contrast stats. Thresholds in env. Hard fail: `needs_retake`. Between thresholds: lowered confidence. | Basic dimension check (`min 400x300`) and standard deviation of grayscale channel (`stdev < 10`). No Laplacian blur kernel, no brightness/contrast metrics, no `needs_retake` status or feedback. | ❌ **Missing.** `backend/src/modules/extraction/ingestionGuard.service.js#L93-L125`. |
| **4. OCR** | Abstracted `recognize(image, {langs})` returning words with bounding boxes and confidence. Mean confidence check with adaptive retry (upscaling/binarization). Vision fallback for `ai_enabled` only. Devanagari detection (`hin`) & digit normalization. | Raw `Tesseract.recognize(buffer, 'eng')` returning only text string (`{ data: { text } }`). Bounding boxes and confidence scores are discarded. No retry with adaptive thresholding. No Hindi/Devanagari support. | ❌ **Missing.** `backend/src/services/ocr/ocrService.js#L24-L39`. |
| **5. Classify** | Config-driven document type registry (`backend/src/config/documentTypes/*.json`). Keyword scoring. Tiny 600-char LLM fallback only if `ai_enabled`. Generic fallback extractor for `other`. | Hardcoded JavaScript dictionary (`DOCUMENT_SIGNATURES`) with regex scoring. Fallback invokes full Groq metadata extraction with up to 3,000 characters. No JSON registry. | ⚠️ **Partial.** `backend/src/modules/extraction/ruleExtraction.service.js#L14-L118`; `backend/src/modules/extraction/extractionPipeline.service.js#L149-L180`. |
| **6. Extract** | Field ladder: label proximity & word box geometry → Groq on tight evidence windows for missing fields only (max_tokens ~150) → Gemini vision for unreadable scans. Save method per field. | Rule extraction uses unpositioned regexes. Groq fallback is invoked with full document text requesting all schema fields, not just missing fields. Gemini vision is unmounted. | ⚠️ **Partial.** `backend/src/modules/extraction/ruleExtraction.service.js#L124-L275`; `backend/src/services/ai/groqService.js#L79-L86`. |
| **7. Verify** | Grounding verification in page text (fuzzy match, threshold from env); day-first date normalization; format checks; date sanity; multi-method agreement confidence boost. Deadlines only on accepted dates. | Exact substring check (`includes()`), regex date/amount verification, start-before-expiry check. No fuzzy matching, no day-first vs month-first heuristic, no multi-method agreement boost. | ⚠️ **Partial.** `backend/src/modules/extraction/verification.service.js#L10-L184`. Deadline creation at `backend/src/modules/extraction/extractionPipeline.service.js#L291-L317`. |
| **8. Persist** | `Document` schema: `aiPolicy` (`storage_only` vs `ai_enabled`), `policyVersion`, `sensitiveFlag`, `aiConsent`, `status`, `sha256`, `pageCount`, `pipelineVersion`. `pages` collection. Full field metadata (`bbox`, `conf`, `method`). | Uses `privacyMode` (`PROCESSABLE` vs `STORAGE_ONLY`). No `aiPolicy` enum, no `sensitiveFlag`, no `aiConsent` record. Derives `fileHash` instead of `sha256`. No `pages` collection. Saves unencrypted base64 in Mongo. | ⚠️ **Partial.** `backend/src/modules/documents/document.model.js#L3-L82`; `backend/src/modules/extraction/extractionPipeline.service.js#L254-L288`. |

---

## 3. Data Egress Audit: Where Document Text Leaves the Server

A critical requirement of DocVault is that document content must never leak to third parties unless strictly authorized, and never for sensitive identity records. The audit uncovered the following egress pathways:

### 3.1 Groq Cloud API Egress
* **Document Metadata Extraction:**
  * **File & Line:** `backend/src/services/ai/groqService.js#L79-L86`
  * **Trigger:** When rule-based extraction confidence is insufficient during document ingestion (`backend/src/modules/extraction/extractionPipeline.service.js#L170-L180`).
  * **Payload:** Up to 3,000 characters of raw document text (`safeWrappedText`) sent over HTTPS to `https://api.groq.com/openai/v1/chat/completions`.
* **Visual Multimodal OCR (Scanned Fallback):**
  * **File & Line:** `backend/src/services/ai/groqService.js#L31-L49`
  * **Trigger:** When text layer has $< 20$ characters and image buffer exists.
  * **Payload:** Full Base64-encoded image (`data:image/jpeg;base64,...`) transmitted to Groq using model `qwen/qwen3.8-27b`.
* **RAG Vault Assistant (Q&A):**
  * **File & Line:** `backend/src/services/ai/groqService.js#L105-L168` (invoked via `backend/src/modules/ai/ai.routes.js#L59`).
  * **Trigger:** Any user query submitted to `/api/ai/query`.
  * **Payload:** Iterates over stored user documents and embeds up to 3,000 characters of `doc.extractedText` per document directly into the prompt sent to Groq (`openai/gpt-oss-120b` or `config.groq.model`).
  * **CRITICAL PRIVACY DEFECT:** `backend/src/modules/ai/ai.routes.js#L38` loads `Document.find({ userId: req.user.userId })` **without filtering out `STORAGE_ONLY` documents**. Although redacted docs contain a placeholder, any sensitive document that was not caught by filename/magic-byte filters has its text sent directly to Groq.

### 3.2 Google Gemini API Egress
* **Configuration:** `backend/src/config/index.js#L17-L19` loads `GEMINI_API_KEY` and `GOOGLE_API_KEY`.
* **Active Codebase Egress:** **None currently active.** Schema enum references exist (`backend/src/modules/documents/document.model.js#L64: 'gemini_vision'`), but no Gemini SDK calls are currently made. Visual OCR was routed to Groq's `qwen/qwen3.8-27b`.

### 3.3 Hugging Face Inference API Egress
* **Vector Embedding Generation:**
  * **File & Line:** `backend/src/services/ai/huggingFaceService.js#L6-L32` (invoked via `backend/src/modules/extraction/extractionPipeline.service.js#L242-L246` and `backend/src/modules/ai/ai.routes.js#L42`).
  * **Payload:** Document title, category, summary, and tags (`inputs: text.slice(0, 1000)`) transmitted to `https://api-inference.huggingface.co/pipeline/feature-extraction/BAAI/bge-small-en-v1.5`.
  * **Operational Status:** Hugging Face decommissioned `api-inference.huggingface.co` in favor of `router.huggingface.co`. Furthermore, free inference on this endpoint now returns `HTTP 402 Payment Required` (credits exhausted). The service currently catches the failure silently and returns `[]`.

### 3.4 Logs & Diagnostics Egress
* `backend/src/services/emailService.js#L161, L207, L234`: Emits verification codes and destination emails directly to server `stdout`.
* `backend/src/modules/extraction/extractionPipeline.service.js#L34`: Logs uploaded file names to server `stdout`.
* `backend/src/modules/vault/vault.routes.js#L61-L122`: `/api/vault/admin/stats` exposes the full list of custodians and document counts to any authenticated JWT user without admin role verification.

---

## 4. Ingest & Upload Analysis: Synchronous vs Job Queue

### 4.1 Synchronous Execution in HTTP Request
In `backend/src/modules/documents/document.routes.js#L64-L100`:
```javascript
router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  // ...
  const pipelineResult = await executeDocumentExtractionPipeline({ ... }); // <-- BLOCKING
  // ...
  res.status(201).json({ success: true, data: responseDoc });
});
```
* **Impact:** The client HTTP connection remains open while the backend:
  1. Computes SHA-256 hashes and inspects magic bytes.
  2. Runs PDF text extraction or multi-page image rendering (`pdf-img-convert`).
  3. Preprocesses images with Sharp and executes Tesseract OCR.
  4. Calls Groq Cloud API over the public internet (can take 2–10 seconds).
  5. Runs verification rules and writes to MongoDB.
* **Failure Modes:**
  * Request timeout on cloud proxies (e.g. Render/Cloudflare 30s–100s timeout).
  * High latency spike on mobile connections.
  * Node.js event loop starvation during intensive Sharp and Tesseract execution.
* **Target Architecture Mandate:** Moving OCR and AI extraction into a persistent, asynchronous **MongoDB `jobs` collection** with leases and worker backoff is essential (Phase A).

### 4.2 Multer Memory Storage & Heap Allocation
In `backend/src/middleware/upload.middleware.js#L4-L7`:
* `storage: multer.memoryStorage()`
* `limits: { fileSize: 25 * 1024 * 1024 }` (25 MB)
* **Risk:** Concurrent uploads of several 20–25 MB files directly allocate native buffers in Node.js heap. On memory-constrained cloud environments (such as Render Free Tier's 512 MB RAM limit), concurrent uploads will trigger `OOM (Out Of Memory) process exit`.

---

## 5. Storage Architecture & Embeddings Audit

### 5.1 Document Storage
* **Implementation:** `backend/src/modules/documents/document.model.js#L15: fileData: { type: String }`.
* Document files are stored directly inside MongoDB documents as Base64 strings.
* **Limitations:** MongoDB BSON document limit is 16 MB. A 12 MB file encoded in Base64 expands by 33% to ~16 MB, causing MongoDB insert rejections (`BSONObjectTooLarge`).

### 5.2 Embedding Storage
* **Implementation:** `backend/src/modules/documents/document.model.js#L27: embedding: [{ type: Number }]`.
* Embeddings are stored as raw numeric arrays directly within the `Document` document.
* **Search Mechanics:** `backend/src/modules/ai/ai.routes.js#L44-L51` loads all user documents into memory and computes cosine similarity in JavaScript in-process. There is no vector index (such as MongoDB Atlas Vector Search or local HNSW).

---

## 6. Documented Claims vs Reality: `PROJECT_REPORT.md` Mismatch

| Item | `PROJECT_REPORT.md` Claim | Actual Codebase Reality | Severity |
| :--- | :--- | :--- | :--- |
| **Zero-Knowledge Security** | Section 1 & 4 claim: "intelligent, zero-knowledge personal document vault... unlocks client-side file decryption and session keys." | Files are uploaded unencrypted to the server and stored in plaintext Base64 in MongoDB (`fileData`). The PIN is only a server-side bcrypt hash; no client-side encryption keys exist. | ⚠️ **High (Misleading Documentation)** |
| **Plaintext Extracted Text** | Implies cryptographic isolation for all stored content. | `extractedText` is stored as unencrypted UTF-8 text directly in MongoDB Atlas (`DocumentSchema#L20`). | ⚠️ **High** |
| **Express Framework Version** | Section 2.2 states: "Express.js 4.x with RESTful routing." | `backend/package.json#L20` declares `"express": "^5.3.0"`. | ℹ️ **Low** |
| **AI Route Contracts** | Section 6 specifies: `POST /api/ai/ask`. | `backend/src/modules/ai/ai.routes.js#L25` mounts `POST /api/ai/query`. | ⚠️ **Medium** |
| **Document Schema Fields** | Section 5.2 documents: `fileUrl`, `fileType`, `fileSize`, `category` (enum). | Actual schema (`document.model.js`) uses `originalName`, `mimetype`, `format`, `sizeBytes`, `fileData`, `storagePath`, `downloadUrl`. | ℹ️ **Low** |
| **NER Extraction Engine** | Section 2.4 and `document.model.js#L64` advertise `gliner`. | No GLiNER Python or ONNX model exists in the active pipeline; Tier 1 is pure regex. | ⚠️ **Medium** |
| **Cloud Object Storage** | Section 2.3 states: "Firebase Storage with Cloudflare R2 fallback." | `extractionPipeline.service.js#L68, L264` hardcodes `storagePath: 'mongodb-embedded'`, bypassing cloud object buckets. | ⚠️ **Medium** |

---

## 7. Action Plan for Phase A Implementation

Following approval of this audit, Phase A will establish the privacy foundations and asynchronous job processing:

1. **Document Model Schema Migration:**
   * Introduce `aiPolicy: 'storage_only' | 'ai_enabled'` (defaulting strictly to `storage_only` for sensitive files).
   * Add `policyVersion`, `sensitiveFlag`, `aiConsent: { grantedAt, noticeVersion }`, `status`, `sha256`, `pageCount`, `pipelineVersion`.
   * Add migration layer for existing records.
2. **Centralized Privacy Gatekeeper:**
   * In-process local sensitive document detector (Aadhaar 12-digit with Verhoeff checksum algorithm, PAN card regex, passport MRZ lines, voter ID, driving licence, financial card numbers).
   * Implement `assertAiAllowed(doc)` and enforce it before **ANY** third-party network interaction (Groq, Gemini, Hugging Face, or RAG routes).
   * Ensure `PATCH /api/documents/:id/ai-policy` dynamically purges derived text, pages, chunks, and cached embeddings upon transition to `storage_only`.
3. **MongoDB Persistent Job Queue (`jobs` collection):**
   * Decouple OCR and AI processing from `POST /api/documents/upload`.
   * Implement atomic claim, lease timeout, exponential backoff (3 attempts), and deduplication key `sha256 + pipelineVersion`.
   * Memory guardrails, max 25 pages cap, and concurrency control (1–2 jobs).

---

*Status: Audit complete. Awaiting user approval to proceed with Phase A.*

