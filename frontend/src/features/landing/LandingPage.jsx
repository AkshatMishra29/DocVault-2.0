import React from 'react';
import { Link } from 'react-router-dom';
import PublicNavbar from '../../components/layout/PublicNavbar/PublicNavbar';
import PublicFooter from '../../components/layout/PublicFooter/PublicFooter';
import cloudStorageIllustration from '../../assets/Secure Cloud File Storage Illustration.png';
import { useAuth } from '../auth/context/AuthContext';

import { 
  ArrowRight, ShieldCheck, Sparkles, Clock, 
  FolderLock, HardDrive, FileCheck, CheckCircle2, 
  UploadCloud, Cpu, Layers, Search, Lock, Shield,
  ChevronRight, KeyRound, EyeOff, Zap, FileSpreadsheet,
  FileText, LayoutDashboard
} from 'lucide-react';
import './LandingPage.css';

export default function LandingPage() {
  const { user, isVaultUnlocked } = useAuth();
  return (
    <div className="dv-landing-modern">
      <PublicNavbar />

      {/* 1. HERO SECTION */}
      <section className="dv-m-hero">
        <div className="dv-m-hero__container">
          {/* Left Column: Copy & Value Proposition */}
          <div className="dv-m-hero__left">
            <div className="dv-m-hero__pill">
              <span className="dv-m-hero__pill-dot"></span>
              <span>Your personal document vault</span>
            </div>

            <h1 className="dv-m-hero__title">
              Your documents.<br />
              <span className="dv-m-hero__title-highlight">One intelligent vault.</span>
            </h1>

            <p className="dv-m-hero__description">
              Securely organize, manage and understand your important documents. Powered by private OCR extraction, renewal tracking, and grounded AI assistant.
            </p>

            <div className="dv-m-hero__cta-group">
              {user && isVaultUnlocked ? (
                <Link to="/dashboard" className="dv-m-btn-primary">
                  <span>Go to Vault Overview</span>
                  <LayoutDashboard size={16} />
                </Link>
              ) : (
                <>
                  <Link to="/register" className="dv-m-btn-primary">
                    <span>Get Started Free</span>
                    <ArrowRight size={16} />
                  </Link>
                  <Link to="/login" className="dv-m-btn-secondary">
                    <span>Sign In</span>
                    <KeyRound size={15} />
                  </Link>
                </>
              )}
            </div>

            <div className="dv-m-hero__trust-points">
              <div className="dv-m-trust-point">
                <CheckCircle2 size={16} className="dv-m-trust-icon" />
                <span>End-to-end encrypted storage</span>
              </div>
              <div className="dv-m-trust-point">
                <CheckCircle2 size={16} className="dv-m-trust-icon" />
                <span>Automated policy expiry extraction</span>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Illustration Artwork */}
          <div className="dv-m-hero__right">
            <div className="dv-m-hero__glow-bg"></div>
            <div className="dv-m-hero__vault-wrap">
              <img 
                src={cloudStorageIllustration} 
                alt="DocVault Secure Cloud Document Storage" 
                className="dv-m-hero__vault-img"
              />
              <div className="dv-m-hero__security-badge">
                <div className="dv-m-security-badge__icon">
                  <Lock size={16} />
                </div>
                <div className="dv-m-security-badge__text">
                  <strong>Your documents</strong>
                  <span>are safe, isolated & encrypted</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hero Features Strip (4 Quick Pillars) */}
        <div className="dv-m-hero__strip-container">
          <div className="dv-m-hero__strip">
            <div className="dv-m-strip-item">
              <div className="dv-m-strip-icon dv-m-strip-icon--teal">
                <HardDrive size={18} />
              </div>
              <div>
                <h5>Secure Storage</h5>
                <p>Your data, your control</p>
              </div>
            </div>

            <div className="dv-m-strip-item">
              <div className="dv-m-strip-icon dv-m-strip-icon--purple">
                <Sparkles size={18} />
              </div>
              <div>
                <h5>AI Powered</h5>
                <p>Smarter document insights</p>
              </div>
            </div>

            <div className="dv-m-strip-item">
              <div className="dv-m-strip-icon dv-m-strip-icon--amber">
                <Clock size={18} />
              </div>
              <div>
                <h5>Smart Reminders</h5>
                <p>Never miss a deadline</p>
              </div>
            </div>

            <div className="dv-m-strip-item">
              <div className="dv-m-strip-icon dv-m-strip-icon--blue">
                <FileCheck size={18} />
              </div>
              <div>
                <h5>Multi-Format Support</h5>
                <p>PDF, JPG, PNG & more</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. FEATURES GRID SECTION */}
      <section className="dv-m-features" id="features">
        <div className="dv-m-features__container">
          {/* Left Intro Column */}
          <div className="dv-m-features__left">
            <span className="dv-m-tagline">PLATFORM CAPABILITIES</span>
            <h2 className="dv-m-features__title">
              Powerful features for<br />a smarter document life.
            </h2>
            <p className="dv-m-features__subtitle">
              From organization to insights, DocVault gives you everything you need to stay in control — all in one place.
            </p>
            <Link to="/register" className="dv-m-features__link">
              <span>Explore all features</span>
              <ArrowRight size={15} />
            </Link>
          </div>

          {/* Right 2x3 Grid */}
          <div className="dv-m-features__grid">
            {/* Card 1: Document Vault */}
            <div className="dv-m-feature-card">
              <div className="dv-m-card-icon dv-m-card-icon--teal">
                <FolderLock size={18} />
              </div>
              <h4 className="dv-m-card-title">Document Vault</h4>
              <p className="dv-m-card-desc">Store and organize your sensitive documents securely with biometric PIN protection.</p>
            </div>

            {/* Card 2: AI Assistant */}
            <div className="dv-m-feature-card">
              <div className="dv-m-card-icon dv-m-card-icon--purple">
                <Sparkles size={18} />
              </div>
              <h4 className="dv-m-card-title">AI Copilot</h4>
              <p className="dv-m-card-desc">Get instant answers and extract policy clauses grounded strictly in your files.</p>
            </div>

            {/* Card 3: Expiry Tracking */}
            <div className="dv-m-feature-card">
              <div className="dv-m-card-icon dv-m-card-icon--amber">
                <Clock size={18} />
              </div>
              <h4 className="dv-m-card-title">Expiry Tracking</h4>
              <p className="dv-m-card-desc">Automated alerts for passport renewals, vehicle warranties, and policy deadlines.</p>
            </div>

            {/* Card 4: Smart Organization */}
            <div className="dv-m-feature-card">
              <div className="dv-m-card-icon dv-m-card-icon--cyan">
                <Layers size={18} />
              </div>
              <h4 className="dv-m-card-title">Smart Categorization</h4>
              <p className="dv-m-card-desc">Automatically tag identity, health, finance, and asset files in seconds.</p>
            </div>

            {/* Card 5: Assets Management */}
            <div className="dv-m-feature-card">
              <div className="dv-m-card-icon dv-m-card-icon--blue">
                <HardDrive size={18} />
              </div>
              <h4 className="dv-m-card-title">Asset Registry</h4>
              <p className="dv-m-card-desc">Track appliances, vehicles, real estate deeds, and cross-link purchase receipts.</p>
            </div>

            {/* Card 6: Secure & Private */}
            <div className="dv-m-feature-card">
              <div className="dv-m-card-icon dv-m-card-icon--emerald">
                <Shield size={18} />
              </div>
              <h4 className="dv-m-card-title">Bank-Grade Security</h4>
              <p className="dv-m-card-desc">Secondary vault PIN prevents unauthorized access even on shared family devices.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. INTERACTIVE DASHBOARD SHOWCASE */}
      <section className="dv-m-showcase">
        <div className="dv-m-showcase__bg-decor"></div>
        <div className="dv-m-showcase__container">
          {/* Left Mockup View: Pure CSS High-Fidelity Dashboard Replica */}
          <div className="dv-m-showcase__left">
            <div className="dv-m-dash-preview-card">
              {/* Top App Bar */}
              <div className="dv-m-dp-header">
                <div className="dv-m-dp-dots">
                  <span className="dv-m-dp-dot red"></span>
                  <span className="dv-m-dp-dot yellow"></span>
                  <span className="dv-m-dp-dot green"></span>
                </div>
                <div className="dv-m-dp-search">
                  <Search size={12} />
                  <span>Search documents, assets, or ask AI...</span>
                </div>
                <div className="dv-m-dp-user">
                  <div className="dv-m-dp-avatar">SH</div>
                </div>
              </div>

              {/* Inner Dashboard Body */}
              <div className="dv-m-dp-body">
                {/* Greeting & Stats */}
                <div className="dv-m-dp-greeting">
                  <div>
                    <h4>Good morning, Satyam 👋</h4>
                    <p>Here is what's happening with your vault today.</p>
                  </div>
                  <div className="dv-m-dp-stats">
                    <div className="dv-m-dp-stat">
                      <span className="num">42</span>
                      <span className="lbl">Documents</span>
                    </div>
                    <div className="dv-m-dp-stat">
                      <span className="num">8</span>
                      <span className="lbl">Assets</span>
                    </div>
                    <div className="dv-m-dp-stat alert">
                      <span className="num">2</span>
                      <span className="lbl">Expiring</span>
                    </div>
                  </div>
                </div>

                {/* Split Content: Recent Documents & Upcoming Deadlines */}
                <div className="dv-m-dp-grid">
                  <div className="dv-m-dp-panel">
                    <div className="dv-m-dp-panel-header">
                      <h5>Recent Documents</h5>
                      <span>View all</span>
                    </div>
                    <div className="dv-m-dp-item">
                      <div className="dv-m-dp-item-icon blue">
                        <FileText size={14} />
                      </div>
                      <div className="dv-m-dp-item-meta">
                        <strong>Insurance_Policy.pdf</strong>
                        <small>Health Cover • 2.4 MB</small>
                      </div>
                      <span className="dv-m-dp-badge green">Verified</span>
                    </div>
                    <div className="dv-m-dp-item">
                      <div className="dv-m-dp-item-icon teal">
                        <FileSpreadsheet size={14} />
                      </div>
                      <div className="dv-m-dp-item-meta">
                        <strong>Car_Registration.pdf</strong>
                        <small>Vehicle Deed • 1.1 MB</small>
                      </div>
                      <span className="dv-m-dp-badge green">Active</span>
                    </div>
                  </div>

                  <div className="dv-m-dp-panel">
                    <div className="dv-m-dp-panel-header">
                      <h5>Upcoming Deadlines</h5>
                      <span>Calendar</span>
                    </div>
                    <div className="dv-m-dp-item">
                      <div className="dv-m-dp-item-icon amber">
                        <Clock size={14} />
                      </div>
                      <div className="dv-m-dp-item-meta">
                        <strong>Car Insurance Renewal</strong>
                        <small>Due in 12 days</small>
                      </div>
                      <span className="dv-m-dp-badge amber">Urgent</span>
                    </div>
                    <div className="dv-m-dp-item">
                      <div className="dv-m-dp-item-icon purple">
                        <Sparkles size={14} />
                      </div>
                      <div className="dv-m-dp-item-meta">
                        <strong>Ask AI Copilot</strong>
                        <small>Grounded RAG queries</small>
                      </div>
                      <span className="dv-m-dp-badge purple">AI Ready</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Highlights */}
          <div className="dv-m-showcase__right">
            <span className="dv-m-tagline">DASHBOARD</span>
            <h2 className="dv-m-showcase__title">
              Everything you need,<br />right at a glance.
            </h2>
            <p className="dv-m-showcase__desc">
              Your personal dashboard gives you a complete overview of your documents, deadlines and important updates. Stay organized, stay ahead.
            </p>

            <ul className="dv-m-check-list">
              <li>
                <CheckCircle2 size={16} className="dv-m-check-icon" />
                <span>Quick stats and real-time OCR extraction status</span>
              </li>
              <li>
                <CheckCircle2 size={16} className="dv-m-check-icon" />
                <span>Upcoming policy and warranty expiration countdowns</span>
              </li>
              <li>
                <CheckCircle2 size={16} className="dv-m-check-icon" />
                <span>Recent documents with one-click secure preview</span>
              </li>
              <li>
                <CheckCircle2 size={16} className="dv-m-check-icon" />
                <span>AI assistant preview for conversational querying</span>
              </li>
            </ul>

            <Link to="/login" className="dv-m-btn-primary dv-m-btn-dashboard">
              <span>Explore Dashboard</span>
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* 4. HOW IT WORKS SECTION */}
      <section className="dv-m-process" id="how-it-works">
        <div className="dv-m-process__container">
          <div className="dv-m-process__header">
            <span className="dv-m-tagline">SIMPLE PROCESS</span>
            <h2 className="dv-m-process__title">How it works</h2>
            <p className="dv-m-process__subtitle">
              Get started in minutes. Our simple process helps you secure, organize and manage your documents with ease.
            </p>
          </div>

          <div className="dv-m-process__steps">
            {/* Step 1 */}
            <div className="dv-m-step-card">
              <div className="dv-m-step-icon dv-m-step-icon--green">
                <UploadCloud size={20} />
              </div>
              <span className="dv-m-step-num">01</span>
              <h4 className="dv-m-step-title">Upload</h4>
              <p className="dv-m-step-desc">Add your PDFs, scans, photos and important documents to your vault.</p>
            </div>

            {/* Step 2 */}
            <div className="dv-m-step-card">
              <div className="dv-m-step-icon dv-m-step-icon--blue">
                <Cpu size={20} />
              </div>
              <span className="dv-m-step-num">02</span>
              <h4 className="dv-m-step-title">Extract</h4>
              <p className="dv-m-step-desc">AI processes files and identifies key information and dates with high accuracy.</p>
            </div>

            {/* Step 3 */}
            <div className="dv-m-step-card">
              <div className="dv-m-step-icon dv-m-step-icon--teal">
                <Layers size={20} />
              </div>
              <span className="dv-m-step-num">03</span>
              <h4 className="dv-m-step-title">Organize</h4>
              <p className="dv-m-step-desc">Documents are categorized and securely stored in your personal vault.</p>
            </div>

            {/* Step 4 */}
            <div className="dv-m-step-card">
              <div className="dv-m-step-icon dv-m-step-icon--amber">
                <Search size={20} />
              </div>
              <span className="dv-m-step-num">04</span>
              <h4 className="dv-m-step-title">Discover</h4>
              <p className="dv-m-step-desc">Search, track deadlines and ask questions with the grounded AI copilot.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SECURITY & PRIVACY CARD BANNER */}
      <section className="dv-m-security" id="security">
        <div className="dv-m-security__container">
          <div className="dv-m-security-card">
            {/* Left text in dark box */}
            <div className="dv-m-security-card__left">
              <span className="dv-m-security-tag">SECURITY & TRUST</span>
              <h3 className="dv-m-security-title">
                Built with security<br />and privacy at the core.
              </h3>
              <p className="dv-m-security-desc">
                Your documents are protected with bank-grade encryption, including password authentication, Vault PIN verification and secure cloud storage.
              </p>
              <Link to="/register" className="dv-m-security-btn">
                <span>Create Secure Vault</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            {/* Center: Glowing Vault Lock Emblem */}
            <div className="dv-m-security-card__center">
              <div className="dv-m-security-emblem">
                <div className="dv-m-security-emblem__shield">
                  <ShieldCheck size={56} />
                </div>
                <div className="dv-m-security-emblem__rings">
                  <span className="ring ring-1"></span>
                  <span className="ring ring-2"></span>
                </div>
              </div>
            </div>

            {/* Right: 3 Pillars with white cards */}
            <div className="dv-m-security-card__right">
              <div className="dv-m-security-pillar">
                <div className="dv-m-pillar-icon">
                  <Shield size={16} />
                </div>
                <div>
                  <strong>End-to-End Encryption</strong>
                  <p>Your data stays completely private</p>
                </div>
              </div>

              <div className="dv-m-security-pillar">
                <div className="dv-m-pillar-icon">
                  <Lock size={16} />
                </div>
                <div>
                  <strong>Vault PIN Protection</strong>
                  <p>Second layer security challenge</p>
                </div>
              </div>

              <div className="dv-m-security-pillar">
                <div className="dv-m-pillar-icon">
                  <HardDrive size={16} />
                </div>
                <div>
                  <strong>Secure Cloud Storage</strong>
                  <p>Encrypted multi-region infrastructure</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. OPTIMIZED FAQS SECTION */}
      <section className="dv-m-faq" id="faq" style={{ padding: "80px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "48px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#015A47", textTransform: "uppercase", letterSpacing: "1px" }}>
              Frequently Asked Questions
            </span>
            <h2 style={{ fontSize: "32px", fontWeight: 800, color: "#0f172a", marginTop: "8px" }}>
              Everything you need to know about DocVault
            </h2>
            <p style={{ color: "#64748b", fontSize: "16px", marginTop: "8px" }}>
              Learn how our multi-tier encryption, OCR extraction, and biometric protection keep your records secure.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "24px" }}>
            <div style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.03)" }}>
              <h4 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                🔒 How does the Two-Tier Vault PIN security work?
              </h4>
              <p style={{ fontSize: "14px", color: "#475569", lineHeight: 1.6, margin: 0 }}>
                DocVault uses a two-step defense: Step 1 verifies your master account credentials or Google OAuth. Step 2 requires your personal 4 or 6-digit Vault PIN or hardware biometrics (Touch ID / Fingerprint) before granting access to encrypted files.
              </p>
            </div>

            <div style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.03)" }}>
              <h4 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                📄 What document formats are supported by automated OCR?
              </h4>
              <p style={{ fontSize: "14px", color: "#475569", lineHeight: 1.6, margin: 0 }}>
                DocVault supports multi-page PDFs, scanned images, photos (PNG, JPG, WebP), and receipts. Our Sharp image normalization pipeline and fallback OCR extract text and detect renewal deadlines automatically.
              </p>
            </div>

            <div style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.03)" }}>
              <h4 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                🛡️ What happens if someone tries to guess my PIN?
              </h4>
              <p style={{ fontSize: "14px", color: "#475569", lineHeight: 1.6, margin: 0 }}>
                DocVault enforces an automated 5-minute brute-force lockout after 5 consecutive incorrect PIN attempts, disabling keypad inputs and logging the security event in your immutable audit trail.
              </p>
            </div>

            <div style={{ background: "#ffffff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 2px 4px rgba(0,0,0,0.03)" }}>
              <h4 style={{ fontSize: "17px", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                📱 Does DocVault automatically lock when my device sleeps?
              </h4>
              <p style={{ fontSize: "14px", color: "#475569", lineHeight: 1.6, margin: 0 }}>
                Yes. If your phone sleeps, your laptop lid closes, or your session is left resting for over 10 minutes, the auto-lock engine returns the vault to the PIN challenge to protect against unauthorized physical access.
              </p>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
