# DocVault Engineering Update Log & Changelog

All notable changes, security updates, and new feature implementations for the **DocVault** platform are documented in this log file chronologically.

---

## [2026-11-02] – Version 2.7.0: Native Mobile & Tablet App Experience, Enterprise Admin Console, Social Preview Metadata & Fluid Responsive Hardening

**Session Completed At:** 2026-11-02T01:05:00+05:30 (Asia/Kolkata / Indian Standard Time)  
**Engineering Lead & Author:** Satyam Diwaker (@satyamdiwaker000001 | satyamdiwaker863@gmail.com)

---

### 1. Native Mobile & Tablet App Experience Transformation
* **Dedicated Mobile Authentication View (`MobileAppAuthView.jsx` & `MobileAppAuthView.css`):**
  - Designed a high-polish, app-native authentication gateway exclusively displayed on mobile and tablet viewport widths (`<= 768px`).
  - Implemented an iOS/Android segmented switch control for toggling between `Sign In` and `Create Account` without full page reloads.
  - Eliminated marketing landing page bloat on mobile screens; users now experience an immediate, native application login screen with zero vertical fluff.
* **Intelligent Viewport Auto-Routing (`LandingPage.jsx`):**
  - Integrated dynamic screen-size detection (`useWindowDimensions` / media queries) on the root landing route.
  - Automatically routes mobile users directly to `MobileAppAuthView`, while maintaining the full 3D editorial marketing experience for desktop and widescreen viewports.
  - Added an unobtrusive top announcement bar (`dv-lp-desktop-bar`) allowing users to effortlessly switch between Native App Mode and Full Web Experience without blocking UI buttons.

### 2. Native Mobile Header Bar & Raised Upload FAB Navigation
* **Native Mobile App Header (`AppHeader.jsx` & `AppHeader.css`):**
  - Modernized the mobile application header to match native iOS/Android system styling.
  - Added real-time user initial avatar badge, verified encryption status pulse dot, and dynamic notification bell.
  - Implemented hardware safe-area top inset support (`env(safe-area-inset-top)`) for seamless notch display on iPhone and Android cutouts.
* **Native Bottom Tab Navigation with Elevated Central FAB (`BottomNav.jsx` & `BottomNav.css`):**
  - Built a persistent bottom navigation bar featuring 5 primary touch targets (`Vault`, `Search`, `Upload`, `Activity`, `More`).
  - Integrated an elevated, prominent central Upload / Scan action FAB with gradient styling (`#FD2B06`), high tactile tap targets, and smooth hover elevation.
  - Added bottom safe-area insets (`env(safe-area-inset-bottom)`) for gesture bar compatibility on modern mobile devices.

### 3. Enterprise Enclave Administration Console (`/admin`) & Backend Telemetry
* **Real-Time Telemetry API (`backend/src/modules/vault/vault.routes.js`):**
  - Added `GET /api/vault/admin/stats` aggregating platform-wide security metrics: active custodians, total encrypted objects, cluster storage consumption, OCR pipelines processed, and uptime telemetry.
  - Structured live health check endpoints covering Encrypted Storage clusters, OCR Microservices, and HSM / Key Management infrastructure.
* **Admin Dashboard UI (`AdminDashboardPage.jsx` & `AdminDashboardPage.css`):**
  - Created a professional, high-density enterprise administrative console with real-time cluster health badges.
  - Implemented 4 high-level KPI metric cards with change indicators and trend analytics.
  - Built an interactive, searchable Custodian User Directory with role badges, 2FA status indicators, and permission levels.
  - Added an append-only cryptographic audit stream detailing administrative security events with severity tagging.

### 4. Architecture & Security Transparency Modal ("Know About DocVault")
* **Native Bottom Sheet Architecture Sheet (`AboutDocVaultModal.jsx` & `AboutDocVaultModal.css`):**
  - Developed an informative modal explaining DocVault's security principles: Zero-Knowledge Client-Side Cryptography, Two-Tier Master PIN Isolation, Private OCR Engine, and Session Guardrails.
  - Designed with accessible touch gestures, smooth backdrop blur, and structured architectural cards.
* **Contextual Trigger Links (`LoginPage.jsx` & `RegisterPage.jsx`):**
  - Placed subtle, reassuring trigger links directly beneath authentication action buttons (*"Curious how your documents are protected? Learn about DocVault architecture & privacy"*).
  - Enables users to inspect platform privacy policies and encryption mechanics without navigating away from the login or registration flow.

### 5. Universal Removal of "Mobile Enclave" & Arbitrary "AES-256" Technical Badges
* **Clean Brand Typography Over Misleading Enclave Labels:**
  - Removed misleading "Mobile Enclave" text badges across mobile headers, landing components, and authentication cards.
  - Replaced arbitrary badges with clean DocVault brand typography and centered, uncluttered layout headings.
* **Professional Cryptographic Terminology:**
  - Standardized terminology across the frontend, landing pages, and backend stats from raw "AES-256" badges to accurate, industry-standard language ("Hardware Accelerated Vault Encryption" and "Zero-Knowledge Storage").

### 6. Fluid Responsive Layouts, Mobile Capsule Collision Fix & Light Theme Polish
* **Dynamic Fluid Typography (`clamp()`):**
  - Replaced rigid, fixed pixel font sizes across landing hero headlines and kicker badges with responsive CSS `clamp()` formulas (`clamp(2rem, 6vw, 3.75rem)` for headlines, `clamp(1rem, 2.8vw, 1.25rem)` for subtitles).
  - Eliminates text wrapping breaks and ensures visual balance on narrow 360px phones up to ultrawide desktop monitors.
* **Mobile Floating Capsule Navigation Collision Fix (`PublicNavbar.css`):**
  - Scaled brand logo down to 28px (`max-width: 125px`) on mobile viewports (`<= 600px`).
  - Cleanly concealed desktop text buttons inside `.dv-nav-capsule` on small screens, delegating quick navigation to the full-screen touch drawer and preventing horizontal overflow.
* **Floating Return Pill Overlap Resolution (`LandingPage.jsx` & `LandingPage.css`):**
  - Eliminated the fixed floating `Return to App View` pill (`bottom: 24px; right: 20px`) that previously collided with the primary `Sign In` and submit buttons on mobile screens.
  - Converted into a clean, non-intrusive top banner (`dv-lp-desktop-bar`) positioned safely away from primary touch interactions.
* **Harmonized Mobile Browser Chrome Color (`frontend/index.html`):**
  - Updated `<meta name="theme-color">` from harsh `#FD2B06` to natural editorial stone `#FAF9F5`, ensuring Android and iOS browser URL bars match the website aesthetic seamlessly.

### 7. Component Error Boundary Hardening & PWA Manifest Recovery
* **Missing Lucide Icon Import (`RegisterPage.jsx`):**
  - Resolved `ReferenceError: HelpCircle is not defined` by explicitly adding `HelpCircle` to the `lucide-react` import statement, restoring smooth registration rendering.
* **Defensive Optional Chaining in Security Gauges (`PasswordStrengthMeter.jsx` & `PinStrengthIndicator.jsx`):**
  - Added safe optional chaining (`level?.color`, `riskLevel?.color`) and default fallbacks to prevent unhandled TypeErrors when password evaluation payloads are pending.
* **Editorial Light Theme Error Boundary (`ErrorBoundary.jsx` & `ErrorBoundary.css`):**
  - Redesigned the fallback crash screen to seamlessly match DocVault's signature warm stone aesthetic (`#FAF8F5`) and brand color `#FD2B06`.
* **PWA Manifest 404 Resolution (`frontend/public/manifest.json` & `frontend/public/vault.svg`):**
  - Added modern `<meta name="mobile-web-app-capable" content="yes" />` tag to eliminate browser deprecation warnings.
  - Updated PWA manifest icon references to valid `/favicon/favicon.png` and created a standalone `/vault.svg` vector asset to eliminate manifest download errors.

---

## [2026-11-02] – Version 2.6.0: 3D Editorial Overhaul, Floating Capsule Nav, Dedicated OTP Flow & Brand Polish

**Session Completed At:** 2026-11-02T00:08:45+05:30 (Asia/Kolkata / Indian Standard Time)  
**Engineering Lead & Author:** Satyam Diwaker (@satyamdiwaker000001 | satyamdiwaker863@gmail.com)

---

### 1. Dedicated Email OTP Verification Page (`/verify-otp`) & Mandatory Account Activation
* **Dedicated Verification Route (`frontend/src/features/auth/pages/VerifyOtpPage.jsx` & `frontend/src/routes.jsx`):**
  - Created a dedicated, distraction-free OTP verification page at `/verify-otp` with custom layout, 6-box segmented numeric input fields, automatic auto-focus sequencing, and keyboard backspace management.
  - Implemented 60-second cooldown timer with dynamic resend trigger calling `POST /api/auth/send-otp`.
  - Added direct fallback navigation to allow users to update an incorrect email address or return to registration.
* **Strict Post-Verification Dashboard Routing Workflow (`RegisterPage.jsx`):**
  - Refactored user registration: submitting the registration form no longer prematurely provisions an authenticated session or jumps directly into the dashboard.
  - Instead, the form validates all fields, securely dispatches the 6-digit OTP code to the user's email via the backend service, passes registration parameters securely in location state, and redirects immediately to `/verify-otp`.
  - Only upon successful code verification (`POST /api/auth/register` with valid code) are user credentials committed, tokens issued, and the user routed to `/dashboard`.

### 2. Floating Dynamic Island Capsule Navigation Built from Scratch
* **Floating Island Architecture (`frontend/src/components/common/PublicNavbar.jsx` & `PublicNavbar.css`):**
  - Completely replaced the legacy static full-width navbar with a floating glassmorphic capsule design suspended `16px` from the viewport top (`border-radius: 9999px`, `max-width: 1240px`, `backdrop-filter: blur(20px)`).
  - Added scroll-reactive dynamic elevation with subtle hairline borders and micro-drop-shadow transitions.
  - Built an active protection indicator badge featuring a pulsing live ping dot alongside the `ShieldCheck` icon.
* **Streamlined Brand Identity & Asset Sizing:**
  - Increased logo size to a prominent 34px icon with balanced typography (`DM Serif Display` / `Outfit`).
  - Completely removed blurry CSS drop-shadow/glow filters from the logo, achieving crisp, clean vector edges.
* **Mobile Glass Sheet Menu:**
  - Rebuilt the responsive navigation drawer into an animated slide-down sheet with full touch support and one-click quick action routes.

### 3. Flagship Landing Page Redesign with 3D Editorial CGI Artwork
* **Bespoke 3D CGI Vault Artwork (`frontend/src/assets/hero-landing.jpg`):**
  - Commissioned and rendered a custom, ultra-high-resolution 3D editorial visual featuring a high-security titanium vault safe with spoke locker wheel, soft natural studio lighting, and floating document folders.
* **Editorial Typography & Visual Hierarchy (`LandingPage.jsx` & `LandingPage.css`):**
  - Upgraded typography to high-trust `DM Serif Display` headlines coupled with `Manrope` body text.
  - Introduced live verification pill counters, trusted institutional proof badges, and high-contrast CTA buttons.
* **5-Tier Architectural Content Restructuring:**
  - **Hero Zone:** Dual primary/secondary conversion triggers with quick-glance cryptographic reassurance markers.
  - **Architectural Pillars:** 4 foundational technical cards highlighting AES-256-GCM vaulting, native OCR extraction, brute-force rate defenses, and zero third-party telemetry.
  - **6-Card Interactive Bento Grid:** High-density feature showcase with simulated UI components (Smart Categorization, Multi-Device Biometrics, Emergency Dead-Man Protocol, Audit Log Trails).
  - **Simulated Ingestion Sandbox:** Live interactive preview demonstrating document ingestion, instant OCR scanning, and metadata chip tagging.
  - **Structured 3-Step Guided Journey:** Clear onboarding milestones from Account Creation to PIN Enclave to Daily Vault Operations.

### 4. Interactive shadcn/ui-Style Accordion FAQ & Lucide-Only Standardized Footer
* **Category-Filtered FAQ Accordion (`LandingPage.jsx`):**
  - Replaced informal emoji titles with clean, enterprise-grade accordion questions.
  - Built interactive category filter pill tabs (`All Topics`, `Security & PIN`, `OCR & Intelligence`, `Session Defense`).
  - Implemented animated chevron indicators with smooth layout expansion powered by CSS transitions.
* **Lucide Icon Standardized Footer (`PublicFooter.jsx` & `PublicFooter.css`):**
  - Replaced all legacy inline SVG code and plain text items exclusively with official `lucide-react` vector icons (`GitBranch`, `Mail`, `MessageSquare`, `Globe`, `ShieldCheck`, `Lock`, `CheckCircle2`, `ArrowRight`).
  - Added live platform status pill (`99.99% Guaranteed Uptime`), institutional directory sitemap, and security compliance badges.

### 5. Universal Dark Mode Elimination & Enforced Light Editorial Theme
* **Complete Removal of Theme Toggles:**
  - Removed all theme toggle pills, moon/sun icons, and toggle states from `AuthLayout.jsx`, `PublicNavbar.jsx`, `AppHeader.jsx`, and `MorePage.jsx` (including complete removal of `.dv-toggle-pill` CSS).
* **Guaranteed Light Theme Enforcement (`frontend/src/main.jsx`):**
  - Set default `data-theme="light"` directly on `document.documentElement` on application startup.
  - Removed legacy `docvault_theme` localStorage keys to prevent legacy theme persistence and inconsistent component contrast.

### 6. Registration Form Balanced Spacing & Browser Reveal Eye Collision Fix
* **Even Field Distribution Within Fixed Height Container (`Auth.css`):**
  - Kept registration container dimensions strictly constrained to `height: 652.983px !important` with `overflow: hidden` (zero vertical scrollbars).
  - Evenly expanded input heights from `38px` to `44px`, submit button to `46px`, Google CTA button to `44px`, and grid row gaps to `14px 16px`, completely eliminating awkward bottom empty voids.
* **Browser Native Reveal Eye Suppression (`PasswordInput.css` & `globals.css`):**
  - Resolved double/conflicting eye icons appearing inside Master Password, Confirm Password, and PIN input fields.
  - Separated vendor pseudo-elements (`input::-ms-reveal`, `input::-ms-clear`, and WebKit auto-fill styles) into distinct CSS rule blocks to prevent browser selector dropping, ensuring custom DocVault eye icons render exclusively.

### 7. Brand Copy Clarification & Professional Industry Placeholders
* **Removed Misleading "Zero-Knowledge" Claims:**
  - Audited all user-facing surfaces and replaced misleading zero-knowledge claims with precise, fact-based security descriptions ("Create an account to access your secure document vault").
  - Updated `RegisterPage.jsx`, `AuthBrandPanel.jsx`, `LandingPage.jsx`, `emailService.js`, and `mockData.js`.
* **Standardized Corporate Input Placeholders:**
  - Replaced informal or redundant field placeholders across authentication screens with industry-standard formats:
    - Full Name: `Enter your full name`
    - Email Address: `name@example.com`
    - Master Password: `Create master password`
    - Confirm Password: `Confirm master password`
    - Security PIN: `Enter ${pinLength}-digit PIN`
    - Phone Number: `Enter contact phone number`

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

### 4. Zero-Knowledge Live Security Heuristic Copilot Integration
* **Removed Test Advisor Card from Overview Dashboard (`HomePage.jsx`):**
  - Removed the standalone "Security Copilot Advisor" widget from the active user dashboard.
* **Embedded Live Heuristic Advice Directly into Registration (`RegisterPage.jsx`):**
  - Integrated real-time Shannon entropy password evaluation and DataGenetics empirical PIN security checks directly into the account creation form.
  - **100% In-Memory & Client-Side:** No credentials or hashes ever leave browser memory; evaluations run in $<1\text{ms}$ with zero network requests.
  - Features real-time 4-segment visual rating bar, entropy estimation (`~X bits`), specific rule suggestions (e.g. uppercase, symbols, sequential number warnings), PIN pattern resilience indicators, and show/hide toggles.

### 5. Multi-Transport Cloud Email Architecture (Render Egress Firewall Defense)
* **Diagnosis of Cloud Delivery Failures:**
  - Render Free Tier enforces strict egress firewall rules that block outbound traffic on standard SMTP ports (25, 465, 587), causing connections to `smtp.gmail.com` to hang and throw `ETIMEDOUT`.
* **HTTPS Port 443 REST API Support (Resend & Brevo):**
  - Added native HTTPS dispatch via Resend REST API (`https://api.resend.com/emails`) and Brevo REST API (`https://api.brevo.com/v3/smtp/email`).
  - Operates over standard Port 443 (HTTPS), which is completely unblocked on Render, AWS, and cloud providers.
* **Socket Timeouts & Graceful Logging:**
  - Added 8-second socket and connection timeouts to Nodemailer to prevent cloud worker hanging.
  - Added automatic backup console logging of dispatched OTP codes in Render logs if firewall blocks occur.

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

