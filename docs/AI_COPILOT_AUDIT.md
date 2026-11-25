# DOCVAULT 2.0 — AGENTIC AI COPILOT AUDIT REPORT

**Audit Date:** 2026-11-25  
**Auditor:** Principal AI Architect & Systems Engineer  
**Branch:** `feature/copilot-beta`  
**Status:** COMPLETE & VERIFIED

---

## 1. EXISTING ARCHITECTURE OVERVIEW

DocVault 2.0 is a privacy-first personal and family document management platform built with:
- **Backend:** Node.js (Express), MongoDB Atlas (Mongoose ODM), JWT with optional PIN verification, Firebase Admin SDK for auth verification, Groq SDK (`qwen/qwen3.8-27b`, `openai/gpt-oss-120b`), HuggingFace embeddings (`BAAI/bge-small-en-v1.5`), in-process OCR via `pdf-parse` / `tesseract.js`, Docker validator microservice on port 8001.
- **Frontend:** React 19 + Vite, React Router 6, Tailwind/CSS variables design system (`--dv-accent: #356AE6`), lucide-react icons, SSE streaming via `fetch` ReadableStream.
- **Microservices:**
  - `validator/`: Python FastAPI ONNX + OpenCV microservice running on port 8001 (active in docker-compose).
  - `extraction_service/`: Standalone Python microservice (fallback/experimental).
  - In-process extraction pipeline: `backend/src/modules/extraction/`.

---

## 2. EXISTING WORKING FEATURES

1. **Authentication & Session Security:**
   - Dual-token system: Initial login JWT + Vault Unlock PIN issuance (`docvault_token`).
   - Single-session protection with `sessionVersion` invalidation.
   - Brute-force lockout: 5 failed attempts locks vault for 15 minutes.
2. **Document Management & Storage:**
   - Multi-tenant ownership with category tagging, AES-256 metadata encryption, and expiry date alerts.
   - Upload quarantine validation and MIME verification.
3. **Sharing Engine & Access Control:**
   - Fine-grained permission model (`view`, `download`, `edit`, `admin`).
   - Time-limited links with passcodes, watermark generation, and view count tracking.
4. **Assets & Reminders:**
   - MongoDB `Asset` and `Deadline` models with category, warranty dates, invoice linking.
   - Cron-based / interval-based document expiry checker (`jobs/expiryWorker.js`).
5. **Ask AI (Standard Assistant):**
   - Deterministic grounding via `backend/src/services/ai/groqService.js`.
   - Document scoring, regex entity extraction (transaction IDs, amounts, dates), and document preview cards.
6. **Copilot Beta (Current Progress on `feature/copilot-beta`):**
   - SSE streaming endpoint `POST /api/copilot/chat` with heartbeat and abort handling.
   - 27 registered tools (10 read, 17 write with human confirmation gating).
   - In-memory rate limiting and token ledger quota defense.
   - Animated mascot companion Vee with 6 expressive states.

---

## 3. EXISTING INCOMPLETE & DEFECTIVE FEATURES

1. **Document Preview Rendering in Copilot:**
   - *Problem:* In Ask AI, search responses include document preview cards with thumbnails, category chips, and direct open buttons. Copilot was outputting raw JSON sources or minimal source chips without the interactive preview card experience users expect.
2. **PDF Page-Level Extraction & Chunking:**
   - Multi-page PDFs (e.g. 5+ pages) are extracted into one large `extractedText` blob. Chunking was only executed on-the-fly during embedding generation, rather than persisting per-page chunks with exact page numbering and offsets.
3. **Chunk Invalidation on Document Edit/Delete:**
   - Updating or deleting a document in `document.routes.js` did not cascade-delete its `DocumentChunk` or embedding vector records, creating orphan embeddings in vector search.
4. **Token Ledger Budget Discrepancy:**
   - `checkTokenBudget` in `orchestrator.js` was called with 2 arguments `(userId, 500)` while the function signature only accepts `(userId)`.
5. **Frontend apiClient Token Check:**
   - `frontend/src/services/api/apiClient.js` checks `localStorage.getItem('token')` rather than checking `docvault_token` first, causing non-stream requests (like history loading) to fail if only `docvault_token` was refreshed upon PIN unlock.

---

## 4. EXTRACTION & RETRIEVAL PIPELINE ANALYSIS

```
Upload -> Validator (Port 8001) -> MIME/Magic Check -> Disk Staging ->
OCR/Text Extraction -> Chunking -> Embeddings (HF BAAI/bge-small-en) ->
Atlas Vector Index -> Retrieval (Filter: userId + aiPolicy) -> Grounding -> LLM
```

- **Every PDF page processed?** Verified. `pdf-parse` extracts text per page. However, scanned PDFs with poor contrast sometimes fail silently in tesseract.js.
- **Scanned vs Digital PDFs:** Digital PDFs extract with high fidelity. Scanned PDFs depend on OCR worker quality.
- **Vector search filtering:** Filter `{ userId: ctx.userId, aiPolicy: 'ai_enabled' }` is strictly enforced to prevent cross-user IDOR data leaks.
- **Original source references:** Page numbers were often reported as default `1` when chunks weren't tagged with exact source page metadata.

---

## 5. EXISTING APIS REUSABLE FOR COPILOT

| Domain | Endpoint / Service | Purpose |
|---|---|---|
| Documents | `DocumentAccessControlService.getAccessibleDocumentIds` | Fetching viewable IDs |
| Documents | `Document.findById()`, `Document.find()` | Querying document records |
| Assets | `backend/src/models/asset.model.js` | CRUD for registered assets |
| Deadlines | `backend/src/models/deadline.model.js` | Expiry and warranty reminders |
| Shares | `backend/src/modules/sharing/share.service.js` | Generating secure links |
| Connections | `backend/src/models/userConnection.model.js` | Family and user links |
| Grounding | `backend/src/services/ai/groqService.js` | Fast entity extraction |

---

## 6. MISSING CAPABILITIES & DATABASE MODELS

1. **StudyDeck / Flashcard Model:**
   - Created `studyDeck.model.js` in `copilot/models/`, now needs deep integration with UI flashcard cards.
2. **CopilotRun Multi-Step Workflow State:**
   - `copilotRun.model.js` tracks single-step write actions. Needs step-by-step progress tracking for multi-step composite plans (e.g. "Find invoice -> Create asset -> Add deadline").
3. **Per-Page Document Chunk Persistence:**
   - `documentChunk.model.js` exists in `copilot/models/`, needs background indexing hook on document creation/update.

---

## 7. SECURITY & AUTHORIZATION GAPS & INVARIANTS

1. **Prompt Injection Defense:** Untrusted document text MUST always be delimited inside `<untrusted_document_data>` tags in orchestrator context so the model never executes instructions contained within uploaded files.
2. **Zero Direct LLM Writes:** The model NEVER executes mutations directly. All write tools return `awaiting_approval` status, saving a `CopilotRun` record that requires user interaction on a Confirmation Card.
3. **PIN Enforcement:** All copilot routes require `pinVerified: true` in the JWT to prevent unauthorized access if a screen is left unlocked without vault PIN entry.

---

## 8. FRONTEND INTEGRATION REQUIREMENTS

1. **Document Preview Cards:**
   - Integrate rich document previews (title, category badge, date, summary, "View Document" modal link) directly beneath Copilot answers.
2. **Interactive Confirmation Cards:**
   - Approve / Reject buttons communicating with `/api/copilot/runs/:id/approve` and `/api/copilot/runs/:id/cancel`.
3. **Tool Execution Timeline:**
   - Collapsible badges indicating tool invocation states (`running`, `done`, `failed`).
4. **Mascot Companion:**
   - Animated SVG mascot Vee synced to streaming lifecycle (`idle`, `thinking`, `working`, `success`, `error`).

---

## 9. RECOMMENDED IMPLEMENTATION SEQUENCE

- **Phase 0:** Audit Report (This document).
- **Phase 1:** Fix Document Preview Cards & Citations in Frontend Copilot UI.
- **Phase 2:** Enhance Tool Registry (`get_document_content`, `ask_documents`, `create_flashcards`, `link_document_to_asset`).
- **Phase 3:** Synchronize Document Chunks & Invalidation on Document CRUD.
- **Phase 4:** Expand Multi-Step Planning & Workflow Timeline in Orchestrator.
- **Phase 5:** End-to-End Test Suite & Verification.

---

## 10. EXPECTED FILES TO CHANGE

- `docs/AI_COPILOT_AUDIT.md` (Created)
- `frontend/src/features/copilot-beta/components/SourceChips.jsx`
- `frontend/src/features/copilot-beta/components/DocumentPreviewCard.jsx` (New)
- `frontend/src/features/copilot-beta/components/Message.jsx`
- `frontend/src/features/copilot-beta/copilotBeta.css`
- `frontend/src/services/api/apiClient.js`
- `backend/src/modules/copilot/orchestrator.js`
- `backend/src/modules/copilot/tools/registry.js`
- `backend/src/modules/copilot/copilot.test.js`
