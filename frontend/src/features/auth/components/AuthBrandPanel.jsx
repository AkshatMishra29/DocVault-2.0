import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Cpu, Calendar, Lock, CheckCircle2 } from 'lucide-react';
import DocVaultLogo from '../../../components/common/DocVaultLogo/DocVaultLogo';
import './AuthBrandPanel.css';

const BENEFITS = [
  {
    icon: ShieldCheck,
    title: "Privacy-First Document Custody",
    desc: "Two-stage cryptographic protection with sensitive-ID isolation."
  },
  {
    icon: Cpu,
    title: "Intelligent Document Extraction",
    desc: "Multi-tier OCR and bounded RAG strictly grounded in your files."
  },
  {
    icon: Calendar,
    title: "Verified Deadlines & Reminders",
    desc: "Automated countdowns for policy renewals and warranty expirations."
  }
];

export default function AuthBrandPanel() {
  return (
    <aside className="dv-auth-brand-panel" aria-label="DocVault Brand Highlights">
      {/* Background Architectural Grid & Ambient Gradient Lighting */}
      <div className="dv-brand-mesh-bg" />
      <div className="dv-brand-radial-glow" />

      {/* Top Brand Logo */}
      <div className="dv-brand-header">
        <Link to="/" className="dv-brand-logo-link" title="Return to DocVault Home">
          <DocVaultLogo height={38} variant="light" />
        </Link>
      </div>

      {/* Center Cinematic 3D Security Shield & Vault Artwork */}
      <div className="dv-brand-visual-container">
        <div className="dv-shield-monolith">
          <div className="dv-shield-aura" />
          <svg
            className="dv-shield-svg"
            viewBox="0 0 320 300"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="shieldEmeraldGradLeft" x1="160" y1="20" x2="60" y2="260" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#059669" />
                <stop offset="45%" stopColor="#015A47" />
                <stop offset="100%" stopColor="#064E3B" />
              </linearGradient>

              <linearGradient id="shieldEmeraldGradRight" x1="160" y1="20" x2="260" y2="260" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#015A47" />
                <stop offset="55%" stopColor="#064E3B" />
                <stop offset="100%" stopColor="#022C22" />
              </linearGradient>

              <linearGradient id="shieldFacetHighlight" x1="80" y1="40" x2="160" y2="260" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#34D399" stopOpacity="0.6" />
                <stop offset="50%" stopColor="#10B981" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#015A47" stopOpacity="0" />
              </linearGradient>

              <linearGradient id="lockCoreGrad" x1="130" y1="110" x2="190" y2="190" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#34D399" />
                <stop offset="60%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>

              <filter id="shieldMasterShadow" x="-25%" y="-20%" width="150%" height="150%">
                <feDropShadow dx="0" dy="16" stdDeviation="24" floodColor="#01241C" floodOpacity="0.9" />
                <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000000" floodOpacity="0.4" />
              </filter>
            </defs>

            <g filter="url(#shieldMasterShadow)">
              {/* Outer Shield Bevel Left */}
              <path d="M160 20L60 64V150C60 216 104 262 160 278V20Z" fill="url(#shieldEmeraldGradLeft)" />
              {/* Outer Shield Bevel Right */}
              <path d="M160 20L260 64V150C260 216 216 262 160 278V20Z" fill="url(#shieldEmeraldGradRight)" />
              {/* Light Reflection Facet */}
              <path d="M160 22L64 65V148C64 195 95 240 160 274V22Z" fill="url(#shieldFacetHighlight)" />
              {/* Inner Inset Recess */}
              <path d="M160 40L80 76V148C80 200 116 242 160 258C204 242 240 200 240 148V76L160 40Z" fill="#031F19" fillOpacity="0.85" />
              {/* Center Seam */}
              <path d="M160 40V258" stroke="rgba(52, 211, 153, 0.3)" strokeWidth="1.5" />

              {/* Floating Vault Lock Shackle */}
              <path
                d="M136 130V108C136 94.7 146.7 84 160 84C173.3 84 184 94.7 184 108V130"
                stroke="url(#lockCoreGrad)"
                strokeWidth="8"
                strokeLinecap="round"
                fill="none"
              />
              {/* Vault Lock Body */}
              <rect x="122" y="126" width="76" height="60" rx="14" fill="url(#lockCoreGrad)" />
              {/* Lock Core Keyhole */}
              <circle cx="160" cy="150" r="5" fill="#022C22" />
              <path d="M157.5 153L156 168H164L162.5 153H157.5Z" fill="#022C22" />
            </g>
          </svg>
        </div>

        {/* Narrative Headline */}
        <div className="dv-brand-narrative">
          <div className="dv-brand-pill">
            <span className="dv-brand-pill-dot" />
            <span>Sovereign Document Custody</span>
          </div>
          <h2 className="dv-brand-title">
            Your documents.<br />
            <span className="dv-brand-title-accent">Your control.</span>
          </h2>
          <p className="dv-brand-tagline">
            One secure place for everything that matters.
          </p>
        </div>

        {/* 3 Product Benefits */}
        <div className="dv-brand-benefits">
          {BENEFITS.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div key={idx} className="dv-benefit-row">
                <div className="dv-benefit-icon-box">
                  <Icon size={16} />
                </div>
                <div className="dv-benefit-text">
                  <h4 className="dv-benefit-title">{item.title}</h4>
                  <p className="dv-benefit-desc">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Minimalist Security Guarantee & Copyright */}
      <div className="dv-brand-footer">
        <span>© {new Date().getFullYear()} DocVault Technologies Inc.</span>
        <span className="dv-brand-footer-dot">•</span>
        <span>Zero-Knowledge Architecture</span>
      </div>
    </aside>
  );
}
