# DocVault Copilot Beta — Architecture & Developer Documentation

## 1. Overview
**DocVault Copilot Beta** is an autonomous AI assistant that inspects, searches, and executes workflow actions across the user's encrypted vault (documents, flashcards/assets, renewal deadlines, and study decks).

It is built with strict **100% modular isolation**:
- Existing **Ask AI** (`/ask-ai` and `/api/ai/*`) continues running untouched.
- Existing schemas and ingestion pipeline are 100% untouched.
- When `COPILOT_BETA_ENABLED=false`, the backend endpoint `/api/copilot` returns `404 Not Found` and the sidebar link is hidden.

---

## 2. Configuration & Environment Flags

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `COPILOT_BETA_ENABLED` | `false` | Master kill-switch flag. Must be `'true'` to activate route. |
| `COPILOT_BETA_USER_IDS` | `""` | Optional comma-separated list of MongoDB user IDs for beta test enrollment. |
| `GROQ_API_KEY` | *(Existing)* | Used for Groq Cloud chat completions with tool-calling. |
| `HF_EMBEDDING_MODEL` | `BAAI/bge-small-en-v1.5` | Embedding model for 384-dimensional chunk vectors. |

---

## 3. Dedicated Collections (Zero Schema Alteration)
Copilot creates and manages four isolated collections:
1. **`DocumentChunk`** (`backend/src/modules/copilot/models/documentChunk.model.js`):
   - Stores page-aware character chunks (~800 chars with 100 overlap) and 384-d embeddings.
   - Enforces user isolation (`userId`).
   - Automatically skips or purges any documents marked `storage_only` or `sensitiveFlag: true`.
2. **`CopilotRun`** (`backend/src/modules/copilot/models/copilotRun.model.js`):
   - Stores queued write actions with `status: 'awaiting_approval'`, UUID `idempotencyKey`, and a 15-minute TTL.
   - Transitions atomically: `awaiting_approval` &rarr; `executing` &rarr; `completed` / `failed`.
3. **`StudyDeck`** (`backend/src/modules/copilot/models/studyDeck.model.js`):
   - Structured flashcard decks grounded in document pages and excerpts.
4. **`CopilotMessage`** (`backend/src/modules/copilot/models/copilotMessage.model.js`):
   - Copilot-specific chat history per session (never pollutes `Conversation` or `Message`).

---

## 4. Complete Tool Matrix (27 Tools)

### A. 10 Core Read Tools (Execute in-loop)
1. `search_documents`: Search personal & accessible documents by title, keyword, or category.
2. `ask_documents`: Grounded excerpt retrieval with exact page citations.
3. `summarize_document`: Full summary, key details, and extracted fields for a document.
4. `compare_documents`: Side-by-side field and date comparison of two documents.
5. `extract_fields`: Detailed extraction of key fields (GSTIN, dates, totals).
6. `list_deadlines`: Review upcoming renewal deadlines and reminders.
7. `list_assets`: Inspect registered flashcard assets (vehicles, electronics, property).
8. `list_study_decks`: Review study decks generated from document pages.
9. `list_shares`: Review active outgoing document shares.
10. `lookup_docvault_id`: Find user name by DocVault ID (rate limited, no email leaked).

### B. 17 Write Tools (Strict 2-Phase Confirmation Flow)
Write tools NEVER execute directly inside the model loop. They validate schemas and emit `confirmation_required`:
11. `create_asset`: Create a new asset card / flashcard.
12. `update_asset`: Modify asset name, category, custom fields, or warranty.
13. `link_document_to_asset`: Attach a document (receipt/warranty) to an asset.
14. `unlink_document`: Detach a document from an asset.
15. `create_reminder`: Add a renewal deadline or reminder.
16. `update_reminder`: Modify due date, title, or priority.
17. `complete_reminder`: Mark deadline as completed.
18. `update_document_metadata`: Update title or category without altering original file.
19. `create_document_version`: Add version tracking note without overwriting original.
20. `create_document`: Server-side PDF document generation using `pdf-lib`.
21. `create_study_deck`: Generate a study deck grounded in document pages.
22. `edit_study_deck`: Edit deck title or card entries.
23. `remove_study_deck_cards`: Delete specific cards from a study deck.
24. `send_connection_request`: Send connection request by DocVault ID.
25. `create_share`: Create document share link with view/download permission and expiry.
26. `revoke_share`: Revoke an active share immediately.
27. `suggest_share_pack`: Suggest bundled document packs for sharing.

---

## 5. Security Invariants
- **Authentication**: `requireAuth` + token `pinVerified === true` + optional allowlist.
- **Privacy Gates**: Storage-only and sensitive documents (`assertAiAllowed`) are rejected before reaching any prompt or embedding.
- **Prompt Injection Defense**: All retrieved text is enclosed in `<untrusted_document_data>` delimiters and marked inert in the system prompt.
- **No User Spoofing**: `userId` is obtained exclusively from `req.user.userId`.
- **Audit Trails**: Every confirmed action writes to `AuditLog` with action code `*_COPILOT`.

---

## 6. Later Integration with Ask AI
When ready to merge Copilot into Ask AI:
- Import `useCopilotStream` from `features/copilot-beta/hooks/useCopilotStream.js`.
- Reuse standalone UI components: `Mascot`, `MessageList`, `Message`, `ToolRunCard`, `ConfirmCard`, `SourceChips`, and `Composer`.
- Consolidate inline actions in `copilot/services/execution.service.js` into core domain services.
