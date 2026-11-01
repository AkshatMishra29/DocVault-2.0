import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import MobileAppAuthView from './MobileAppAuthView';
import PublicNavbar from '../../components/layout/PublicNavbar/PublicNavbar';
import PublicFooter from '../../components/layout/PublicFooter/PublicFooter';
import heroArtwork from '../../assets/hero-landing.jpg';
import { useAuth } from '../auth/context/AuthContext';

import { 
  ArrowRight, ShieldCheck, Sparkles, Clock, 
  FolderLock, HardDrive, FileCheck, CheckCircle2, 
  UploadCloud, Cpu, Layers, Search, Lock, Shield,
  KeyRound, ChevronRight, FileSpreadsheet,
  FileText, LayoutDashboard, Fingerprint, AlertCircle,
  ChevronDown, FileCheck2, ShieldAlert, Smartphone, HelpCircle,
  MessageSquare, Mail
} from 'lucide-react';
import './LandingPage.css';

const FAQ_ITEMS = [
  {
    id: 1,
    tag: "Security Protocol",
    category: "security",
    icon: KeyRound,
    question: "How does the Two-Tier Vault PIN defense operate?",
    answer: "DocVault establishes a two-stage barrier. Tier 1 authenticates your master account credentials or verified Google OAuth session. Tier 2 strictly requires your personal 4 or 6-digit cryptographic Vault PIN or hardware biometrics (Touch ID / Face ID) to unlock the document workspace. Without the second-tier PIN, document content remains locked in restricted custody."
  },
  {
    id: 2,
    tag: "OCR & Processing",
    category: "intelligence",
    icon: FileCheck2,
    question: "What document formats and files are supported by automated extraction?",
    answer: "DocVault natively processes multi-page PDFs, scanned paperwork, camera captures, and high-resolution images (PNG, JPG, WebP). The ingestion pipeline applies Sharp contrast conditioning and noise reduction before deterministic rules extract Indian GSTINs, invoice totals, document dates, and policy identifiers."
  },
  {
    id: 3,
    tag: "Brute-Force Defense",
    category: "security",
    icon: ShieldAlert,
    question: "What happens if an unauthorized party attempts to guess my Vault PIN?",
    answer: "DocVault enforces an automated anti-tamper protocol: after 5 consecutive incorrect PIN entries, an immediate 5-minute cooldown lockout activates. Keypad interactions are disabled, and the security attempt is committed to your tamper-evident security audit log."
  },
  {
    id: 4,
    tag: "Device Hygiene",
    category: "session",
    icon: Smartphone,
    question: "Does the vault lock automatically when the device sleeps or stays idle?",
    answer: "Yes. To protect against physical intrusion on shared or unattended devices, the background inactivity monitor automatically relocks the vault whenever your device sleeps, the browser tab remains idle for over 10 minutes, or you switch workspaces."
  },
  {
    id: 5,
    tag: "Data Privacy",
    category: "security",
    icon: ShieldCheck,
    question: "How does DocVault handle sensitive national identity cards like Aadhaar or PAN?",
    answer: "Our centralized Privacy Policy Gate automatically identifies Indian National IDs (Aadhaar, PAN, Voter IDs) upon ingestion and routes them to a strict STORAGE_ONLY mode. These sensitive records are stored under client encryption keys and are never dispatched to external OCR APIs."
  },
  {
    id: 6,
    tag: "AI Intelligence",
    category: "intelligence",
    icon: Sparkles,
    question: "How does the AI Copilot prevent hallucinations when answering questions?",
    answer: "The DocVault Copilot operates on strict Retrieval-Augmented Generation (RAG) grounding gates. Every answer must reference an exact, verified text snippet from your uploaded documents. If the requested information is absent or ambiguous, the copilot explicitly declines rather than inventing details."
  }
];

export default function LandingPage() {
  const { user, isVaultUnlocked } = useAuth();
  const [openFaq, setOpenFaq] = useState(1);
  const [faqFilter, setFaqFilter] = useState('all');
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth <= 1024;
    }
    return false;
  });
  const [forceDesktopWeb, setForceDesktopWeb] = useState(false);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobileOrTablet(window.innerWidth <= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // When already authenticated, go straight to dashboard
  if (user && isVaultUnlocked) {
    return <Navigate to="/dashboard" replace />;
  }

  // Mobile to Tab View: show native app login/registration screen
  if (isMobileOrTablet && !forceDesktopWeb) {
    return <MobileAppAuthView onSwitchToDesktopWeb={() => setForceDesktopWeb(true)} />;
  }

  const toggleFaq = (id) => {
    setOpenFaq(prev => prev === id ? null : id);
  };

  const filteredFaqs = faqFilter === 'all' 
    ? FAQ_ITEMS 
    : FAQ_ITEMS.filter(item => item.category === faqFilter);

  return (
    <div className="dv-landing-root">
      {isMobileOrTablet && forceDesktopWeb && (
        <aside className="dv-lp-desktop-bar" role="complementary">
          <div className="dv-lp-desktop-bar__content">
            <Smartphone size={14} />
            <span>Viewing Desktop Web Presentation</span>
            <button
              type="button"
              onClick={() => setForceDesktopWeb(false)}
              className="dv-lp-desktop-bar__btn"
            >
              Switch to Native App
            </button>
          </div>
        </aside>
      )}
      <PublicNavbar />

      {/* 1. HERO SECTION */}
      <section className="dv-lp-hero">
        <div className="dv-lp-hero__container">
          {/* Left Column: Copy & Value Proposition */}
          <div className="dv-lp-hero__left">
            <div className="dv-lp-kicker">
              <span className="dv-lp-kicker-dot" />
              <span>Sovereign Personal Document Vault</span>
            </div>

            <h1 className="dv-lp-hero__title">
              Your critical documents.<br />
              <span className="dv-lp-hero__title-accent">Protected with absolute custody.</span>
            </h1>

            <p className="dv-lp-hero__desc">
              End-to-end encrypted storage, automated OCR extraction, proactive renewal intelligence, and a grounded AI assistant — unified in one serene personal vault.
            </p>

            <div className="dv-lp-hero__cta-row">
              {user && isVaultUnlocked ? (
                <Link to="/dashboard" className="dv-lp-btn-primary">
                  <span>Open Your Vault Dashboard</span>
                  <LayoutDashboard size={16} />
                </Link>
              ) : (
                <>
                  <Link to="/register" className="dv-lp-btn-primary">
                    <span>Create Your Private Vault</span>
                    <ArrowRight size={16} />
                  </Link>
                  <Link to="/login" className="dv-lp-btn-secondary">
                    <Lock size={15} />
                    <span>Sign In to Vault</span>
                  </Link>
                </>
              )}
            </div>

            <div className="dv-lp-hero__trust-strip">
              <div className="dv-lp-trust-item">
                <CheckCircle2 size={16} className="dv-lp-trust-icon" />
                <span>Multi-Tier Vault Encryption</span>
              </div>
              <div className="dv-lp-trust-item">
                <CheckCircle2 size={16} className="dv-lp-trust-icon" />
                <span>Automated Expiry & Renewal Alerts</span>
              </div>
              <div className="dv-lp-trust-item">
                <CheckCircle2 size={16} className="dv-lp-trust-icon" />
                <span>Grounded AI Intelligence</span>
              </div>
            </div>
          </div>

          {/* Right Column: Bespoke 3D Hero Artwork */}
          <div className="dv-lp-hero__right">
            <div className="dv-lp-hero__art-frame">
              <img 
                src={heroArtwork} 
                alt="DocVault 3D Ceramic Safe with Spoke Locker Wheel and Floating Documents" 
                className="dv-lp-hero__art-img"
              />

              {/* Floating Live Badge 1: Vault Security Status */}
              <div className="dv-lp-float-badge dv-lp-float-badge--top">
                <div className="dv-lp-float-badge__icon dv-lp-float-badge__icon--green">
                  <ShieldCheck size={18} />
                </div>
                <div className="dv-lp-float-badge__info">
                  <div className="dv-lp-float-badge__header">
                    <span className="dv-lp-pulse-dot" />
                    <strong>Dual-Tier Lock Active</strong>
                  </div>
                  <span>Hardware PIN & Biometrics Enforced</span>
                </div>
              </div>

              {/* Floating Live Badge 2: OCR Intelligence */}
              <div className="dv-lp-float-badge dv-lp-float-badge--bottom">
                <div className="dv-lp-float-badge__icon dv-lp-float-badge__icon--coral">
                  <Sparkles size={18} />
                </div>
                <div className="dv-lp-float-badge__info">
                  <strong>OCR Engine Verified</strong>
                  <span>Tax Invoice & Expiry Detected (14d)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Architectural Pillars Strip */}
        <div className="dv-lp-pillars-wrapper">
          <div className="dv-lp-pillars-grid">
            <div className="dv-lp-pillar-card">
              <div className="dv-lp-pillar-icon dv-lp-pillar-icon--ember">
                <Lock size={18} />
              </div>
              <div>
                <h5>Dual-Tier PIN Defense</h5>
                <p>Master credentials paired with a personal cryptographic PIN challenge.</p>
              </div>
            </div>

            <div className="dv-lp-pillar-card">
              <div className="dv-lp-pillar-icon dv-lp-pillar-icon--taupe">
                <Sparkles size={18} />
              </div>
              <div>
                <h5>Automated OCR Extraction</h5>
                <p>Detects GSTINs, invoice totals, passport dates, and policy numbers.</p>
              </div>
            </div>

            <div className="dv-lp-pillar-card">
              <div className="dv-lp-pillar-icon dv-lp-pillar-icon--amber">
                <Clock size={18} />
              </div>
              <div>
                <h5>Proactive Renewal Guard</h5>
                <p>Timely notifications delivered before policies, warranties, or IDs lapse.</p>
              </div>
            </div>

            <div className="dv-lp-pillar-card">
              <div className="dv-lp-pillar-icon dv-lp-pillar-icon--green">
                <FolderLock size={18} />
              </div>
              <div>
                <h5>Grounded AI Copilot</h5>
                <p>Ask questions about your coverage and get answers cited directly from files.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. CORE CAPABILITIES BENTO GRID */}
      <section className="dv-lp-features" id="features">
        <div className="dv-lp-container">
          <div className="dv-lp-section-header">
            <span className="dv-lp-tagline">PLATFORM CAPABILITIES</span>
            <h2 className="dv-lp-section-title">
              Engineered for clarity, built for life's milestones.
            </h2>
            <p className="dv-lp-section-sub">
              From zero-clutter organization to instant answers, DocVault gives you absolute confidence over your legal and financial records.
            </p>
          </div>

          <div className="dv-lp-bento-grid">
            {/* Card 1 */}
            <div className="dv-lp-bento-card">
              <div className="dv-lp-bento-icon dv-lp-bento-icon--ember">
                <FolderLock size={20} />
              </div>
              <h4>Sovereign Document Vault</h4>
              <p>Store, categorize, and access sensitive contracts, deeds, and health policies in an isolated personal vault.</p>
            </div>

            {/* Card 2 */}
            <div className="dv-lp-bento-card" id="intelligence">
              <div className="dv-lp-bento-icon dv-lp-bento-icon--taupe">
                <Sparkles size={20} />
              </div>
              <h4>Grounded AI Assistant</h4>
              <p>Query coverage clauses, claim deductibles, or policy terms with zero hallucinations and exact document citations.</p>
            </div>

            {/* Card 3 */}
            <div className="dv-lp-bento-card">
              <div className="dv-lp-bento-icon dv-lp-bento-icon--amber">
                <Clock size={20} />
              </div>
              <h4>Expiry & Renewal Guard</h4>
              <p>Automated countdowns and alerts ensure passports, motor policies, and appliance warranties never lapse unnoticed.</p>
            </div>

            {/* Card 4 */}
            <div className="dv-lp-bento-card">
              <div className="dv-lp-bento-icon dv-lp-bento-icon--green">
                <Layers size={20} />
              </div>
              <h4>Intelligent Categorization</h4>
              <p>High-accuracy classification automatically tags Identity, Tax, Vehicle, Medical, and Real Estate paperwork.</p>
            </div>

            {/* Card 5 */}
            <div className="dv-lp-bento-card">
              <div className="dv-lp-bento-icon dv-lp-bento-icon--blue">
                <HardDrive size={20} />
              </div>
              <h4>Asset & Deed Registry</h4>
              <p>Track valuable possessions, appliances, property deeds, and link verified receipts to calculate overall portfolio value.</p>
            </div>

            {/* Card 6 */}
            <div className="dv-lp-bento-card">
              <div className="dv-lp-bento-icon dv-lp-bento-icon--dark">
                <ShieldCheck size={20} />
              </div>
              <h4>Tamper-Resistant Defense</h4>
              <p>Automated brute-force lockout, single active session enforcement, and WebAuthn biometric fallback.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. INTERACTIVE DASHBOARD SHOWCASE */}
      <section className="dv-lp-showcase">
        <div className="dv-lp-container">
          <div className="dv-lp-showcase__grid">
            {/* Left Column: High-Fidelity UI Mockup */}
            <div className="dv-lp-showcase__left">
              <div className="dv-lp-mockup-frame">
                {/* Mockup Header */}
                <div className="dv-lp-mockup-top">
                  <div className="dv-lp-mockup-dots">
                    <span className="dot dot--red" />
                    <span className="dot dot--yellow" />
                    <span className="dot dot--green" />
                  </div>
                  <div className="dv-lp-mockup-search">
                    <Search size={13} />
                    <span>Search documents, policies, or ask AI...</span>
                  </div>
                  <div className="dv-lp-mockup-avatar">
                    <span>JD</span>
                  </div>
                </div>

                {/* Mockup Body */}
                <div className="dv-lp-mockup-body">
                  <div className="dv-lp-mockup-banner">
                    <div>
                      <h3>Welcome back, John</h3>
                      <p>All 42 documents encrypted and verified in custody.</p>
                    </div>
                    <div className="dv-lp-mockup-stats">
                      <div className="stat-pill">
                        <strong>42</strong>
                        <span>Files</span>
                      </div>
                      <div className="stat-pill">
                        <strong>8</strong>
                        <span>Assets</span>
                      </div>
                      <div className="stat-pill stat-pill--alert">
                        <strong>2</strong>
                        <span>Expiring</span>
                      </div>
                    </div>
                  </div>

                  {/* Dual Grid: Recent Files & Expiry Calendar */}
                  <div className="dv-lp-mockup-panels">
                    <div className="dv-lp-mockup-panel">
                      <div className="panel-title-row">
                        <h5>Recent Verified Files</h5>
                        <small>View all</small>
                      </div>
                      <div className="panel-item">
                        <div className="item-icon item-icon--pdf">
                          <FileText size={15} />
                        </div>
                        <div className="item-meta">
                          <strong>Motor_Insurance_Policy.pdf</strong>
                          <small>Vehicle Cover • 2.4 MB</small>
                        </div>
                        <span className="badge badge--success">Verified</span>
                      </div>
                      <div className="panel-item">
                        <div className="item-icon item-icon--tax">
                          <FileSpreadsheet size={15} />
                        </div>
                        <div className="item-meta">
                          <strong>Tax_Invoice_2026.pdf</strong>
                          <small>Financial • GSTIN Extracted</small>
                        </div>
                        <span className="badge badge--success">Active</span>
                      </div>
                    </div>

                    <div className="dv-lp-mockup-panel">
                      <div className="panel-title-row">
                        <h5>Upcoming Deadlines</h5>
                        <small>Calendar</small>
                      </div>
                      <div className="panel-item">
                        <div className="item-icon item-icon--alert">
                          <Clock size={15} />
                        </div>
                        <div className="item-meta">
                          <strong>Vehicle Insurance Renewal</strong>
                          <small>Due in 14 days • HDFC ERGO</small>
                        </div>
                        <span className="badge badge--alert">Urgent</span>
                      </div>
                      <div className="panel-item">
                        <div className="item-icon item-icon--ai">
                          <Sparkles size={15} />
                        </div>
                        <div className="item-meta">
                          <strong>Ask AI Copilot</strong>
                          <small>Grounded query ready</small>
                        </div>
                        <span className="badge badge--ai">AI Ready</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Narrative Copy */}
            <div className="dv-lp-showcase__right">
              <span className="dv-lp-tagline">UNIFIED INTERFACE</span>
              <h2 className="dv-lp-section-title">
                Everything important,<br />instantly accessible.
              </h2>
              <p className="dv-lp-section-sub">
                Designed for speed and clarity. View extracted policy metadata, countdown timers, and document previews without digging through cluttered file systems.
              </p>

              <div className="dv-lp-checklist">
                <div className="dv-lp-check-item">
                  <CheckCircle2 size={18} className="dv-lp-check-icon" />
                  <div>
                    <strong>Instant Deterministic Extraction</strong>
                    <p>Clean GSTINs, invoice totals, and dates extracted instantly with strict verification gates.</p>
                  </div>
                </div>

                <div className="dv-lp-check-item">
                  <CheckCircle2 size={18} className="dv-lp-check-icon" />
                  <div>
                    <strong>Proactive Renewal Timelines</strong>
                    <p>Visual countdown badges warn you weeks in advance before critical coverage expires.</p>
                  </div>
                </div>

                <div className="dv-lp-check-item">
                  <CheckCircle2 size={18} className="dv-lp-check-icon" />
                  <div>
                    <strong>Conversational Copilot</strong>
                    <p>Ask natural questions about your documents with answers strictly grounded in your files.</p>
                  </div>
                </div>
              </div>

              <Link to="/register" className="dv-lp-btn-primary" style={{ marginTop: '28px' }}>
                <span>Experience the Vault</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 4. HOW IT WORKS SECTION */}
      <section className="dv-lp-process" id="how-it-works">
        <div className="dv-lp-container">
          <div className="dv-lp-section-header">
            <span className="dv-lp-tagline">HOW IT WORKS</span>
            <h2 className="dv-lp-section-title">Sovereign custody in four simple steps</h2>
            <p className="dv-lp-section-sub">
              From upload to intelligence, your documents remain private, encrypted, and under your command.
            </p>
          </div>

          <div className="dv-lp-steps-grid">
            <div className="dv-lp-step-card">
              <span className="dv-lp-step-number">01</span>
              <div className="dv-lp-step-icon">
                <UploadCloud size={22} />
              </div>
              <h4>Upload</h4>
              <p>Add PDFs, scanned documents, receipts, or smartphone photos with drag-and-drop ease.</p>
            </div>

            <div className="dv-lp-step-card">
              <span className="dv-lp-step-number">02</span>
              <div className="dv-lp-step-icon">
                <Cpu size={22} />
              </div>
              <h4>Extract</h4>
              <p>Deterministic rules and OCR automatically extract dates, policy identifiers, and numbers.</p>
            </div>

            <div className="dv-lp-step-card">
              <span className="dv-lp-step-number">03</span>
              <div className="dv-lp-step-icon">
                <Layers size={22} />
              </div>
              <h4>Organize</h4>
              <p>Files are structured into secure categories and encrypted behind your hardware Vault PIN.</p>
            </div>

            <div className="dv-lp-step-card">
              <span className="dv-lp-step-number">04</span>
              <div className="dv-lp-step-icon">
                <Sparkles size={22} />
              </div>
              <h4>Query</h4>
              <p>Track deadlines on your dashboard and query policy clauses through the grounded AI copilot.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SECURITY ARCHITECTURE CARD */}
      <section className="dv-lp-security" id="security">
        <div className="dv-lp-container">
          <div className="dv-lp-security-card">
            <div className="dv-lp-security-content">
              <span className="dv-lp-security-badge">
                <ShieldCheck size={14} />
                <span>CRYPTOGRAPHIC DEFENSE</span>
              </span>

              <h3 className="dv-lp-security-title">
                Security and privacy engineered at every layer.
              </h3>

              <p className="dv-lp-security-desc">
                DocVault isolates sensitive document workflows. With dual-tier authentication, brute-force lockout defenses, and client-side encryption keys, your personal paperwork stays exclusively yours.
              </p>

              <div className="dv-lp-security-grid">
                <div className="dv-lp-sec-item">
                  <Lock size={18} className="dv-lp-sec-icon" />
                  <div>
                    <strong>Two-Tier PIN Challenge</strong>
                    <p>Secondary 4/6-digit security PIN locks files even on shared family devices.</p>
                  </div>
                </div>

                <div className="dv-lp-sec-item">
                  <Fingerprint size={18} className="dv-lp-sec-icon" />
                  <div>
                    <strong>Hardware WebAuthn</strong>
                    <p>Touch ID, Face ID, and biometric keys supported natively for instant unlock.</p>
                  </div>
                </div>

                <div className="dv-lp-sec-item">
                  <Shield size={18} className="dv-lp-sec-icon" />
                  <div>
                    <strong>Privacy Policy Gate</strong>
                    <p>Strict classification guarantees national IDs are protected and never leaked.</p>
                  </div>
                </div>

                <div className="dv-lp-sec-item">
                  <AlertCircle size={18} className="dv-lp-sec-icon" />
                  <div>
                    <strong>Anti-Tamper Lockout</strong>
                    <p>Automated 5-minute lockout protocol triggers upon 5 consecutive failed attempts.</p>
                  </div>
                </div>
              </div>

              <div className="dv-lp-security-cta">
                <Link to="/register" className="dv-lp-btn-primary">
                  <span>Create Your Secure Vault</span>
                  <ArrowRight size={15} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. PROFESSIONAL SHADCN-STYLE ACCORDION FAQ */}
      <section className="dv-lp-faq" id="faq">
        <div className="dv-lp-container dv-lp-container--narrow">
          <div className="dv-lp-section-header">
            <span className="dv-lp-tagline">FREQUENTLY ASKED QUESTIONS</span>
            <h2 className="dv-lp-section-title">Everything you need to know about DocVault</h2>
            <p className="dv-lp-section-sub">
              Clear, substantiated answers regarding our cryptographic architecture, OCR extraction gates, and privacy protocols.
            </p>
          </div>

          {/* Category Tabs (shadcn/ui Pill Style) */}
          <div className="dv-lp-faq-tabs" role="tablist">
            <button
              type="button"
              className={`dv-lp-faq-tab ${faqFilter === 'all' ? 'dv-lp-faq-tab--active' : ''}`}
              onClick={() => setFaqFilter('all')}
            >
              All Topics
            </button>
            <button
              type="button"
              className={`dv-lp-faq-tab ${faqFilter === 'security' ? 'dv-lp-faq-tab--active' : ''}`}
              onClick={() => setFaqFilter('security')}
            >
              Security & PIN
            </button>
            <button
              type="button"
              className={`dv-lp-faq-tab ${faqFilter === 'intelligence' ? 'dv-lp-faq-tab--active' : ''}`}
              onClick={() => setFaqFilter('intelligence')}
            >
              OCR & Intelligence
            </button>
            <button
              type="button"
              className={`dv-lp-faq-tab ${faqFilter === 'session' ? 'dv-lp-faq-tab--active' : ''}`}
              onClick={() => setFaqFilter('session')}
            >
              Session Defense
            </button>
          </div>

          {/* Interactive Accordion */}
          <div className="dv-lp-accordion">
            {filteredFaqs.map((faq) => {
              const Icon = faq.icon;
              const isOpen = openFaq === faq.id;

              return (
                <div 
                  key={faq.id} 
                  className={`dv-lp-accordion-item ${isOpen ? 'dv-lp-accordion-item--open' : ''}`}
                >
                  <button
                    type="button"
                    className="dv-lp-accordion-trigger"
                    onClick={() => toggleFaq(faq.id)}
                    aria-expanded={isOpen}
                  >
                    <div className="dv-lp-accordion-left">
                      <div className="dv-lp-accordion-icon">
                        <Icon size={18} />
                      </div>
                      <div className="dv-lp-accordion-heading">
                        <span className="dv-lp-accordion-tag">{faq.tag}</span>
                        <h4 className="dv-lp-accordion-question">{faq.question}</h4>
                      </div>
                    </div>

                    <div className={`dv-lp-accordion-chevron ${isOpen ? 'dv-lp-accordion-chevron--rotated' : ''}`}>
                      <ChevronDown size={18} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="dv-lp-accordion-content">
                      <p>{faq.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Still have questions? Help Card */}
          <div className="dv-lp-faq-footer-card">
            <div className="dv-lp-faq-footer-left">
              <div className="dv-lp-faq-footer-icon">
                <HelpCircle size={22} />
              </div>
              <div>
                <h5>Still have technical questions?</h5>
                <p>Our security engineers are available to review implementation specs and privacy guarantees.</p>
              </div>
            </div>
            <a href="mailto:security@docvault.local" className="dv-lp-faq-footer-btn">
              <Mail size={15} />
              <span>Contact Security Team</span>
            </a>
          </div>
        </div>
      </section>

      {/* 7. CONVERSION BANNER */}
      <section className="dv-lp-cta-banner">
        <div className="dv-lp-container">
          <div className="dv-lp-banner-inner">
            <h2 className="dv-lp-banner-title">
              Take sovereign control of your documents today.
            </h2>
            <p className="dv-lp-banner-sub">
              Join thousands who trust DocVault to protect, organize, and understand life's critical paperwork.
            </p>
            <div className="dv-lp-banner-actions">
              <Link to="/register" className="dv-lp-btn-primary dv-lp-btn-banner">
                <span>Get Started Free</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
