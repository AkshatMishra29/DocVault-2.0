# DocVault Architecture & System Audit Report

**Date:** 2026-11-24  
**Scope:** Read-only architecture audit of DocVault repository (Frontend, Backend, Microservices, Security, and AI Subsystems).  
**Target Audience:** Systems Engineer / AI Feature Designer.

---

## SECTION 1: REPO MAP

### 1.1 Top-Level Folders & Purpose
- `backend/`: Node.js Express REST API server providing authentication, document storage, OCR cascade, background queue workers, sharing engine, and Ask AI Copilot.
- `frontend/`: React 19 + Vite Single Page Application (SPA) providing the user interface (Vault, Ask AI, Assets, Renewals, Sharing Center, Admin Console).
- `extraction_service/`: Independent Python FastAPI service providing CPU-bound document extraction (PyMuPDF, native C++ Tesseract, OpenCV).
- `python-service/`: Legacy Python FastAPI microservice retained from earlier development phases.
- `validator/`: Isolated Python FastAPI guardrail microservice executing ONNX models and OpenCV image analysis for pre-flight document validation.
- `docs/`: System documentation, architectural audit reports, threat models, and DIHE specifications.
- `uploads/`: Local filesystem directory utilized for temporary quarantine and file staging prior to permanent storage.

### 1.2 Microservice Status (Active / Experimental / Unused)
- **`validator/` — ACTIVE**:
  - *Evidence:* Defined in `docker-compose.yml` (lines 7–29) as container `docvault-validator` exposed on internal port `8001`. Integrated directly into the backend upload pipeline via `backend/src/modules/extraction/validatorClient.service.js` (lines 25, 75) which sends pre-flight validation requests (`POST /validate`) with `X-Internal-Token`. Invoked in `backend/src/modules/documents/document.routes.js` (lines 223–242, 255–277).
- **`extraction_service/` — EXPERIMENTAL / FALLBACK**:
  - *Evidence:* Contains a complete FastAPI application in `extraction_service/app/main.py` and test suite `extraction_service/tests/run_tests.py`. Connected via client `backend/src/modules/extraction/extractionServiceClient.js` (lines 7–68) which attempts `POST /api/extract` at `http://127.0.0.1:8000`. However, it is **not** present in `docker-compose.yml`. When offline, `backend/src/modules/extraction/extractionPipeline.service.js` (lines 143–189) gracefully falls back to local in-process Node extraction (`pdf-parse` and `tesseract.js`).
- **`python-service/` — UNUSED / DEPRECATED**:
  - *Evidence:* Contains `python-service/app/main.py`, but has no references in `docker-compose.yml`, no configuration references in `backend/src/config/index.js`, and zero imports or HTTP client invocations across the backend codebase.

### 1.3 `docker-compose.yml` Services & Topology
- **Services:**
  1. `validator`: Builds `./validator/Dockerfile`. Container `docvault-validator`. Exposes internal port `8001`. Volume: `docvault_quarantine:/quarantine:ro` (read-only). Networks: `internal_net`. No dependencies.
  2. `backend`: Builds `./backend/Dockerfile`. Container `docvault-backend`. Port binding: `5001:5001`. Volume: `docvault_quarantine:/quarantine:rw`. Networks: `internal_net`, `public_net`. `depends_on`: `validator`.
  3. `frontend`: Builds `./frontend/Dockerfile`. Container `docvault-frontend`. Port binding: `5173:80`. Networks: `public_net`. `depends_on`: `backend`.
- **Networks:**
  - `internal_net`: Driver bridge, `internal: true` (no outbound internet access).
  - `public_net`: Driver bridge (ingress for clients).
- **Volumes:**
  - `docvault_quarantine`: Local Docker volume shared between backend and validator.

### 1.4 Implementation Status Summary (from `IMPLEMENTATION_STATUS.md` & `PROJECT_PROGRESS.md`)
1. **Sharing:** BUILT. Expiring share links, view counts, password/OTP verification, watermarking, and audit logs.
2. **Connections / Family:** BUILT. DocVault ID reciprocal connections, connection requests, and access policies.
3. **Flashcards (Assets):** BUILT. Physical possession tracker (electronics, vehicles, appliances), metadata, and document linking.
4. **Bank Statements:** BUILT. Statement upload, transaction preview/confirmation, and category expense aggregation.
5. **Intelligence / Knowledge Graph:** BUILT. DIHE engine, entity extraction, relation links, conflict detection, and graph queries.
6. **Admin Console:** BUILT. Admin dashboard page, system stats KPI endpoint (`GET /api/vault/admin/stats`), custodian registry, and audit log viewer.
7. **Versioning:** BUILT. Document version groups, version incrementing, and comparison endpoints.
8. **Notifications:** BUILT. In-app notification center for expiring deadlines and sharing requests.

---

## SECTION 2: BACKEND ARCHITECTURE

### 2.1 `package.json` Specification
- **File:** `backend/package.json`
- **Node Target:** Node.js 22 (`FROM node:22-alpine` in `backend/Dockerfile`)
- **Module Type:** ECMAScript Modules (`"type": "module"`)
- **Scripts:**
  - `start`: `node src/server.js`
  - `dev`: `node --watch src/server.js`
  - `test`: `node tests/phaseA.test.js && node tests/pipelineVerification.test.js && node tests/ocrWorstCase.test.js && node tests/intelligenceEngine.test.js`
  - `test:phase-a`: `node tests/phaseA.test.js`
  - `test:intelligence`: `node tests/intelligenceEngine.test.js`
  - `test:api`: `node tests/apiAudit.test.js`
  - `test:qa`: `node tests/qaSeniorTest.js`
  - `test:sharing`: `node --test tests/sharingEngine.test.js`
  - `test:sharing-id`: `node --test tests/sharingIdVerification.test.js`
  - `db:clear`: `node scripts/clearDatabase.js`
  - `db:purge-all`: `node scripts/purgeAllAuthAndDb.js`
- **Dependencies:**
  - `@aws-sdk/client-s3`: `^3.1158.0`
  - `@aws-sdk/s3-request-presigner`: `^3.1158.0`
  - `@huggingface/transformers`: `^4.3.2`
  - `bcryptjs`: `^3.0.3`
  - `cors`: `^2.8.6`
  - `dotenv`: `^18.0.9`
  - `express`: `^5.3.0`
  - `firebase-admin`: `^14.5.0`
  - `google-auth-library`: `^11.3.4`
  - `groq-sdk`: `^1.6.0`
  - `jsonwebtoken`: `^9.0.3`
  - `mongoose`: `^9.11.4`
  - `multer`: `^2.5.0`
  - `nodemailer`: `^10.3.1`
  - `pdf-img-convert`: `^2.0.0`
  - `pdf-parse`: `^2.4.5`
  - `sharp`: `^0.35.5`
  - `tesseract.js`: `^7.0.0`

### 2.2 Entry & Application Setup
- **Server Entry:** `backend/src/server.js`
  - Sets IPv4-first DNS resolution (`dns.setDefaultResultOrder('ipv4first')`).
  - Calls `app.listen(config.port)`.
  - Invokes `prewarmGoogleOAuth()` to pre-fetch public Google certs.
  - Connects to MongoDB Atlas via `mongoose.connect(config.mongoUri)`.
  - Starts background services: `startJobWorker()`, `startSharingExpiryWorker()`, `backfillDocVaultIds()`.
- **Application Setup:** `backend/src/app.js`
  - **Middleware execution order:**
    1. `cors({ origin: allowedOrigins, credentials: true })`
    2. `express.json()`
    3. `authenticateToken` (`backend/src/middleware/auth.middleware.js`) — Runs on every incoming request.
    4. Health check endpoint: `GET /api/health`
    5. Route prefix mounts:
       - `/api/auth` -> `authRoutes`
       - `/api/documents` -> `documentRoutes`
       - `/api/assets` -> `assetRoutes`
       - `/api/deadlines` -> `deadlineRoutes`
       - `/api/ai` -> `aiRoutes`
       - `/api/vault` -> `vaultRoutes`
       - `/api/extraction` -> `extractionRoutes`
       - `/api/intelligence` -> `intelligenceRoutes`
       - `/api/connections` -> `connectionRoutes`
       - `/api/sharing` -> `sharingRoutes`
       - `/api/expenses` -> `expenseRoutes`
       - `/api/timeline` -> `timelineRoutes`
       - `/api/notifications` -> `notificationRoutes`
       - `/api/bank-statements` -> `bankStatementRoutes`
       - `/api/shares` -> `sharesRoutes`
    6. Static file serving: `express.static(frontendDistPath)` with `Cache-Control: no-cache` for HTML files.
    7. SPA fallback: `sendFile(index.html)` for all non-API paths.

### 2.3 Complete Route Table
| METHOD | Path | Middleware Chain | Controller / Handler Function | File |
| :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/health` | None | Inline health status check | `backend/src/app.js` |
| **POST** | `/api/auth/send-otp` | None | `authController.sendOtp` | `backend/src/modules/auth/auth.routes.js` |
| **POST** | `/api/auth/verify-otp` | None | `authController.verifyOtp` | `backend/src/modules/auth/auth.routes.js` |
| **POST** | `/api/auth/register` | None | `authController.register` | `backend/src/modules/auth/auth.routes.js` |
| **POST** | `/api/auth/login` | None | `authController.login` | `backend/src/modules/auth/auth.routes.js` |
| **POST** | `/api/auth/login-otp` | None | `authController.loginWithOtp` | `backend/src/modules/auth/auth.routes.js` |
| **POST** | `/api/auth/reset-password` | None | `authController.resetPassword` | `backend/src/modules/auth/auth.routes.js` |
| **POST** | `/api/auth/reset-pin` | None | `authController.resetPin` | `backend/src/modules/auth/auth.routes.js` |
| **POST** | `/api/auth/setup-credentials` | None | `authController.setupCredentials` | `backend/src/modules/auth/auth.routes.js` |
| **POST** | `/api/auth/change-pin` | `requireAuth` | `authController.changePin` | `backend/src/modules/auth/auth.routes.js` |
| **POST** | `/api/auth/change-password` | `requireAuth` | `authController.changePassword` | `backend/src/modules/auth/auth.routes.js` |
| **POST** | `/api/auth/google` | None | `authController.googleAuth` | `backend/src/modules/auth/auth.routes.js` |
| **POST** | `/api/auth/firebase` | None | `authController.firebaseAuth` | `backend/src/modules/auth/auth.routes.js` |
| **POST** | `/api/auth/verify-pin` | None | `authController.verifyPin` | `backend/src/modules/auth/auth.routes.js` |
| **GET** | `/api/auth/me` | `requireAuth` | `authController.getMe` | `backend/src/modules/auth/auth.routes.js` |
| **POST** | `/api/auth/biometrics/verify` | None | `authController.verifyBiometrics` | `backend/src/modules/auth/auth.routes.js` |
| **POST** | `/api/auth/biometrics/register` | `requireAuth` | `authController.registerBiometrics` | `backend/src/modules/auth/auth.routes.js` |
| **PATCH** | `/api/auth/session-settings` | `requireAuth` | `authController.updateSessionSettings` | `backend/src/modules/auth/auth.routes.js` |
| **GET** | `/api/documents` | `requireAuth` | Inline list documents with category & search filters | `backend/src/modules/documents/document.routes.js` |
| **GET** | `/api/documents/:id` | `requireAuth` | Inline get document detail by ID | `backend/src/modules/documents/document.routes.js` |
| **GET** | `/api/documents/:id/status` | `requireAuth` | Inline get document processing status | `backend/src/modules/documents/document.routes.js` |
| **POST** | `/api/documents/upload` | `requireAuth`, `upload.single('file')` | Inline upload, validation, duplicate check, and queue | `backend/src/modules/documents/document.routes.js` |
| **PATCH** | `/api/documents/:id/ai-policy` | `requireAuth` | Inline update AI policy (`storage_only` vs `ai_enabled`) | `backend/src/modules/documents/document.routes.js` |
| **GET** | `/api/documents/:id/preview` | `requireAuth` | Inline stream document content with 206 range support | `backend/src/modules/documents/document.routes.js` |
| **GET** | `/api/documents/:id/download` | `requireAuth` | Inline download document attachment | `backend/src/modules/documents/document.routes.js` |
| **PATCH** | `/api/documents/:id` | `requireAuth` | Inline update document metadata | `backend/src/modules/documents/document.routes.js` |
| **DELETE** | `/api/documents/:id` | `requireAuth` | Inline delete document, deadlines, and jobs | `backend/src/modules/documents/document.routes.js` |
| **GET** | `/api/assets` | `requireAuth` | Inline list assets for user | `backend/src/modules/assets/asset.routes.js` |
| **POST** | `/api/assets` | `requireAuth` | Inline create asset flashcard | `backend/src/modules/assets/asset.routes.js` |
| **GET** | `/api/assets/:id` | `requireAuth` | Inline get single asset | `backend/src/modules/assets/asset.routes.js` |
| **PUT** | `/api/assets/:id` | `requireAuth` | Inline update asset | `backend/src/modules/assets/asset.routes.js` |
| **POST** | `/api/assets/:id/documents` | `requireAuth` | Inline link document to asset | `backend/src/modules/assets/asset.routes.js` |
| **DELETE** | `/api/assets/:id/documents/:documentId` | `requireAuth` | Inline unlink document from asset | `backend/src/modules/assets/asset.routes.js` |
| **GET** | `/api/assets/:id/vehicle-wallet` | `requireAuth` | Inline get vehicle-specific wallet documents | `backend/src/modules/assets/asset.routes.js` |
| **GET** | `/api/assets/:id/policy-health` | `requireAuth` | Inline get insurance policy health metrics | `backend/src/modules/assets/asset.routes.js` |
| **DELETE** | `/api/assets/:id` | `requireAuth` | Inline delete asset | `backend/src/modules/assets/asset.routes.js` |
| **GET** | `/api/deadlines` | `requireAuth` | Inline list upcoming deadlines | `backend/src/modules/deadlines/deadline.routes.js` |
| **POST** | `/api/deadlines` | `requireAuth` | Inline create deadline reminder | `backend/src/modules/deadlines/deadline.routes.js` |
| **PATCH** | `/api/deadlines/:id/complete` | `requireAuth` | Inline toggle deadline completion | `backend/src/modules/deadlines/deadline.routes.js` |
| **PUT** | `/api/deadlines/:id` | `requireAuth` | Inline update deadline | `backend/src/modules/deadlines/deadline.routes.js` |
| **DELETE** | `/api/deadlines/:id` | `requireAuth` | Inline delete deadline | `backend/src/modules/deadlines/deadline.routes.js` |
| **GET** | `/api/deadlines/calendar.ics` | `requireAuth` | Inline export iCalendar feed | `backend/src/modules/deadlines/deadline.routes.js` |
| **GET** | `/api/notifications` | `requireAuth` | Inline get unread in-app notifications | `backend/src/modules/deadlines/notification.routes.js` |
| **PATCH** | `/api/notifications/:id/read` | `requireAuth` | Inline mark notification read | `backend/src/modules/deadlines/notification.routes.js` |
| **PATCH** | `/api/notifications/read-all` | `requireAuth` | Inline mark all notifications read | `backend/src/modules/deadlines/notification.routes.js` |
| **POST** | `/api/ai/query` | `requireAuth` | `handleAiQuery` | `backend/src/modules/ai/ai.routes.js` |
| **POST** | `/api/ai/ask` | `requireAuth` | `handleAiQuery` (backward compatibility alias) | `backend/src/modules/ai/ai.routes.js` |
| **GET** | `/api/ai/conversations` | `requireAuth` | Inline list user conversations | `backend/src/modules/ai/ai.routes.js` |
| **POST** | `/api/ai/conversations` | `requireAuth` | Inline create new conversation | `backend/src/modules/ai/ai.routes.js` |
| **GET** | `/api/ai/conversations/:id` | `requireAuth` | Inline get conversation message history | `backend/src/modules/ai/ai.routes.js` |
| **PATCH** | `/api/ai/conversations/:id` | `requireAuth` | Inline rename conversation title | `backend/src/modules/ai/ai.routes.js` |
| **DELETE** | `/api/ai/conversations/:id` | `requireAuth` | Inline delete conversation and messages | `backend/src/modules/ai/ai.routes.js` |
| **GET** | `/api/vault/export` | `requireAuth` | Inline export entire vault data package | `backend/src/modules/vault/vault.routes.js` |
| **GET** | `/api/vault/audit-trail` | `requireAuth` | Inline retrieve user audit logs | `backend/src/modules/vault/vault.routes.js` |
| **GET** | `/api/vault/admin/stats` | `requireAuth` | Inline retrieve enterprise admin stats | `backend/src/modules/vault/vault.routes.js` |
| **GET** | `/api/extraction/review-queue` | `requireAuth` | Inline retrieve documents requiring human review | `backend/src/modules/extraction/extraction.routes.js` |
| **POST** | `/api/extraction/correct-field` | `requireAuth` | Inline submit user correction for extracted field | `backend/src/modules/extraction/extraction.routes.js` |
| **GET** | `/api/extraction/token-stats` | `requireAuth` | Inline retrieve user and global token consumption | `backend/src/modules/extraction/extraction.routes.js` |
| **GET** | `/api/connections` | `requireAuth` | Inline list active mutual connections | `backend/src/modules/sharing/connection.routes.js` |
| **GET** | `/api/connections/requests` | `requireAuth` | Inline list pending connection requests | `backend/src/modules/sharing/connection.routes.js` |
| **POST** | `/api/connections/request` | `requireAuth`, `rateLimit(60s, 15)` | Inline send connection request via DocVault ID | `backend/src/modules/sharing/connection.routes.js` |
| **POST** | `/api/connections/requests/:id/accept` | `requireAuth` | Inline accept connection request | `backend/src/modules/sharing/connection.routes.js` |
| **POST** | `/api/connections/requests/:id/reject` | `requireAuth` | Inline reject connection request | `backend/src/modules/sharing/connection.routes.js` |
| **DELETE** | `/api/connections/requests/:id` | `requireAuth` | Inline cancel outgoing connection request | `backend/src/modules/sharing/connection.routes.js` |
| **DELETE** | `/api/connections/:targetUserId` | `requireAuth` | Inline disconnect mutual peer | `backend/src/modules/sharing/connection.routes.js` |
| **POST** | `/api/connections/:targetUserId/block` | `requireAuth` | Inline block user | `backend/src/modules/sharing/connection.routes.js` |
| **POST** | `/api/connections/:targetUserId/unblock` | `requireAuth` | Inline unblock user | `backend/src/modules/sharing/connection.routes.js` |
| **POST** | `/api/shares` | `requireAuth` | Inline create time-limited document share link | `backend/src/modules/sharing/shares.routes.js` |
| **GET** | `/api/shares/sent` | `requireAuth` | Inline list shares created by user | `backend/src/modules/sharing/shares.routes.js` |
| **GET** | `/api/shares/received` | `requireAuth` | Inline list shares received by user | `backend/src/modules/sharing/shares.routes.js` |
| **GET** | `/api/shares/lookup-recipient` | `requireAuth` | `lookupRecipientHandler` | `backend/src/modules/sharing/shares.routes.js` |
| **GET** | `/api/shares/:id` | None (Public / Token) | Inline get shared document metadata | `backend/src/modules/sharing/shares.routes.js` |
| **PATCH** | `/api/shares/:id` | `requireAuth` | Inline modify share permissions / expiry | `backend/src/modules/sharing/shares.routes.js` |
| **DELETE** | `/api/shares/:id` | `requireAuth` | Inline revoke share | `backend/src/modules/sharing/shares.routes.js` |
| **POST** | `/api/shares/:id/request-otp` | None | Inline send OTP to recipient email | `backend/src/modules/sharing/shares.routes.js` |
| **POST** | `/api/shares/:id/verify-otp` | None | Inline verify OTP for shared document access | `backend/src/modules/sharing/shares.routes.js` |
| **POST** | `/api/shares/:id/verify-password` | None | Inline verify passcode for shared link | `backend/src/modules/sharing/shares.routes.js` |
| **GET** | `/api/shares/:id/document` | None | Inline stream shared document binary | `backend/src/modules/sharing/shares.routes.js` |
| **GET** | `/api/shares/:id/download` | None | Inline download shared document file | `backend/src/modules/sharing/shares.routes.js` |
| **POST** | `/api/shares/suggest-pack` | `requireAuth` | Inline suggest grouped documents for sharing | `backend/src/modules/sharing/shares.routes.js` |
| **POST** | `/api/shares/:id/questions` | None | Inline ask question on shared document | `backend/src/modules/sharing/shares.routes.js` |
| **GET** | `/api/shares/:id/questions` | None | Inline list questions asked on shared document | `backend/src/modules/sharing/shares.routes.js` |
| **GET** | `/api/shares/:id/activity` | `requireAuth` | Inline list recipient access log for share | `backend/src/modules/sharing/shares.routes.js` |
| **POST** | `/api/expenses` | `requireAuth` | Inline log manual asset expense | `backend/src/modules/assets/expense.routes.js` |
| **GET** | `/api/expenses` | `requireAuth` | Inline list user expenses | `backend/src/modules/assets/expense.routes.js` |
| **GET** | `/api/expenses/summary` | `requireAuth` | Inline get expense analytics summary | `backend/src/modules/assets/expense.routes.js` |
| **DELETE** | `/api/expenses/:id` | `requireAuth` | Inline delete expense | `backend/src/modules/assets/expense.routes.js` |
| **GET** | `/api/timeline` | `requireAuth` | Inline get unified asset & renewal timeline | `backend/src/modules/assets/timeline.routes.js` |
| **POST** | `/api/bank-statements/preview` | `requireAuth`, `upload.single('file')` | Inline parse bank statement and extract transactions | `backend/src/modules/assets/bankStatement.routes.js` |
| **POST** | `/api/bank-statements/confirm` | `requireAuth` | Inline commit parsed transactions to vault | `backend/src/modules/assets/bankStatement.routes.js` |
| **GET** | `/api/bank-statements/transactions` | `requireAuth` | Inline list bank transactions with category filters | `backend/src/modules/assets/bankStatement.routes.js` |

*(Note: DIHE Intelligence routes mounted on `/api/intelligence/*` are protected via `router.use(requireAuth)` in `backend/src/modules/intelligence/intelligence.routes.js` lines 65).*

---

### 2.4 Authentication, PIN Verification & Two-Tier Token Flow
- **Overview:**
  DocVault implements a two-tier authentication architecture designed for zero-knowledge vault protection:
  1. **Tier 1 (Account Login):** User authenticates with email + password or Google OAuth. Server issues a 7-day JWT containing `{ userId, email, sessionVersion, pinVerified: false }`. The user identity is authenticated, but the vault remains locked (`requiresPin: true`).
  2. **Tier 2 (PIN Quick Unlock):** User enters a 4-to-6 digit numeric PIN via `POST /api/auth/verify-pin`. Server compares against `pinHash` (bcrypt) and issues an elevated 7-day JWT containing `{ userId, email, pinVerified: true, sessionVersion }`.
- **Token Payload:**
  ```json
  {
    "userId": "6741b0...",
    "email": "user@example.com",
    "pinVerified": true,
    "sessionVersion": 1,
    "iat": 1732420000,
    "exp": 1733024800
  }
  ```
- **Single-Session Enforcement & Device Switching:**
  Each user has a `sessionVersion` integer in MongoDB. When `singleSessionOnly: true` is enabled and a new device logs in, `sessionVersion` is incremented. If an incoming request contains an older `sessionVersion`, the middleware sets `req.sessionTerminated = true`, and `requireAuth` immediately returns HTTP `401` with `code: 'SESSION_TERMINATED'`.
- **Auth Middleware Excerpt (`backend/src/middleware/auth.middleware.js`):**
```javascript
export async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  if (!token && req.query.token) token = req.query.token;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (!decoded || !decoded.userId) {
      req.user = null;
      return next();
    }

    if (decoded.sessionVersion !== undefined) {
      const user = await User.findById(decoded.userId).select('sessionVersion singleSessionOnly');
      if (user && user.singleSessionOnly && user.sessionVersion !== decoded.sessionVersion) {
        req.user = null;
        req.sessionTerminated = true;
        return next();
      }
    }

    req.user = decoded;
    next();
  } catch (err) {
    req.user = null;
    next();
  }
}
```

---

### 2.5 MongoDB Models & Schemas
DocVault uses Mongoose 9 connected to MongoDB Atlas.

1. **`Document` (`backend/src/modules/documents/document.model.js`):**
   - `userId`: `ObjectId` (ref: `User`, required, indexed).
   - `title`: `String` (required), `originalName`: `String` (required).
   - `category`: `String` (default: `'Other'`, indexed).
   - `format`: `String` (`'PDF'`, `'PNG'`, etc.), `mimetype`: `String`.
   - `fileData`: `String` (Base64-encoded file buffer embedded in MongoDB).
   - `sizeBytes`: `Number`, `fileSizeFormatted`: `String`.
   - `storagePath`: `String` (default: `'mongodb-embedded'`).
   - `extractedText`: `String` (full raw OCR text or `'[REDACTED - STORAGE ONLY DOCUMENT]'`).
   - `summary`: `String`, `keyDetails`: `Mixed`, `tags`: `[String]`.
   - `documentDate`: `String` (`YYYY-MM-DD`, indexed), `expiryDate`: `String` (`YYYY-MM-DD`, indexed).
   - `isExpiringSoon`: `Boolean`.
   - `tierUsed`: `String` (`'Tier 1 (Regex & Rules)'`, `'Tier 3 (Groq LLM)'`, etc.).
   - `confidenceScore`: `Number` (0.0 to 1.0).
   - `embedding`: `[Number]` (384-dimensional dense vector from Hugging Face).
   - `aiPolicy`: `String` (`'storage_only'` | `'ai_enabled'`, default: `'storage_only'`, indexed).
   - `privacyMode`: `String` (`'STORAGE_ONLY'` | `'PROCESSABLE'`).
   - `sensitiveFlag`: `Boolean` (indexed), `sensitiveReason`: `String`.
   - `aiConsent`: `{ grantedAt: Date, noticeVersion: String }`.
   - `status`: `String` (`'PENDING'`, `'ACCEPTED'`, `'REJECTED'`, `'REVIEW'`, `'queued'`, `'processing'`, `'completed'`, `'needs_review'`, `'storage_only'`).
   - `sha256`: `String` (indexed), `fileHash`: `String` (indexed).
   - `pageCount`: `Number` (max 25).
   - `doc_type`: `String` (`'invoice'`, `'receipt'`, `'bill'`, `'id_card'`, `'certificate'`, `'insurance_policy'`, etc.).
   - `extractedFields`: `[ExtractedFieldSchema]` (`fieldName`, `value`, `evidence`, `pageNumber`, `confidence`, `verificationStatus`: `accepted`|`needs_review`|`rejected`|`user_corrected`).
   - `pages`: `[DocumentPageSchema]` (`pageNumber`, `method`, `status`, `text`, `confidence`).
   - **Indexes:** `{ userId: 1, sha256: 1 }`, `{ userId: 1, fileHash: 1 }`, `{ category: 1 }`, `{ status: 1 }`.

2. **`User` (`backend/src/modules/auth/auth.model.js`):**
   - `name`: `String`, `email`: `String` (unique, required), `docVaultId`: `String` (unique, sparse, indexed, format: `DV-XXXX-XXXX`).
   - `passwordHash`: `String`, `pinHash`: `String`, `pinLength`: `Number` (4 or 6), `pinSet`: `Boolean`.
   - `authProvider`: `String` (`'local'` | `'google'`), `tier`: `String`.
   - `singleSessionOnly`: `Boolean`, `sessionVersion`: `Number` (default: 1).
   - `autoLockEnabled`: `Boolean`, `biometricsEnabled`: `Boolean`, `offlineAccessEnabled`: `Boolean`.

3. **`Asset` (`backend/src/modules/assets/asset.model.js`):**
   - `userId`: `ObjectId` (ref: `User`, required, indexed).
   - `name`: `String`, `category`: `String` (e.g. `Electronics`, `Vehicle`, `Appliance`).
   - `customFields`: `[{ label: String, value: String, type: String }]`.
   - `metadata`: `Mixed` (e.g. `regNumber`, `chassisNumber`, `serialNumber`, `brand`).
   - `purchaseDate`: `String`, `warrantyExpiry`: `String`, `insuranceExpiry`: `String`, `pucExpiry`: `String`, `nextService`: `String`.
   - `linkedDocumentIds`: `[{ type: ObjectId, ref: 'Document' }]`.
   - **Index:** `{ userId: 1, category: 1 }`.

4. **`Deadline` (`backend/src/modules/deadlines/deadline.model.js`):**
   - `userId`: `ObjectId`, `title`: `String`, `date`: `String` (`YYYY-MM-DD`), `daysLeft`: `Number`.
   - `category`: `String` (e.g. `Insurance Expiry`, `Policy Renewal`, `Warranty Expiry`).
   - `severity`: `String` (`'urgent'` | `'upcoming'` | `'normal'`).
   - `linkedDocId`: `ObjectId` (ref: `Document`), `linkedAssetId`: `ObjectId` (ref: `Asset`).
   - `status`: `String` (`'Upcoming'`, `'Due Soon'`, `'Overdue'`, `'Completed'`).
   - **Index:** `{ userId: 1, date: 1, isCompleted: 1 }`.

5. **`AuditLog` (`backend/src/modules/vault/auditLog.model.js`):**
   - `userId`: `ObjectId`, `action`: `String` (`VIEW`, `DOWNLOAD`, `UPLOAD`, `DELETE`, `LOGIN`, `EXPORT`).
   - `documentTitle`: `String`, `ipAddress`: `String`, `device`: `String`, `timestamp`: `Date`.

6. **`Conversation` & `Message` (`backend/src/modules/ai/models/`):**
   - `Conversation`: `userId`: `ObjectId` (indexed), `title`: `String` (default: `'New Conversation'`), `lastMessageAt`: `Date` (indexed).
   - `Message`: `conversationId`: `ObjectId` (indexed), `userId`: `ObjectId` (indexed), `role`: `String` (`'user'` | `'assistant'` | `'system'`), `content`: `String`, `confidence`: `String` (`'high'` | `'medium'` | `'low'`), `referencedDocIds`: `[{ type: ObjectId, ref: 'Document' }]`, `sources`: `[{ type, assetId, documentId, title, category, documentType, pageNumber, previewRoute, downloadUrl }]`.

7. **Other Models in System:**
   - `Expense`, `TimelineEvent`, `BankTransaction`, `InAppNotification`, `TokenLedger`, `ExtractionJob`, `ReviewHistory`, `Job` (Queue), `Entity`, `Relationship`, `DocumentFact`, `ConflictRecord`, `DocumentVersionGroup`, `IntelligenceAlert`, `VerificationRecord`, `RequirementTemplate`, `DocumentShare`, `DocumentShareGrant`, `ShareAccessLog`, `UserConnection`, `ConnectionRequest`.

---

### 2.6 AI Module (`backend/src/modules/ai/` & `backend/src/services/ai/`)

#### A. Endpoints & Request / Response Shapes
- **Endpoints:** `POST /api/ai/query` and `POST /api/ai/ask` (both handled by `handleAiQuery` in `backend/src/modules/ai/ai.routes.js`).
- **Streaming:** **NO streaming is used**. The API returns a synchronous JSON response.
- **Request Body:**
  ```json
  {
    "question": "What is the policy number and expiry of my Honda insurance?",
    "docId": "6741b0...",          // Optional: limits search to single document
    "conversationId": "6741c2..."   // Optional: associates query with existing chat
  }
  ```
- **Response Body:**
  ```json
  {
    "success": true,
    "data": {
      "conversationId": "6741c2901234567890abcdef",
      "answer": "According to **Honda Insurance Policy** (Page 1), your Policy Number is **POL-4412** and it expires on **2026-08-15**.\n\n*For full details or complete verification, you can view the original document directly below.*",
      "confidence": "high",
      "sources": [
        {
          "type": "document",
          "documentId": "6741b0901234567890abcdef",
          "title": "Honda Insurance Policy",
          "category": "Insurance Policy",
          "documentType": "pdf",
          "pageNumber": 1,
          "previewRoute": "/documents/6741b0901234567890abcdef",
          "downloadUrl": "/api/documents/6741b0901234567890abcdef/download"
        }
      ],
      "referencedDocIds": ["6741b0901234567890abcdef"],
      "referencedDocs": [
        { "id": "6741b0901234567890abcdef", "title": "Honda Insurance Policy", "category": "Insurance Policy" }
      ],
      "referencedAssets": [],
      "actionItem": null
    }
  }
  ```

#### B. Step-by-Step Retrieval & Generation Pipeline
1. **User Isolation & Access Verification:**
   - Single doc query: `DocumentAccessControlService.canViewDocument(req.user.userId, docId)`.
   - Vault-wide query: `DocumentAccessControlService.getAccessibleDocumentIds(req.user.userId, 'view')`.
2. **Storage-Only & Privacy Hard Gates:**
   - Filters candidate documents where `aiPolicy === 'ai_enabled'` (or legacy `PROCESSABLE`) and `sensitiveFlag !== true` (`backend/src/modules/ai/ai.routes.js` lines 400–411).
   - Enforces `assertAiAllowed(doc, context)`: throws `PrivacyPolicyViolationError` if `doc.aiPolicy === 'storage_only'`.
3. **Conversational Intent Fast-Path:**
   - Evaluates query with `classifyConversationalIntent(question)` (`backend/src/modules/ai/conversationalIntent.service.js`). Greetings and identity queries resolve in `< 1ms` with zero token cost.
4. **Hybrid Retrieval (RRF):**
   - **Dense Semantic Retrieval:** Generates 384-dimensional vector for question via Hugging Face Inference API (`generateEmbedding`, `bge-small-en-v1.5`). Computes cosine similarity against `doc.embedding`.
   - **Sparse Lexical Retrieval:** Computes domain-weighted keyword matching (`computeLexicalScore`, `computeAssetScore`) with Hindi/Hinglish synonym recognition (`bijli`, `gadi`, `bima`).
   - **Reciprocal Rank Fusion (RRF):** Combines dense rank and lexical rank: `RRF = 1.0 / (60 + denseRank) + 1.5 / (60 + lexicalRank)` with domain intent boosters (+0.25 for resumes/projects, +0.08 for finances, +0.12 for certs).
   - Picks top candidate documents (up to 5 documents, bounded context window up to 60,000 chars).
5. **Prompt Assembly & LLM Generation:**
   - Assembled in `backend/src/services/ai/groqService.js` (`answerDocumentQuery`).
   - **Model:** Primary `openai/gpt-oss-120b` or `qwen/qwen3.8-27b`, with fallback chain: `['qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'openai/gpt-oss-safeguard-20b']`.
   - **Parameters:** `temperature: 0.2`, `max_tokens: 2500` (up to 3000 for reasoning models).
   - **Deterministic Fallback Engine:** If all Groq LLM calls fail or rate-limit, `answerWithDeterministicGrounding` executes an offline rule-based solver that extracts facts directly from `doc.extractedFields` and `doc.keyDetails` in `< 10ms`.

#### C. System Prompt Text (Excerpt from `backend/src/services/ai/groqService.js` lines 320–379)
```text
You are the DocVault AI Assistant.
CORE OPERATING PRINCIPLE:
Provide an executive, beautifully formatted production-grade response grounded strictly in the provided documents and tracked assets. Adapt your formatting dynamically to the user's intent: provide rich, itemized, structured Markdown when asked for resumes, profiles, certifications, or bills; provide direct laser-focused answers when asked for a specific single fact.

RULES:
- Strict Entity Isolation: If the user asks about a resume, do NOT cite or mention an electricity bill. If the user asks about an electricity bill, do NOT cite a certificate or resume.
- Referral Notice: Conclude document answers with "*For full details or complete verification, you can view the original document directly below.*"
- Conclude asset flashcard answers with "*For complete details, you can open your asset flashcard directly below.*"
- Not Found: If the answer is not contained in the context, state cleanly: "I cannot find that information in your currently uploaded documents or tracked assets."
```

#### D. Sources & Citations
- Computed by `resolveQuerySourcesAndEntities` (`backend/src/modules/ai/ai.routes.js` lines 144–266).
- Checks whether answer mentions asset name or document title; extracts page references via regex `/\(Page\s*(\d+)\)/i`.
- Structure: `{ type: 'document'|'asset', documentId, assetId, title, category, documentType, pageNumber, previewRoute, downloadUrl }`.

#### E. Conversation History Management
- Stored server-side in MongoDB collections: `Conversation` and `Message`.
- Endpoints:
  - `GET /api/ai/conversations`: Lists user conversations sorted by `lastMessageAt: -1`.
  - `POST /api/ai/conversations`: Initializes new conversation.
  - `GET /api/ai/conversations/:id`: Returns conversation details and chronological message array.
  - `PATCH /api/ai/conversations/:id`: Renames conversation title.
  - `DELETE /api/ai/conversations/:id`: Deletes conversation and all linked messages (`Message.deleteMany`).

---

### 2.7 Document Ingestion & OCR Cascade
- **Upload Endpoint:** `POST /api/documents/upload` (`backend/src/modules/documents/document.routes.js`).
- **Multer Configuration:** `multer.memoryStorage()`, `limits: { fileSize: 25 * 1024 * 1024 }` (25 MB cap).
- **Ingestion Cascade Stages:**
  1. *Upload Rate Limiting:* Sliding window in-memory rate check per user (`checkUploadRateLimit`).
  2. *Duplicate Document Guardrail:* Computes SHA-256 hash. If duplicate exists for user, rejects with `409 Conflict` (`DUPLICATE_DOCUMENT`).
  3. *Quarantine Staging:* Writes buffer to `uploads/quarantine/`.
  4. *Layer 1 Security Checks:* Validates binary magic bytes (`%PDF-`, PNG, JPEG). Rejects PDFs exceeding 25 pages (`validatePdfSafety`).
  5. *Image Quality & Blur Check:* Computes 2D discrete Laplacian variance via Sharp; rejects blurry images (`IMAGE_BLURRY`) or non-document casual photos.
  6. *Validator Microservice:* Sends quarantine path to Python validator service (`POST /validate`).
  7. *Sensitive Document Gate:* In-process detection (`detectSensitiveDocument`) for Indian IDs (Aadhaar, PAN, Passport MRZ, DL). If sensitive pattern matched, **forces `aiPolicy: 'storage_only'`**.
  8. *Permanent Storage:* Writes document to MongoDB embedded base64 storage (`fileData`) and unlinks quarantine file.
  9. *Background Job Enqueue:* If `aiPolicy === 'ai_enabled'`, enqueues job in `Job` collection and dispatches worker.
- **OCR Cascade Execution:**
  - *All Pages vs. Page 1:* `pdf-parse` extracts text from **all pages** of the PDF text layer. If scanned (minimal text < 50 chars), `convertPdfToImages` rasterizes up to 15 pages in Node fallback (up to 25 pages in Python extraction service) and runs Tesseract OCR per page.
  - *Page-Aware Text Storage:* Stored in `Document.extractedText` with delimited headers `--- Page X ---`, and page-level metadata recorded in `Document.pages` array (`pageNumber`, `method`, `status`, `text`, `confidence`).
  - *Embeddings Lifecycle:* Single 384-dimensional vector stored in `Document.embedding`. Created upon pipeline completion via Hugging Face API. **Not** updated upon `PATCH /api/documents/:id`. Removed upon `DELETE /api/documents/:id`.
  - *"Needs Review" Trigger:* Triggered when any extracted field fails format/logic verification gates or has confidence $0.60 \le score < 0.88$. Sets `processingStatus: 'needs_review'` and `reviewStatus: 'pending_review'`.

---

### 2.8 File Storage & Range Requests
- **Storage Strategy:** Database-backed embedded binary storage (`storagePath: 'mongodb-embedded'`). File buffers are stored as Base64 strings in `Document.fileData`. (Firebase Storage and Cloudflare R2 services exist in `backend/src/services/storage/`, but production active default is MongoDB).
- **Preview Route:** `GET /api/documents/:id/preview` (`backend/src/modules/documents/document.routes.js` lines 578–660).
  - Authenticated via `requireAuth` (supports `Authorization: Bearer <token>` or `?token=<token>` query parameter).
  - Validates `DocumentAccessControlService.canViewDocument`.
  - Supports HTTP 206 Partial Content (HTTP `Range` header: `bytes=start-end`) for progressive PDF streaming.
  - Emits `Accept-Ranges: bytes`, `ETag`, and `Cache-Control: private, max-age=600`. Returns HTTP `304 Not Modified` when matching `If-None-Match`.
- **Download Route:** `GET /api/documents/:id/download`:
  - Sets `Content-Disposition: attachment; filename="..."` and logs `AuditLog` action `DOWNLOAD`.

---

### 2.9 Assets & Deadlines Modules
- **Asset Flashcards:**
  - Models: `Asset` (`asset.model.js`), `Expense` (`expense.model.js`), `TimelineEvent` (`timelineEvent.model.js`), `BankTransaction` (`bankTransaction.model.js`).
  - Routes: `asset.routes.js`, `expense.routes.js`, `timeline.routes.js`, `bankStatement.routes.js`.
  - Document linking: `Asset.linkedDocumentIds` contains array of `Document` ObjectIds. Linked via `POST /api/assets/:id/documents` (`{ documentId }`).
- **Deadlines & Expiries:**
  - Model: `Deadline` (`deadline.model.js`).
  - Generated automatically by `extractionPipeline.service.js` line 434 whenever a document produces a verified `expiry_date` with `verificationStatus === 'accepted'`. Idempotently replaces existing deadlines for the same `linkedDocId`.

---

### 2.10 Existing Code Inventory for Advanced Modules
1. **Sharing:** `backend/src/modules/sharing/` (`shares.routes.js`, `sharing.routes.js`, `accessControl.service.js`, `expiryWorker.service.js`).
2. **Connections (Family / Peers):** `backend/src/modules/sharing/connection.routes.js`, `backend/src/modules/sharing/models/userConnection.model.js`.
3. **Flashcards (Assets):** `backend/src/modules/assets/` (`asset.routes.js`, `asset.model.js`).
4. **Versioning:** `backend/src/modules/intelligence/models/documentVersion.model.js`, `backend/src/modules/intelligence/services/version.service.js`, routes in `intelligence.routes.js` (`/documents/:id/versions`).
5. **Notifications:** `backend/src/modules/deadlines/inAppNotification.model.js`, `backend/src/modules/deadlines/notification.routes.js`.
6. **Bank Statements:** `backend/src/modules/assets/bankStatement.routes.js`, `backend/src/modules/assets/bankTransaction.model.js`.
7. **Admin:** `backend/src/modules/vault/vault.routes.js` (`GET /api/vault/admin/stats`), frontend `frontend/src/features/admin/AdminDashboardPage.jsx`.

---

### 2.11 Audit Logging
- **Model:** `backend/src/modules/vault/auditLog.model.js` (`AuditLog`).
- **Logged Actions:** `UPLOAD`, `VIEW`, `DOWNLOAD`, `DELETE`, `LOGIN`, `EXPORT`.
- **Logged Details:** `userId`, `action`, `documentTitle`, `device` (User-Agent), `ipAddress`, `timestamp`.
- **Sharing Audit:** `ShareAccessLog` (`backend/src/modules/sharing/models/shareAccessLog.model.js`) records `VIEWED`, `DOWNLOADED`, `ACCESS_DENIED`, `EXPIRED`, `REVOKED`.

---

### 2.12 Configuration & Environment Variables (Names Only)
- **From `backend/src/config/index.js` & `backend/.env.example`:**
  - `PORT`, `NODE_ENV`, `MONGODB_URI`
  - `GROQ_API_KEY`, `GROQ_MODEL`
  - `GEMINI_API_KEY`, `GOOGLE_API_KEY`
  - `HUGGINGFACE_API_KEY`, `HF_EMBEDDING_MODEL`
  - `CLOUDFLARE_R2_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME`, `CLOUDFLARE_R2_PUBLIC_DOMAIN`
  - `FIREBASE_SERVICE_ACCOUNT_PATH`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_STORAGE_BUCKET`
  - `JWT_SECRET`
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - `VALIDATOR_SERVICE_URL`, `INTERNAL_VALIDATOR_TOKEN`, `QUARANTINE_DIR`, `VALIDATOR_TIMEOUT_MS`
  - `PIPELINE_VERSION`, `NOTICE_VERSION`, `AI_POLICY_DEFAULT`, `GEMINI_DAILY_CAP`, `GROQ_DAILY_TOKEN_CAP`, `USER_DAILY_TOKEN_CAP`, `JOB_LEASE_TIMEOUT_MS`, `JOB_MAX_CONCURRENCY`, `JOB_PAGE_CAP`, `PAGE_TIMEOUT_MS`, `JOB_MEMORY_GUARD_BYTES`
  - `EXTRACTION_SERVICE_URL`
  - `RESEND_API_KEY`, `RESEND_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

---

### 2.13 Automated Tests Verification
- **Framework:** Node.js Native Test Runner (`node --test`).
- **Test File Locations:** `backend/tests/` (17 test files, e.g. `guardrailSecurity.test.js`, `duplicateGuardrailAndAuthOptimization.test.js`, `askAiRigorousComprehensive.test.js`, `blurGuardrail.test.js`, `pipelineVerification.test.js`).
- **Execution & Status:** Executed unit suite: **42 tests passed, 0 failures, 0 skipped** (Execution time: 11.07s).

---

## SECTION 3: FRONTEND ARCHITECTURE

### 3.1 `package.json` Specification
- **File:** `frontend/package.json`
- **React Version:** `19.3.1`
- **Router Version:** `react-router-dom: ^7.18.4`
- **TypeScript:** **NOT USED** (Pure JSX / ECMAScript).
- **Dependencies:**
  - `@react-oauth/google`: `^0.13.5`
  - `@vitejs/plugin-react`: `^6.1.2`
  - `firebase`: `^13.1.0`
  - `lucide-react`: `^1.62.0`
  - `react`: `^19.3.1`
  - `react-dom`: `^19.3.1`
  - `react-markdown`: `^10.1.0`
  - `react-router-dom`: `^7.18.4`
  - `remark-gfm`: `^4.0.1`
  - `vite`: `^8.3.5`
- **Scripts:** `dev`, `build`, `preview`. (No lint or test script).

---

### 3.2 Entry & Routing (`frontend/src/app/routes.jsx`)
All routes are **eagerly loaded** (no `React.lazy` or `Suspense` chunks).

| Path | Component | Guards | Lazy-Loaded? |
| :--- | :--- | :--- | :--- |
| `/` | `LandingPage` | Public | No |
| `/login` | `LoginPage` | Public | No |
| `/register` | `RegisterPage` | Public | No |
| `/verify-otp` | `VerifyOtpPage` | Public | No |
| `/enter-pin` | `EnterPinPage` | Public | No |
| `/auth/verify` | `AuthVerifiedPage` | Public | No |
| `/shares/:id/view` | `SharedDocumentViewerPage` | Public (Token/Password) | No |
| `/shares/access/:token`| `SharedDocumentViewerPage` | Public (Token/Password) | No |
| `/shares/:id` | `SharedDocumentViewerPage` | Public (Token/Password) | No |
| `/dashboard` | `HomePage` | `ProtectedRoute` (Auth + PIN) | No |
| `/documents` | `DocumentsPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/documents/:id` | `DocumentDetailPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/connections` | `ConnectionsPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/shares` | `ShareCenterPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/ask-ai` | `AskAiPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/assets` | `AssetsPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/assets/:id` | `AssetDetailPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/banking` | `BankStatementsPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/deadlines` | `DeadlinesPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/upload` | `UploadPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/intelligence` | `IntelligenceDashboardPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/intelligence/entities` | `EntityExplorerPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/intelligence/entities/:id`| `EntityDetailPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/intelligence/alerts` | `AlertsCenterPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/intelligence/conflicts`| `ConflictsCenterPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/more` | `MorePage` | `ProtectedRoute` (Auth + PIN) | No |
| `/admin` | `AdminDashboardPage` | `ProtectedRoute` (Auth + PIN) | No |
| `/dashboard/admin` | `AdminDashboardPage` | `ProtectedRoute` (Auth + PIN) | No |

---

### 3.3 State Management & API Client Wrapper
- **Context Providers:** `GoogleOAuthProvider` -> `ThemeProvider` -> `AuthProvider`.
- **API Client:** `frontend/src/services/api/apiClient.js`
  - Base URL: Dynamic (`http://localhost:5001` in dev, `https://docvault-backend-tiyz.onrender.com` in production).
  - Attaches `Authorization: Bearer <token>` from `localStorage.getItem('token')`.
  - Intercepts HTTP 401 & `SESSION_TERMINATED`: clears tokens, displays alert, redirects to `/login`.
  - Excerpt (`frontend/src/services/api/apiClient.js` lines 25–54):
```javascript
export async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { ...options.headers };
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    if (data.code === 'SESSION_TERMINATED' || (response.status === 401 && data.error?.includes('terminated'))) {
      localStorage.clear();
      sessionStorage.clear();
      alert('Your DocVault session was terminated because another device signed into your vault.');
      window.location.href = '/login';
    }
    return { status: response.status, ok: response.ok, ...data };
  }
  return response;
}
```

---

### 3.4 App Shell & Scrolling Mechanics
- **Layout Files (`frontend/src/components/layout/`):**
  - `AppLayout.jsx`: Root application shell mounting `AppSidebar`, `<main className="dv-app-main">`, `<Outlet />`, and `BottomNav`.
  - `AppSidebar/`: Desktop navigation sidebar, vault switcher, quick lock button.
  - `AppHeader/`: Page header displaying breadcrumbs, search shortcut, theme toggle, and profile.
  - `BottomNav.jsx`: Mobile fixed navigation bar with 5 primary tabs and glassmorphism.
  - `PublicNavbar/`, `PublicFooter/`: Marketing landing page headers and footers.
- **Scrolling Behavior:**
  - The scrolling container is `.dv-app-main` (`overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch;`).
  - Mobile bottom padding: `padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px))` prevents bottom nav occlusion.
  - Desktop bottom padding: `padding-bottom: 48px` (`@media (min-width: 1025px)`) ensures clearance above macOS Dock.
- **CSS Occurrences Count:**
  - `100vh`: 13 occurrences (`AppLayout.css:5`, `AppSidebar.css:5`, `globals.css:37`, `AuthLayout.css:8,9,18,174`, `LandingPage.css:9`, etc.).
  - `position: fixed`: 9 occurrences (`BottomNav.css:8,232,248`, `Modal.css:2`, `AboutDocVaultModal.css:2`, `AskAiPage.css:407`, `ShareModal.css:2`, `LandingPage.css:1797`, `Auth.css:744`).
  - `overflow`: 176 occurrences.
  - `backdrop-filter`: 91 occurrences.
  - `linear-gradient`: 121 occurrences.

---

### 3.5 Styling & Design System
- **File Structure:** Plain CSS with BEM naming conventions (`.dv-*`). No CSS Modules.
- **Total CSS Files:** 35 files across components and features (largest: `LandingPage.css` 54 KB, `AskAiPage.css` 37 KB, `Auth.css` 24 KB, `HomePage.css` 22 KB).
- **Tokens Defined (`frontend/src/styles/tokens.css`):**
  - Accent colors: `--color-accent: #0070F2` (Light), `--color-accent: #79A2FF` (Dark).
  - Backgrounds: `--color-bg: #F8FAFC` (Light), `--color-bg: #101319` (Dark).
  - Surfaces: `--color-surface: #FFFFFF` (Light), `--color-surface: #171C24` (Dark).
  - Spacing: 4px grid (`--space-1: 4px`, `--space-2: 8px`, `--space-4: 16px`, `--space-6: 24px`, `--space-8: 32px`).
  - Radii: `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 14px`, `--radius-xl: 18px`, `--radius-full: 9999px`.
- **Theme Switching:** Dual attribute and class toggling on root: `<html data-theme="dark" class="theme-dark">`.

---

### 3.6 Common Components Inventory (`frontend/src/components/common/`)
1. `AboutModal`: Props `{ isOpen, onClose }`.
2. `Badge`: Props `{ children, variant, size, className }`.
3. `Button`: Props `{ children, variant, size, isLoading, disabled, leftIcon, rightIcon, className, onClick }`.
4. `Card`: Props `{ children, variant, padding, hoverable, className, onClick }`.
5. `DocVaultLogo`: Props `{ size, showText, className }`.
6. `DocumentCard`: Props `{ doc, onSelect, onDownload, onShare, onDelete, isSelected, className }`.
7. `DocumentTypeIcon`: Props `{ category, format, size, className }`.
8. `EmptyState`: Props `{ icon, title, description, action, className }`.
9. `ErrorBoundary`: Props `{ children }`.
10. `ExpiryBadge`: Props `{ expiryDate, isExpiringSoon, className }`.
11. `ExtractionConfidence`: Props `{ score, size, className }`.
12. `ExtractionInspector`: Props `{ extractedFields, isStorageOnly, onCorrectField, className }`.
13. `Input`: Props `{ label, error, helperText, leftIcon, rightIcon, className, id }`.
14. `Modal`: Props `{ isOpen, onClose, title, children, footer, maxWidth, className }`.
15. `Skeleton`: Props `{ width, height, variant, className }`.
16. `VerificationStatus`: Props `{ status, className }`.

---

### 3.7 Ask AI Chat Feature (`frontend/src/features/ai-assistant/`)
- **Primary Component:** `AskAiPage.jsx` (1,300 lines) + `AskAiPage.css` (37 KB).
- **JSX Tree Outline:**
  ```text
  AskAiPage
  ├── AppHeader
  └── dv-ai-shell
      ├── dv-ai-sidebar (Desktop conversation history)
      │   ├── Top: New Chat Button, Collapse Button
      │   ├── Search Input
      │   └── Grouped Conversation List (Today, Yesterday, Last 7 Days, Older)
      ├── dv-ai-main
      │   ├── Target Document Context Banner (when ?docId=... present)
      │   ├── dv-ai-messages-scroll-area
      │   │   ├── Empty State (Welcome hero, Suggested prompt chips, Form templates)
      │   │   └── Message List (.dv-ai-message-row)
      │   │       ├── Avatar (.dv-ai-avatar--user | .dv-ai-avatar--assistant)
      │   │       ├── Content (.dv-ai-message-bubble)
      │   │       │   ├── ReactMarkdown (ChatCodeBlock, ChatTable)
      │   │       │   ├── Action Bar (Copy button)
      │   │       │   └── Sources Grid (.dv-ai-sources-grid)
      │   │       │       └── Source Card (Click opens Quick Document / Asset Preview)
      │   └── dv-ai-input-area (Floating bottom dock)
      │       ├── Textarea (Auto-expanding, Enter-to-send)
      │       └── Send / Stop Button
      └── Modal (In-Chat Document & Asset Flashcard Quick Viewer)
          ├── Toolbar (Zoom In, Zoom Out, Reset, Rotate, Open in Tab, Download)
          └── Preview Frame (PDF iframe or Image renderer with error boundary)
  ```
- **Message State Shape:**
  ```javascript
  {
    role: "assistant", // "user" | "assistant"
    content: "Markdown string answer...",
    sources: [
      {
        type: "document",
        documentId: "6741b...",
        title: "Policy.pdf",
        category: "Insurance Policy",
        documentType: "pdf",
        pageNumber: 1,
        previewRoute: "/documents/6741b...",
        downloadUrl: "/api/documents/6741b.../download"
      }
    ],
    referencedDocIds: ["6741b..."],
    confidence: "high"
  }
  ```

---

### 3.8 Document Preview Component
- **Component:** Implemented within `frontend/src/features/documents/DocumentDetailPage.jsx` and `AskAiPage.jsx` using `Modal.jsx`.
- **Mechanism:** Displays PDF preview using `<iframe src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`} />`. Image preview renders `<img src={previewUrl} />`.
- **Stream URL:** `${API_BASE_URL}/api/documents/${docId}/preview?token=${token}`.

---

### 3.9 API Call Patterns Across Features
All features directly import `apiRequest` from `../../services/api`:
- `DocumentsPage.jsx`: `apiRequest('/api/documents')`
- `AssetsPage.jsx`: `apiRequest('/api/assets')`
- `DeadlinesPage.jsx`: `apiRequest('/api/deadlines')`
- `UploadPage.jsx`: `apiRequest('/api/documents/upload', { method: 'POST', body: formData })`
- `AskAiPage.jsx`: `apiRequest('/api/ai/query', { method: 'POST', body: JSON.stringify({ question, docId, conversationId }) })`

---

### 3.10 Frontend Production Bundle
- **Build Command:** `npm --prefix frontend run build` (Executed cleanly in 440ms with 0 errors).
- **Chunk Sizes Table:**
  - `dist/index.html`: `5.07 kB` (gzip: `1.58 kB`)
  - `dist/assets/index-BjKEHksY.css`: `327.55 kB` (gzip: `49.96 kB`)
  - `dist/assets/rolldown-runtime-XKyaHtl9.js`: `0.72 kB` (gzip: `0.42 kB`)
  - `dist/assets/vendor-react-DMDhsAVe.js`: `408.90 kB` (gzip: `128.29 kB`)
  - `dist/assets/index-BlxHPdlS.js`: `620.68 kB` (gzip: `150.96 kB`)
- **Lazy Loading Status:** Routes are **not** code-split; all pages are compiled into `index-BlxHPdlS.js`.

---

## SECTION 4: DATA FLOW DIAGRAMS (TEXT ONLY)

### 4.1 Login to Unlocked Vault Flow
1. User enters Email + Password on `LoginPage.jsx` -> sends `POST /api/auth/login`.
2. Backend verifies bcrypt `passwordHash`.
3. Backend generates Tier-1 JWT: `{ userId, email, sessionVersion, pinVerified: false }` with `requiresPin: true`.
4. Frontend saves `token` to `localStorage` and redirects user to `/enter-pin`.
5. User enters 4-to-6 digit PIN on `EnterPinPage.jsx` -> sends `POST /api/auth/verify-pin`.
6. Backend compares against `pinHash`.
7. Backend generates elevated Tier-2 JWT: `{ userId, email, pinVerified: true, sessionVersion }`.
8. Frontend stores elevated token, sets `sessionStorage.setItem('docvault_unlocked', 'true')`, and redirects to `/dashboard`.

### 4.2 Document Upload to Indexed Flow
1. User drops file on `UploadPage.jsx` -> sends `POST /api/documents/upload` (`multipart/form-data`).
2. Multer holds buffer in memory (25 MB cap).
3. Ingestion Guard verifies magic bytes (`%PDF-`, PNG, JPEG) and checks SHA-256 duplicate guardrail.
4. File is written to `uploads/quarantine/` and validated by Python validator service (`POST /validate`).
5. Sensitive document detector scans for Aadhaar/PAN/Passport patterns:
   - If sensitive -> sets `aiPolicy: 'storage_only'`, skips AI/OCR, saves to MongoDB, returns immediately.
   - If processable -> sets `aiPolicy: 'ai_enabled'`, enqueues background job in `Job` collection, returns HTTP 200 `{ status: 'queued' }`.
6. Background worker claims job via atomic lease (`claimNextJob`).
7. Worker calls `executeDocumentExtractionPipeline`:
   - Text extracted via `pdf-parse` or multi-page Tesseract OCR.
   - Tier 1 regex extracts dates, amounts, and policy numbers.
   - Tier 3 Groq Multimodal Vision invoked if text is sparse.
   - Verification gates score confidence (accepted vs. needs review).
   - Generates 384-dimensional dense embedding via Hugging Face API.
   - Schedules renewal `Deadline` automatically if valid `expiry_date` found.
8. Worker marks `Job` as `done` and updates `Document.processingStatus` to `completed` or `needs_review`.

### 4.3 Chat Question to Answer with Sources Flow
1. User inputs query on `AskAiPage.jsx` -> sends `POST /api/ai/query`.
2. Backend validates JWT via `requireAuth`.
3. Conversational intent classifier checks for greetings/pleasantries (<1ms fast-path).
4. Access Control Service queries accessible documents owned by user or shared via active grants.
5. Privacy gate excludes all `storage_only` documents and sensitive documents.
6. Lexical engine scores document tokens; Hugging Face API generates query embedding.
7. Reciprocal Rank Fusion ranks and selects top candidate documents and matching asset flashcards.
8. Hard assertion `assertAiAllowed` verifies no sensitive documents are passed to LLM context.
9. Prompt assembled with bounded context sections (up to 60,000 characters).
10. `executeGroqChatCompletion` calls Groq LLM (`openai/gpt-oss-120b` or `qwen/qwen3.8-27b`). If unavailable, offline deterministic engine answers.
11. `resolveQuerySourcesAndEntities` isolates sources (document vs. asset) and extracts page numbers.
12. Message saved to MongoDB `Message` collection and response returned to client.

---

## SECTION 5: RISKS AND FINDINGS

### 5.1 Security & Architecture Findings
1. **CORS Configuration Flaw (`backend/src/app.js` lines 40–49):**
   - In `backend/src/app.js`, the CORS origin callback returns `callback(null, true)` in both `if` and `else` branches:
     ```javascript
     origin: (origin, callback) => {
       if (!origin || allowedOrigins.includes(origin)) {
         callback(null, true);
       } else {
         callback(null, true); // Security risk: allows any external origin with credentials
       }
     }
     ```
   - *Risk:* With `credentials: true`, any unauthorized external origin can perform credentialed requests against the API if a user visits a malicious website.
2. **Missing Admin Authorization on Stats Route (`backend/src/modules/vault/vault.routes.js` line 61):**
   - The route `GET /api/vault/admin/stats` only applies `requireAuth`, but does not assert `req.user.role === 'admin'`. Any authenticated user can query system-wide metrics and user email lists.
3. **Missing Router Admin Guard on Frontend (`frontend/src/app/routes.jsx` lines 87–88):**
   - Routes `/admin` and `/dashboard/admin` are wrapped only in `ProtectedRoute`. Any logged-in user who enters `/admin` in the browser URL bar can view the admin interface.
4. **MongoDB 16 MB Document Size Limit for Embedded Files:**
   - Files are stored as Base64 strings in `Document.fileData`. While Multer allows up to 25 MB, Base64 encoding inflates file size by ~33%. Any file larger than ~12 MB raw will exceed MongoDB's strict 16 MB BSON document size limit and throw a database write error. Large files should be moved to GridFS or object storage.
5. **Embedding Drift on Metadata Edit:**
   - In `backend/src/modules/documents/document.routes.js` (`PATCH /:id`), users can update title and category, but `Document.embedding` is not updated, causing semantic search to drift.
6. **Chat Queries Unmetered in `TokenLedger`:**
   - `TokenLedger` records tokens for Tier 3 extraction fallback, but Ask AI chat queries (`/api/ai/query`) do not record or deduct from `TokenLedger`.

---

### 5.2 Direct Service Integration Points for an LLM Tool-Calling Orchestrator
When an engineer builds an AI function-calling / agentic tool orchestrator, they can invoke existing service functions directly:

1. **List / Search Documents:**
   - *File:* `backend/src/modules/sharing/accessControl.service.js`
   - *Function:* `DocumentAccessControlService.getAccessibleDocumentIds(userId, 'view')`
   - *Signature:* `async (userId: string, action: 'view'|'download'|'share') => Promise<string[]>`
2. **Retrieve Single Document with Access Verification:**
   - *File:* `backend/src/modules/sharing/accessControl.service.js`
   - *Function:* `DocumentAccessControlService.canViewDocument(userId, documentId)`
   - *Signature:* `async (userId: string, documentId: string) => Promise<{ allowed: boolean, reason?: string, doc?: Document }>`
3. **Verify AI Ingestion Eligibility:**
   - *File:* `backend/src/services/pipeline/privacyGate.js`
   - *Function:* `assertAiAllowed(doc, context)`
   - *Signature:* `(doc: object, context?: string) => void` (Throws `PrivacyPolicyViolationError` if `storage_only` or sensitive).
4. **Create / Upload Document:**
   - *File:* `backend/src/modules/extraction/extractionPipeline.service.js`
   - *Function:* `executeDocumentExtractionPipeline({ userId, buffer, mimetype, originalname, userConsent })`
   - *Signature:* `async (params: object) => Promise<{ document, processingStatus, extractedFields }>`
5. **Update Document Metadata:**
   - *File:* Direct Mongoose Model (`backend/src/modules/documents/document.model.js`)
   - *Call:* `Document.findOneAndUpdate({ _id: documentId, userId }, { $set: updates }, { returnDocument: 'after' })`
6. **Create Asset Flashcard:**
   - *File:* Direct Mongoose Model (`backend/src/modules/assets/asset.model.js`)
   - *Call:* `Asset.create({ userId, name, category, purchaseDate, warrantyExpiry, metadata, customFields })`
7. **Link Document to Asset:**
   - *File:* Direct Mongoose Model (`backend/src/modules/assets/asset.model.js`)
   - *Call:* `Asset.findOneAndUpdate({ _id: assetId, userId }, { $addToSet: { linkedDocumentIds: documentId } }, { returnDocument: 'after' })`
8. **Create Deadline Reminder:**
   - *File:* Direct Mongoose Model (`backend/src/modules/deadlines/deadline.model.js`)
   - *Call:* `Deadline.create({ userId, title, date, daysLeft, severity, linkedDocId, linkedAssetId, action })`

---

## SECTION 6: EXACT FILES TO READ (PRIORITY ORDER)

The following 15 files represent the core architectural blueprint of DocVault. They are listed in strict priority order with line counts:

| Rank | Priority | File Path | Line Count | Core Responsibility |
| :---: | :---: | :--- | :---: | :--- |
| **1** | P0 | `backend/src/modules/ai/ai.routes.js` | 771 | Ask AI query orchestration, RRF hybrid retrieval, sources resolution |
| **2** | P0 | `backend/src/services/ai/groqService.js` | 966 | Groq LLM client, multi-model fallback, system prompts, deterministic solver |
| **3** | P0 | `backend/src/services/pipeline/privacyGate.js` | 118 | Hard security gates preventing `storage_only` egress to AI models |
| **4** | P0 | `backend/src/modules/sharing/accessControl.service.js` | 424 | Centralized authorization engine for user ownership and sharing grants |
| **5** | P1 | `backend/src/modules/documents/document.model.js` | 199 | Mongoose schema for documents, extracted fields, embeddings, and policies |
| **6** | P1 | `backend/src/modules/documents/document.routes.js` | 790 | Document upload, validation pipeline, binary streaming, and CRUD |
| **7** | P1 | `backend/src/modules/extraction/extractionPipeline.service.js` | 469 | Ingestion pipeline, OCR cascade, rules engine, and verification gates |
| **8** | P1 | `backend/src/modules/ai/conversationalIntent.service.js` | 112 | Sub-millisecond intent classifier for greetings and pleasantries |
| **9** | P2 | `backend/src/modules/assets/asset.model.js` | 51 | Asset flashcard schema and document relationship fields |
| **10** | P2 | `backend/src/modules/deadlines/deadline.model.js` | 48 | Deadline and renewal reminder schema |
| **11** | P2 | `backend/src/middleware/auth.middleware.js` | 68 | JWT validation, PIN verification verification, and session termination |
| **12** | P2 | `backend/src/modules/auth/auth.service.js` | 1,532 | Two-tier authentication logic, PIN hashing, and session management |
| **13** | P3 | `frontend/src/features/ai-assistant/AskAiPage.jsx` | 1,300 | Frontend chat interface, conversation history, and in-chat document viewer |
| **14** | P3 | `frontend/src/services/api/apiClient.js` | 87 | Standard frontend fetch client, token management, and 401 interceptor |
| **15** | P3 | `frontend/src/app/routes.jsx` | 95 | Frontend route registry, protected route wrappers, and navigation tree |
