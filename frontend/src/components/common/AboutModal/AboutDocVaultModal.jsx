import React from 'react';
import { 
  ShieldCheck, Lock, Cpu, Sparkles, FileText, 
  CheckCircle2, ArrowRight, X, ExternalLink, HelpCircle
} from 'lucide-react';
import heroArtwork from '../../../assets/hero-landing.jpg';
import './AboutDocVaultModal.css';

export default function AboutDocVaultModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="dv-about-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div 
        className="dv-about-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dv-about-sheet__handle" />

        <div className="dv-about-header">
          <div className="dv-about-header__branding">
            <div className="dv-about-logo-badge">
              <ShieldCheck size={22} color="#FD2B06" />
            </div>
            <div>
              <h3 className="dv-about-title">About DocVault</h3>
              <p className="dv-about-subtitle">Intelligent Document Custody & Sovereign Privacy</p>
            </div>
          </div>
          <button className="dv-about-close-btn" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>

        <div className="dv-about-body">
          {/* Visual Showcase Card */}
          <div className="dv-about-hero-card">
            <img src={heroArtwork} alt="DocVault Safe" className="dv-about-hero-img" />
            <div className="dv-about-hero-scrim">
              <span className="dv-about-hero-tag">DocVault v2.6 Core</span>
              <h4 className="dv-about-hero-heading">Where high security meets actionable intelligence.</h4>
            </div>
          </div>

          {/* Mission Statement */}
          <p className="dv-about-intro">
            DocVault was engineered to resolve a critical security paradox: storing personal warranties,
            insurance policies, and tax documents securely without handing unencrypted custody or AI training
            rights to third-party cloud aggregators.
          </p>

          {/* Core Pillars */}
          <div className="dv-about-pillars">
            <div className="dv-about-pillar-item">
              <div className="dv-about-pillar-icon dv-about-pillar-icon--orange">
                <Lock size={18} />
              </div>
              <div className="dv-about-pillar-info">
                <h5>Two-Tier PIN Isolation</h5>
                <p>Master account authentication paired with personal 4 or 6-digit PIN vault encryption. Document payload stays locked until PIN verification.</p>
              </div>
            </div>

            <div className="dv-about-pillar-item">
              <div className="dv-about-pillar-icon dv-about-pillar-icon--blue">
                <Cpu size={18} />
              </div>
              <div className="dv-about-pillar-info">
                <h5>Deterministic OCR Engine</h5>
                <p>Sharp-conditioned multi-page PDF & image text extraction. Grounded extraction validates invoice totals, Indian GSTINs, and expiry schedules.</p>
              </div>
            </div>

            <div className="dv-about-pillar-item">
              <div className="dv-about-pillar-icon dv-about-pillar-icon--green">
                <ShieldCheck size={18} />
              </div>
              <div className="dv-about-pillar-info">
                <h5>Strict Privacy Policy Gate</h5>
                <p>Sensitive Indian National IDs (Aadhaar, PAN) are recognized upon ingestion and restricted to STORAGE_ONLY custody.</p>
              </div>
            </div>

            <div className="dv-about-pillar-item">
              <div className="dv-about-pillar-icon dv-about-pillar-icon--purple">
                <Sparkles size={18} />
              </div>
              <div className="dv-about-pillar-info">
                <h5>Grounded Vault Copilot</h5>
                <p>Ask questions about renewal deadlines, policy inclusions, and warranty terms with answers strictly grounded in your documents.</p>
              </div>
            </div>
          </div>

          {/* Trust Guarantees */}
          <div className="dv-about-trust-bar">
            <div className="dv-about-trust-chip">
              <CheckCircle2 size={13} color="#16A34A" />
              <span>Encrypted Vault Protection</span>
            </div>
            <div className="dv-about-trust-chip">
              <CheckCircle2 size={13} color="#16A34A" />
              <span>Zero Ad Tracking</span>
            </div>
            <div className="dv-about-trust-chip">
              <CheckCircle2 size={13} color="#16A34A" />
              <span>Tamper-Evident Audit</span>
            </div>
          </div>
        </div>

        <div className="dv-about-footer">
          <button type="button" className="dv-about-cta-btn" onClick={onClose}>
            <span>Got it, back to secure custody</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

