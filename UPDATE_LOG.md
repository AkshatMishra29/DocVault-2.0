# DocVault Engineering Update Log & Changelog

All notable changes, security updates, and new feature implementations for the **DocVault** platform are documented in this log file chronologically.

---

## [2026-11-01] – Version 2.5.0: Native MongoDB OTP Verification, White Screen Fix & Auth Simplification

### 1. Native MongoDB 6-Digit OTP Email Verification (Replacing Quota-Limited Links)
* **Live Gmail SMTP Dispatcher (`backend/src/services/emailService.js`):**
  - Integrated `nodemailer` configured with secure Gmail SMTP transport for immediate delivery of verification codes.
  - Generates HTML branded transactional emails with 6-digit verification code badges and 10-minute expiry notifications.
* **MongoDB OtpVerification Schema & Lifecycle (`otp.model.js` & `auth.service.js`):**
  - Stored OTP codes with bcrypt hashing to prevent plain-text exposure in database collections.
  - Implemented 10-minute automatic document cleanup using MongoDB native TTL indexes (`expiresAfterSeconds: 0`).
  - Enforced brute-force rate limiting: maximum 5 attempts per OTP code before auto-invalidation (`HTTP 429`).
  - Added backend endpoints `POST /api/auth/send-otp` and `POST /api/auth/verify-otp`.
* **Two-Step Registration UI Flow (`RegisterPage.jsx`):**
  - Step 1: Collects user name, email, master password, phone number, and customizable 4/6-digit Vault Security PIN.
  - Step 2: Dispatches verification OTP and transitions to a focused 6-digit numeric input screen with resend timer and instant unlock.

### 2. Streamlined Minimalist Authentication UI
* **Removed Third-Party Social Login Buttons:**
  - Removed Google, GitHub, and Facebook buttons from the Login and Register screens to enforce pure zero-knowledge master credentials.
* **Fixed Post-Logout Guest Experience:**
  - Resolved issue where logged-out users saw "Unlock My Vault" on the landing page and navbar.
  - Landing page hero and Public Navbar dynamically display "Get Started Free" and "Sign In" for guest users, and "Go to Vault Overview" / "Lock Vault" only for verified active sessions.
  - Bottom navigation `/` link corrected to `/dashboard` when authenticated.

### 3. White Screen Diagnostic & Comprehensive Application Recovery
* **Eliminated Undefined Reference Errors in `LoginPage.jsx`:**
  - Fixed `ReferenceError: infoMessage is not defined` and missing `Sparkles` icon import that previously caused React to unmount on `/login`.
  - Added safe `useLocation` state initialization for redirect notification banners.
* **Hardened LocalStorage & SessionStorage Initializers (`AuthContext.jsx`):**
  - Wrapped `localStorage.getItem('docvault_user')` and `sessionStorage.getItem('docvault_pin_length')` in defensive `try/catch` guards to prevent app-wide crashes caused by malformed or corrupted browser storage strings.
* **Root-Level React Error Boundary (`ErrorBoundary.jsx`):**
  - Created a production-grade class-based `ErrorBoundary` wrapping the entire application tree in `App.jsx`.
  - Renders a clean recovery interface with **Reload Application** and **Reset Session & Go to Home** options if any child component throws an unexpected runtime error.

---

## [2026-10-31] – Version 2.4.0: Firebase Auth, DocVault Shield & Advanced Vault Security Suite

### 1. Firebase Authentication & Passwordless Sign-In
* **Google OAuth Integration:**
  - Added "Continue with Google" popup authentication using Firebase Client SDK (`frontend/src/services/firebase.js`).
  - Added backend route `POST /api/auth/firebase` validating Firebase ID tokens using Firebase Admin SDK and automatically provisioning tenant accounts in MongoDB.
* **Passwordless Email Magic Links:**
  - Added passwordless email link request option on the login screen.
  - Implemented listener to catch `?emailLink=true` on callback and seamlessly complete user authentication into Step 2 (PIN unlock).

### 2. DocVault Shield: Privacy-First Security Center
* **Client-Side Shannon Entropy & Strength Analyzer (`passwordStrengthService.js`):**
  - Evaluates password entropy dynamically in local device memory without server transmissions.
  - Detects dictionary passwords, sequential ladders (`123`, `abc`), and character repetitions (`aaa`, `111`).
  - Provides four classification levels: *Very Weak*, *Weak*, *Good*, and *Strong*.
* **Have I Been Pwned (HIBP) k-Anonymity Integration (`hibpService.js`):**
  - Generates full 40-character SHA-1 hash locally in browser memory.
  - Transmits strictly the first 5 characters (prefix) to `https://api.pwnedpasswords.com/range/{prefix}` with `Add-Padding: true`.
  - Matches the 35-character suffix locally in device memory; reports exact breach counts with zero leaks.
* **CSPRNG Password & Memorable Passphrase Generator (`passwordGeneratorService.js`):**
  - Uses `window.crypto.getRandomValues()` with Fisher-Yates unbiased shuffling.
  - Configurable length ($\ge 16$ chars), character variety toggles, and ambiguous character exclusions.
  - Diceware-inspired 4-word natural passphrase generator with random numeric salt.
* **4-Digit & 6-Digit PIN Security Evaluator (`pinSecurityService.js`):**
  - Flags empirical DataGenetics attacker dictionaries, common PINs (`1234`, `0000`, `2580`, `123456`, `121212`), calendar years (`1940-2030`), and birthdates.
* **Dedicated Shield UI:**
  - Added route `/shield` and sidebar navigation with a `Zero-K` (Zero-Knowledge) badge.

### 3. Account Hardening & Inactivity Defenses
* **5-Minute Brute-Force Lockout:**
  - Tracks consecutive invalid PIN attempts in MongoDB (`failedAttempts`, `lockUntil`).
  - On the 5th failed guess, returns `HTTP 423 Locked` for 300 seconds.
  - `EnterPinPage.jsx` shows a live countdown timer (`4:59`...`0:00`) and locks all keypad buttons and input fields.
* **Single Active Session Enforcement (GeeksforGeeks Style):**
  - Tracks `sessionVersion` and user-controlled `singleSessionOnly` boolean flag.
  - When enabled, logging in from a second device increments `sessionVersion` and immediately invalidates prior active sessions with `401 SESSION_TERMINATED`.
* **10-Minute Resting Inactivity & Device Sleep Auto-Lock:**
  - Tracks user gestures (`touchstart`, `mousedown`, `scroll`, `keydown`) in `localStorage`.
  - Listens to browser `visibilitychange` and window `focus` events so phone sleep and closed laptop states count towards the 10-minute inactivity window.
  - Automatically locks vault and jumps to `/enter-pin`.
* **WebAuthn Biometric Unlock (Touch ID / Fingerprint):**
  - Uses W3C `navigator.credentials` to bind hardware secure enclave keys without saving raw biometric data.
  - Added user enrollment button ("Add Fingerprint") and toggle under *Settings & Audit* (`MorePage.jsx`).
  - Added Touch ID / Fingerprint instant unlock button on `/enter-pin`.

---

## [2026-10-30] – Version 2.2.0: Multi-Format OCR Pipeline & Groq Context-Grounded AI Copilot

### 1. Document Extraction & OCR Pipeline
* Fixed `pdf-parse` v2 stream buffer extraction using `new PDFParse({ data: buffer }).getText()`.
* Added image preprocessing pipeline with Sharp (`sharp(buffer).grayscale().normalize().toBuffer()`) and Tesseract.js fallback for scanned receipts and camera uploads.
* Stored cleaned `extractedText` directly in MongoDB `DocumentSchema` for sub-second retrieval.

### 2. Context-Grounded Vault Copilot
* Integrated Groq Cloud SDK powered by `openai/gpt-oss-120b` and `qwen/qwen3.8-27b`.
* Applied bounded `max_tokens: 1000` to prevent token spikes and eliminate OTPM 429 rate limit exceptions.
* Injected user document context dynamically for instant answering of renewal dates, policy numbers, and warranty terms.

---

## [2026-10-28] – Version 2.0.0: Initial Dual-Tier Zero-Knowledge Architecture

* **Dual-Tier Isolation Shell:**
  - Step 1: User account login with email and bcrypt password.
  - Step 2: Separate personal vault security PIN with dedicated session tokens.
* **Core Application Layouts & Modules:**
  - Implemented Vault Overview, Documents Registry, Upload & OCR, Asset Tracking, and Calendar Deadlines.
  - Integrated JSON Vault Export for offline encrypted backup portability.

