import React from 'react';
import { Link } from 'react-router-dom';
import DocVaultLogo from '../../common/DocVaultLogo/DocVaultLogo';
import { 
  ShieldCheck, Lock, Globe, Mail, MessageSquare, 
  GitBranch, ArrowUpRight, CheckCircle2 
} from 'lucide-react';
import './PublicFooter.css';

export default function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="dv-public-footer">
      <div className="dv-public-footer__container">
        {/* Brand & Security Column */}
        <div className="dv-public-footer__brand-col">
          <Link to="/" className="dv-public-footer__logo-wrap" title="DocVault">
            <DocVaultLogo height={46} />
          </Link>

          <p className="dv-public-footer__desc">
            Sovereign personal document vault. End-to-end encrypted storage, automated OCR extraction, and grounded AI intelligence for life's essential paperwork.
          </p>

          <div className="dv-public-footer__security-strip">
            <div className="dv-footer-badge">
              <ShieldCheck size={14} className="dv-footer-badge__icon" />
              <span>AES-256 Multi-Tier</span>
            </div>
            <div className="dv-footer-badge">
              <Lock size={13} className="dv-footer-badge__icon" />
              <span>Hardware PIN Lock</span>
            </div>
          </div>
        </div>

        {/* Structured Navigation Grid */}
        <div className="dv-public-footer__nav-grid">
          {/* Column 1: Platform */}
          <div className="dv-public-footer__col">
            <h4 className="dv-footer-col-title">Platform</h4>
            <ul className="dv-footer-links">
              <li>
                <a href="#features">
                  <span>Document Vault</span>
                </a>
              </li>
              <li>
                <a href="#intelligence">
                  <span>Grounded AI Copilot</span>
                </a>
              </li>
              <li>
                <a href="#features">
                  <span>Automated OCR</span>
                </a>
              </li>
              <li>
                <a href="#features">
                  <span>Expiry & Renewal Guard</span>
                </a>
              </li>
              <li>
                <a href="#features">
                  <span>Asset & Deed Registry</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Column 2: Security */}
          <div className="dv-public-footer__col">
            <h4 className="dv-footer-col-title">Security</h4>
            <ul className="dv-footer-links">
              <li>
                <a href="#security">
                  <span>Two-Tier PIN Defense</span>
                </a>
              </li>
              <li>
                <a href="#security">
                  <span>Hardware WebAuthn</span>
                </a>
              </li>
              <li>
                <a href="#security">
                  <span>Privacy Policy Gate</span>
                </a>
              </li>
              <li>
                <a href="#security">
                  <span>Anti-Tamper Lockout</span>
                </a>
              </li>
              <li>
                <a href="#security">
                  <span>Audit Trail Logging</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Resources */}
          <div className="dv-public-footer__col">
            <h4 className="dv-footer-col-title">Resources</h4>
            <ul className="dv-footer-links">
              <li>
                <a href="#how-it-works">
                  <span>How It Works</span>
                </a>
              </li>
              <li>
                <a href="#faq">
                  <span>Frequently Asked Questions</span>
                </a>
              </li>
              <li>
                <Link to="/login">
                  <span>Sign In</span>
                </Link>
              </li>
              <li>
                <Link to="/register">
                  <span>Create Account</span>
                </Link>
              </li>
              <li>
                <span className="dv-footer-status">
                  <CheckCircle2 size={13} className="dv-footer-status__icon" />
                  <span>Systems Operational</span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Sub-Footer Bar */}
      <div className="dv-public-footer__bottom">
        <div className="dv-public-footer__bottom-inner">
          <div className="dv-public-footer__copyright">
            <p>© {currentYear} DocVault Inc. All rights reserved.</p>
            <span className="dv-footer-sep">•</span>
            <p>Designed for sovereign document custody.</p>
          </div>

          {/* Lucide-Only Connect / Channel Icons */}
          <div className="dv-public-footer__social-links">
            <a 
              href="https://github.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="dv-footer-social-btn" 
              title="Repository Architecture (GitBranch)"
              aria-label="Repository Architecture"
            >
              <GitBranch size={16} />
            </a>

            <a 
              href="mailto:security@docvault.local" 
              className="dv-footer-social-btn" 
              title="Security Dispatch (Mail)"
              aria-label="Contact Security"
            >
              <Mail size={16} />
            </a>

            <a 
              href="#faq" 
              className="dv-footer-social-btn" 
              title="Community & Help (MessageSquare)"
              aria-label="Community & Help"
            >
              <MessageSquare size={16} />
            </a>

            <a 
              href="/" 
              className="dv-footer-social-btn" 
              title="Global Network (Globe)"
              aria-label="Global Network"
            >
              <Globe size={16} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
