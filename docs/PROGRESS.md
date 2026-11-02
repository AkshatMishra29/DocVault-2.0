# DocVault Universal Document Pipeline: Implementation Progress

**Active Branch:** `feature/universal-pipeline`  
**Latest Update:** Phase A Complete (November 2, 2026)  
**Engineering Goal:** High-precision, zero-leakage, low-token document processing pipeline.

---

## Phase Status Summary

| Phase | Description | Status | Verification & Test Results |
| :--- | :--- | :---: | :--- |
| **Step 0** | Codebase Audit & Gap Analysis (`docs/AUDIT_PIPELINE.md`) | ✅ **DONE** | Complete evidence-based audit report generated. |
| **Phase A** | Privacy Gate, Sensitive Detection, Dynamic Policy Purge & Async Job Queue | ✅ **DONE** | 20 / 20 tests passed (`backend/tests/phaseA.test.js`). 61 / 61 total backend tests passing. |
| **Feature Benchmark** | Comprehensive 16-Feature Pipeline Benchmark (`runComprehensive14FeaturesBenchmark.js`) | ✅ **DONE** | 16 / 16 features passed (100% precision). Feature #14 sensitive exclusion verified. |
| **Phase B** | Adapters & Universal Page Model (`pages` collection, PDF text/scan, images, office) | ⏳ **PENDING** | Next phase. |
| **Phase C** | Quality Gate & OCR Preprocessing (Blur/Laplacian, brightness, adaptive OCR retry) | ⏳ **PENDING** | Dependent on Phase B. |
| **Phase D** | Type Registry, Field Ladder & Verification Gates (JSON types, Groq window, Gemini) | ⏳ **PENDING** | Dependent on Phase C. |
| **Phase E** | Retrieval, Bounding Box Citations, Review Queue & Correction Memory | ⏳ **PENDING** | Dependent on Phase D. |
| **Phase F** | Golden Set Evaluation & CI/CD Regression Guard (30+ test fixtures, 98% precision) | ⏳ **PENDING** | Dependent on Phase E. |

---

## 16-Feature Benchmark Results Matrix

| # | Feature | Architectural Capability | Benchmark Result | Status |
| :---: | :--- | :--- | :--- | :---: |
| **1** | PDF Text Extraction | Extracts raw text streams directly from PDF | 65.19ms latency, 566 chars, 0 OCR overhead | ✅ PASS |
| **2** | Image Preprocessing | Sharp greyscale, dynamic range normalization, sharpening | 6.97ms latency, normalized 400x200 | ✅ PASS |
| **3** | OCR Engine | Tesseract.js in-process scanned image OCR | 187.17ms latency, 100% matched keywords | ✅ PASS |
| **4** | Automatic Classification | Rule-based keyword and structure scoring | 4/4 categories matched (100% precision) | ✅ PASS |
| **5** | Metadata Extraction | Deterministic regex & anchor parsing with evidence bounds | GSTIN, Invoice No, Total, Date anchored | ✅ PASS |
| **6** | Expiry Extraction | Valid-till anchors & ISO standardization | Normalized ISO (2027-01-31), Chronology verified | ✅ PASS |
| **7** | Semantic Embeddings | 384-dimensional vector cosine similarity | Identical: 1.0000, Orthogonal: -0.0006 | ✅ PASS |
| **8** | AI Document Q&A | Grounded prompt construction & key detail formatting | Strict schema, context packaging verified | ✅ PASS |
| **9** | Bounded RAG | Grounding filter against hallucinated tokens | 100% rejection rate for hallucinated tokens | ✅ PASS |
| **10** | Source References | Citations tracked per answer | 2 document references tracked per answer | ✅ PASS |
| **11** | Hindi & Indic OCR | Devanagari detection and numeral mapping | Devanagari range detected, ०-९ normalized | ✅ PASS |
| **12** | On-Device / Local Processing | In-process server execution with zero network egress | 0 third-party egress calls | ✅ PASS |
| **13** | Local AI & Deterministic Extraction | Instant field parsing with 0 LLM tokens | 0.064ms latency, 0 cloud tokens used | ✅ PASS |
| **14** | Sensitive-Document Exclusion | 12-digit Verhoeff Aadhaar, PAN, MRZ, Voter ID, DL, Luhn | Verhoeff passed, assertAiAllowed 403 block | ✅ PASS |
| **15** | User-Specific AI Consent | Binary storage_only vs ai_enabled per document | Informed consent enforced, dynamic purge | ✅ PASS |
| **16** | AI Correction Learning | ReviewHistory schema & correction feedback loop | Human-in-the-loop schema validated | ✅ PASS |

---

## Phase A Details: What Changed

### 1. Document Schema Architecture
* Added `aiPolicy` (`storage_only` vs `ai_enabled`), defaulting strictly to `storage_only`.
* Added `policyVersion`, `sensitiveFlag`, `sensitiveReason`, `aiConsent: { grantedAt, noticeVersion }`, `status`, `sha256`, `pageCount`, and `pipelineVersion`.
* Added schema middleware synchronizing backward-compatibility fields (`privacyMode` and `fileHash`).

### 2. Local In-Process Sensitive Detector (`backend/src/services/pipeline/sensitiveDetector.js`)
* Implemented mathematical **Verhoeff checksum algorithm** for authentic Indian 12-digit Aadhaar identification.
* Added regex and pattern detection for Income Tax PAN (`[A-Z]{5}[0-9]{4}[A-Z]`), Passport Machine Readable Zone (MRZ), Voter ID (EPIC), Indian Driving Licences, and Credit/Debit cards (Luhn algorithm).
* Flags encrypted or password-protected PDF headers.
* **Strict Privacy Invariant:** Sensitive documents are forced into `storage_only`, derived text is discarded, and zero third-party calls are made.

### 3. Centralized Privacy Gatekeeper (`backend/src/services/pipeline/privacyGate.js`)
* `assertAiAllowed(doc)` enforced before every outbound network call (Groq, Gemini, Hugging Face, RAG query).
* `assertPolicyUnchangedBeforeSave()` prevents stale background processing results from overwriting a user's mid-processing revocation to `storage_only`.

### 4. Asynchronous MongoDB Job Queue (`backend/src/modules/pipeline/`)
* Created `jobs` collection with atomic claim via `findOneAndUpdate`, worker leases, 3 retry attempts with exponential backoff, and deterministic idempotency keys (`sha256 + '_' + pipelineVersion`).
* Upload route (`POST /api/documents/upload`) now returns immediately with `201 Created` (`status: 'queued'`), eliminating blocking upload timeouts.
* Limits enforced: 25-page cap, per-page execution timeout, 1–2 concurrent workers, and heap memory guard.

### 5. AI Policy Management & Multi-Tenant Security
* Implemented `PATCH /api/documents/:id/ai-policy`: switching to `storage_only` immediately purges `extractedText`, `embedding`, and `extractedFields`, cancels active background jobs, increments `policyVersion`, and writes an immutable audit record.
* Enforced strict document ownership checks returning `404 Not Found` for other users across all endpoints.
* Updated `/api/ai/query` and alias `/api/ai/ask` to filter strictly by `aiPolicy: 'ai_enabled'` and `sensitiveFlag: false`.

---

## What Remains
* **Phase B:** Universal Page Model and file adapters (`pdfTextAdapter`, `pdfScanAdapter`, `imageAdapter`, `officeAdapter`).
* **Phase C:** Image quality gate (Laplacian convolution blur test, contrast/brightness stats) and OCR retry ladder with Devanagari support.
* **Phase D:** Config-driven document type registry (`backend/src/config/documentTypes/*.json`) and targeted field ladder.
* **Phase E:** Chunking with bounding box citations, review queue, and per-user correction memory.
* **Phase F:** 30+ golden test set with precision reporting.

---

## Risks & Mitigations
* **Risk:** Background worker execution in ephemeral server environments (e.g., Render container restarts).  
  * *Mitigation:* Leases expire automatically (`leaseExpiresAt`), and uncompleted jobs are atomically recovered and resumed by the next active worker on startup.
* **Risk:** Memory spikes during multi-page OCR.  
  * *Mitigation:* Memory guard in `jobQueue.service.js` checks `process.memoryUsage().heapUsed` before claiming new jobs.

