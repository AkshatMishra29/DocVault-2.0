# DocVault 2.0 — Complete Page-by-Page Frontend Content Inventory

> Auto-extracted from all **26 `*Page.jsx` files** in `frontend/src/features/` and `frontend/src/app/routes.jsx`.  
> Use this document to audit, standardize, and fix frontend copy, headings, placeholders, CTAs, and empty states.

---

## ⚠️ Flagged Copy / Script Issues Found
1. **[LandingPage.jsx](frontend/src/features/landing/LandingPage.jsx)**:
   - Hardcoded `"Welcome back, Akshat"` in the interactive preview mockup instead of a generic name or dynamic user name.
   - Missing space after comma in `"Everything important,instantly accessible."` → should be `"Everything important, instantly accessible."`.
   - Placeholder brand claim `"Sovereign custody in four simple steps"` vs. simpler customer-friendly tone.
2. **[CopilotBetaPage.jsx](frontend/src/features/copilot-beta/CopilotBetaPage.jsx)**:
   - Error boundary heading says `"Beta had a problem"` — could be clearer for end users (e.g., `"Something went wrong in DocVault Copilot"`).
3. **[AdminDashboardPage.jsx](frontend/src/features/admin/AdminDashboardPage.jsx)** & **[MorePage.jsx](frontend/src/features/dashboard/MorePage.jsx)**:
   - Mix of technical terms (`"Enclave Administration Console"`, `"Custodian Identity"`) vs. consumer-friendly terms used on `HomePage.jsx` and `UploadPage.jsx`.

---

## 1. Public & Landing

### 1.1 Landing Page (`/`)
- **File:** `frontend/src/features/landing/LandingPage.jsx`
- **Main Headings:**
  - `"Your critical documents. Protected with absolute custody."`
  - `"Engineered for clarity, built for life's milestones."`
  - `"Everything important,instantly accessible."` *(typo: missing space)*
  - `"Sovereign custody in four simple steps"`
  - `"Security and privacy engineered at every layer."`
  - `"Everything you need to know about DocVault"`
  - `"Take sovereign control of your documents today."`
- **Mockup Card Text:** `"Welcome back, Akshat"` *(hardcoded name)*

---

## 2. Authentication & Security Flow

### 2.1 Login (`/login`)
- **File:** `frontend/src/features/auth/pages/LoginPage.jsx`
- **Headings / Subtitle:** `"Welcome back."` · `"Sign in to access your personal document vault."`
- **Inputs / Placeholders:**
  - `"name@example.com, username, or DocVault ID"`
  - `"Enter your password or 4-digit PIN"`
- **Reset / OTP Flow:**
  - `"Set or Reset Manual Password"` · `"name@example.com or username"` · `"Enter 6-digit OTP"` · `"At least 6 characters"` · `"4 or 6 digits (e.g. 1234)"`

### 2.2 Register (`/register`)
- **File:** `frontend/src/features/auth/pages/RegisterPage.jsx`
- **Headings / Subtitle:** `"Create your account"` · `"Create an account to access your secure document vault."`
- **Inputs / Placeholders:** `"Enter your full name"`, `"name@example.com"`, `"Create master password"`, `"Confirm master password"`, `"Enter contact phone number"`

### 2.3 Verify OTP (`/verify-otp`)
- **File:** `frontend/src/features/auth/pages/VerifyOtpPage.jsx`
- **Headings / Subtitle:** `"Verify your email."` · `"We've sent a 6-digit verification code to your email address."`
- **Actions:** `"Edit registration details"`

### 2.4 Auth Verified (`/auth/verify`)
- **File:** `frontend/src/features/auth/pages/AuthVerifiedPage.jsx`
- **States:** `"Verifying link..."` · `"Cryptographically validating your authentication session."` · `"Account verified!"` · `"Link verification failed"`

### 2.5 Vault PIN / Biometrics (`/enter-pin`)
- **File:** `frontend/src/features/auth/pages/EnterPinPage.jsx`
- **Headings / Subtitle:** `"Unlock your vault."` · `"Enter your personal security PIN to decrypt your documents."`
- **Setup / Lock States:** `"Set Up Your Vault Security"` · `"Vault Temporarily Locked"`
- **Actions / Placeholders:** `"Sign in with another account"`, `"Switch to another remembered session"`, `"Forget this session"`, `"Scan Fingerprint"`, `"Reset Vault PIN"`, `"At least 8 characters (for emergency sign in)"`, `"123456"`

---

## 3. Core Vault & Dashboard

### 3.1 Dashboard (`/dashboard`)
- **File:** `frontend/src/features/dashboard/HomePage.jsx`
- **Banner / Subtitle:** `"Manage your personal & family vault"` · `"Privacy-First Document Manager • Secure by design"`
- **Search / Prompt Bar:** `"Ask anything about your documents, e.g. What is my passport expiry date?"`
- **Stat Card Tooltips:** `"Click to view all documents"`, `"Click to view private documents"`, `"Click to view shared documents"`, `"Click to view upcoming deadlines"`
- **Sections:** `"Fields Requiring Confirmation"`, `"Recent Documents"`, `"Upcoming Expirations"`
- **Empty State:** `"Your vault is empty"` · Action: `"Upload First Document"`

### 3.2 Documents (`/documents`)
- **File:** `frontend/src/features/documents/DocumentsPage.jsx`
- **Header:** `"My Documents"` · `"Manage, search, and inspect your structured personal policies, certificates, and proofs."`
- **Search / Filters:** `"Search by title, policy number, or tag..."`, `"Clear search"`, `"Grid View"`, `"Table View"`
- **Category Pills:** `All`, `Tax Invoice`, `Purchase Receipt`, `Insurance`, `Identity`, `Appliances`, `Medical`, `Other`
- **Privacy Filter Pills:** `All Access`, `Private`, `Shared`, `Storage Only`
- **Checklists / Shared Empty State:** `"Verify required documents for major life events"`, `"No shared documents yet"` · `"View Connections"` · `"Preview original document"`

### 3.3 Document Detail (`/documents/:id`)
- **File:** `frontend/src/features/documents/DocumentDetailPage.jsx`
- **Header:** `"Document details, extracted information, and actions."`
- **Sections:** `"Document Information"`, `"Tracked Asset Association"`, `"Authenticity Audit"`, `"Renewal Lifecycle"`, `"Vault Tools"`, `"Version History"`
- **Zero-Knowledge E2EE Card:** `"Zero-Knowledge Encrypted Document (AES-GCM-256)"` · `"Enter Vault PIN / Passphrase to decrypt locally"` · `"Decrypt in Browser"` · `"Lock & Wipe Key"` · `"Download Decrypted File"`
- **Actions:** `"Copy file name"`, `"Edit this value"`, `"Copy value"`, `"Open in new browser tab"`, `"Download file"`, `"Owner has granted View-Only access without download"`, `"Delete Document"`

### 3.4 Upload Document (`/upload`)
- **File:** `frontend/src/features/upload/UploadPage.jsx`
- **Header:** `"Add a Document"` · `"Upload any PDF or image — we'll read and organize it automatically."`
- **Upload Card:** `"Upload a New Document"` · `"Click to browse or drag and drop files"` · `"Enter a readable title for this document…"` · `"What happens after you upload?"`
- **Privacy Modes:**
  - `PROCESSABLE` (AI-Enabled)
  - `STORAGE_ONLY` (`"Private Storage Only"` + optional `"Zero-Knowledge Client Encryption (AES-GCM-256 in browser)"` + `"Enter Vault PIN / Passphrase (never sent to server)"`)
- **Duplicate Guardrail:** `"Keep two identical copies in your vault"`

### 3.5 Settings (`/more`)
- **File:** `frontend/src/features/dashboard/MorePage.jsx`
- **Header:** `"Settings"` · `"Manage account credentials, two-tier isolation settings, and review immutable access logs."`
- **Sections:** `"Vault Account & Custodian Identity"`, `"Security Credentials"`, `"Remembered Sessions"`, `"Portable Vault Backup (JSON)"`, `"Tamper-Proof Vault Access Log"`
- **Actions / Inputs:** `"Lock session (⌘L)"`, `"Enter current PIN"`, `"Repeat new PIN"`, `"Enter current password"`, `"Enter new password"`, `"Repeat new password"`, `"Clear saved sessions from device"`, `"Forget session from device"`

---

## 4. AI Assistants

### 4.1 DocVault Copilot Beta (`/copilot-beta`)
- **File:** `frontend/src/features/copilot-beta/CopilotBetaPage.jsx`
- **Header:** `"DocVault Copilot"` · Badge: `"Beta"` · `"New Chat"` / `"Start New Chat"` · `"Standard Ask AI →"`
- **Sidebar:** `"History"` · `"Search conversations..."` · `"Collapse History Panel"` · `"Delete chat"` · `"Clear Current Chat"` · `"Drag to resize • Double-click to reset"`
- **Drag-Drop Overlay:** `"Drop Document Here"` · `"Release to upload & configure storage/AI options right inside Copilot"`
- **Error Boundary:** `"Beta had a problem"`

### 4.2 Standard Ask AI (`/ask-ai`)
- **File:** `frontend/src/features/ai-assistant/AskAiPage.jsx`
- **Header:** `"Ask AI Copilot"` · `"Conversational answers grounded in your encrypted DocVault documents."`
- **Composer Placeholder:** `"Ask anything about your policies, warranties, or certificates..."`
- **Actions:** `"Start a new conversation"`, `"Search chats..."`, `"Expand chat history"`, `"Open Chat History"`, `"Start a fresh conversation"`, `"Copy snippet"`, `"Copy answer details"`

---

## 5. Assets, Flashcards & Banking

### 5.1 Assets / Flashcards (`/assets`)
- **File:** `frontend/src/features/assets/AssetsPage.jsx`
- **Header:** `"My Assets"` · `"Track your vehicles, appliances, and properties."`
- **Search / Actions:** `"Search flashcards by name, category, or field..."`, `"Clear search"`, `"Create Flashcard"`, `"Customize / Edit Card"`, `"Delete Card"`
- **Form Placeholders:** `"e.g. MacBook Pro M3, Family Car, Apartment 4B, Canon EOS"`, `"e.g. Work, Vehicle, Camera, Home"`, `"Add any context, location, or private reminders..."`

### 5.2 Asset Detail (`/assets/:id`)
- **File:** `frontend/src/features/assets/AssetDetailPage.jsx`
- **Sections:** `"Connected Vault Documents"`, `"Vehicle Digital Compliance Wallet"`, `"Asset Maintenance & Expense Log"`, `"Rule-Based Insurance Policy Audit"`, `"Chronological Asset Lifecycle Events"`
- **Actions / Placeholders:** `"Unlink Document"`, `"Link Document to Asset"`, `"e.g. Authorized Service Center, Fuel Station"`, `"Amount in INR"`, `"e.g. 20,000 km general service, engine oil change"`

### 5.3 Bank Statements (`/banking`)
- **File:** `frontend/src/features/assets/BankStatementsPage.jsx`
- **Header:** `"Privacy-First Bank Statement Parser"` · `"Extract, preview, and review bank debits and credits locally. Never sent to external AI."`
- **Sections / Inputs:** `"Preview Extracted Transactions"` · `"Search transactions..."`

---

## 6. Deadlines & Reminders

### 6.1 Deadlines (`/deadlines`)
- **File:** `frontend/src/features/deadlines/DeadlinesPage.jsx`
- **Header:** `"Renewals & Reminders"` · `"Automated countdown schedules derived from policy and warranty expiration dates."`
- **Sections:** `"Expiring Within 15 Days or Overdue"`, `"Upcoming Schedules"`
- **Empty State:** `"No upcoming policy deadlines"` · `"Upload Document to Schedule"`
- **Actions / Placeholders:** `"Add New Reminder"`, `"Link a document to this renewal"`, `"Delete Reminder"`, `"e.g. Car Insurance Renewal, Electricity Bill, Society Maintenance"`

---

## 7. Intelligence & Knowledge Graph

### 7.1 Intelligence Dashboard (`/intelligence`)
- **File:** `frontend/src/features/intelligence/IntelligenceDashboardPage.jsx`
- **Header:** `"Policy Health"` · `"Track document expiry, conflicts, and health in one place."`
- **Sections:** `"Document Health Overview"`, `"Intelligence Engine Offline"`, `"Knowledge Graph"`, `"Alerts Centre"`, `"Conflict Resolver"`, `"Expiring Soon (Action Required)"`, `"Expired Paperwork"`, `"What We Found in Your Documents"`

### 7.2 Entity Explorer (`/intelligence/entities`)
- **File:** `frontend/src/features/intelligence/EntityExplorerPage.jsx`
- **Header:** `"Knowledge Graph & Entities"` · `"Connected relationships across your family, assets, documents, and policies"`
- **Search / Empty / Create:** `"Search entities or aliases..."`, `"No entities found"`, `"Add New Entity to Graph"`, `"e.g. Honda City ZX, Dad, Pune Flat, Daikin Split AC"`, `"e.g. DL01AB1234"`, `"e.g. Father, Mother, Spouse, Self"`

### 7.3 Entity Detail (`/intelligence/entities/:id`)
- **File:** `frontend/src/features/intelligence/EntityDetailPage.jsx`
- **Sections:** `"Entity Not Available"`, `"Document Completeness Checklist"`, `"Knowledge Graph Relationships"`, `"Linked Documents"`, `"Information Discrepancies"`

### 7.4 Alerts Center (`/intelligence/alerts`)
- **File:** `frontend/src/features/intelligence/AlertsCenterPage.jsx`
- **Header:** `"Proactive Alerts Centre"` · `"Automated alerts for expirations, missing paperwork, and conflicting information"`

### 7.5 Conflicts Center (`/intelligence/conflicts`)
- **File:** `frontend/src/features/intelligence/ConflictsCenterPage.jsx`
- **Header:** `"Conflict Detection & Resolver"` · `"Cross-document fact comparison with non-destructive audit resolution"`
- **Empty / Inputs:** `"Zero Conflicts Detected"`, `"Enter the verified value..."`, `"e.g. Verified physically against smart card chip"`

---

## 8. Sharing & Family Connections

### 8.1 Connections (`/connections`)
- **File:** `frontend/src/features/sharing/ConnectionsPage.jsx`
- **Headings:** `"Mutual Connections"`, `"No connections yet"`
- **Actions / Placeholders:** `"Copy ID"`, `"Refresh connections"`, `"Send request to make connection mutual"`, `"Enter DocVault ID (e.g. DV-XXXX-XXXX)..."`

### 8.2 Share Center (`/shares`)
- **File:** `frontend/src/features/sharing/ShareCenterPage.jsx`
- **Header:** `"Document Access Management"` · `"Manage secure direct shares, incoming access, private vault files, and audit history."`
- **Headings:** `"Access & Security Timeline"`, `"Share Authorized & Live!"`
- **Empty States / Actions:** `"No document shares created yet"`, `"Create First Share"`, `"No documents shared with you"`, `"Copy DocVault ID to clipboard"`, `"Modify permissions or extend expiry"`, `"View access history"`, `"Revoke access immediately"`, `"Instant preview without leaving this page"`

### 8.3 Shared Document Viewer (`/shares/:id/view`, `/shares/access/:token`, `/shares/:id`)
- **File:** `frontend/src/features/sharing/SharedDocumentViewerPage.jsx`
- **Headings:** `"Access Unavailable"`, `"Password Protected Share"`
- **Controls / Placeholders:** `"Enter share password"`, `"Back to Shares"`, `"Copy share link"`, `"Open original in new browser tab"`, `"Zoom Out"`, `"Reset Zoom & Rotation"`, `"Zoom In"`, `"Rotate 90 degrees"`, `"e.g. List certificates, policy end dates, or totals"`

---

## 9. Administration

### 9.1 Admin Dashboard (`/admin`, `/dashboard/admin`)
- **File:** `frontend/src/features/admin/AdminDashboardPage.jsx`
- **Header:** `"Enclave Administration Console"` · `"Platform telemetry, infrastructure health monitoring, and custodian directories."`
- **Sections / Search:** `"System Administration & Telemetry"`, `"Registered Custodians"`, `"Cryptographic Audit Stream"`, `"Vault Document Categories"`, `"Search by name or email..."`
