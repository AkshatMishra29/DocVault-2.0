import React from 'react';
import { Link } from 'react-router-dom';
import DocVaultLogo from '../../common/DocVaultLogo/DocVaultLogo';
import { ShieldCheck, Lock, ExternalLink, CheckCircle2 } from 'lucide-react';
import './PublicFooter.css';

export default function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="dv-public-footer">
      <div className="dv-public-footer__container">
        {/* Brand Column */}
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
              <span>AES-256 Protected</span>
            </div>
            <div className="dv-footer-badge">
              <Lock size={13} className="dv-footer-badge__icon" />
              <span>Hardware PIN Lock</span>
            </div>
          </div>
        </div>

        {/* Navigation Columns */}
        <div className="dv-public-footer__nav-grid">
          {/* Column 1: Platform */}
          <div className="dv-public-footer__col">
            <h4 className="dv-footer-col-title">Platform</h4>
            <ul className="dv-footer-links">
              <li><a href="#features">Document Vault</a></li>
              <li><a href="#intelligence">Grounded AI Copilot</a></li>
              <li><a href="#features">Automated OCR</a></li>
              <li><a href="#features">Expiry & Renewal Guard</a></li>
              <li><a href="#features">Asset & Deed Registry</a></li>
            </ul>
          </div>

          {/* Column 2: Security */}
          <div className="dv-public-footer__col">
            <h4 className="dv-footer-col-title">Security</h4>
            <ul className="dv-footer-links">
              <li><a href="#security">Two-Tier PIN Defense</a></li>
              <li><a href="#security">Hardware Biometrics</a></li>
              <li><a href="#security">Client Encryption</a></li>
              <li><a href="#security">Brute-Force Lockout</a></li>
              <li><a href="#security">Security Architecture</a></li>
            </ul>
          </div>

          {/* Column 3: Resources */}
          <div className="dv-public-footer__col">
            <h4 className="dv-footer-col-title">Resources</h4>
            <ul className="dv-footer-links">
              <li><a href="#how-it-works">How It Works</a></li>
              <li><a href="#faq">Frequently Asked Questions</a></li>
              <li><Link to="/login">Sign In</Link></li>
              <li><Link to="/register">Create Account</Link></li>
              <li>
                <span className="dv-footer-status">
                  <span className="dv-footer-status__dot" />
                  <span>Systems Operational</span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Sub-Footer */}
      <div className="dv-public-footer__bottom">
        <div className="dv-public-footer__bottom-inner">
          <div className="dv-public-footer__copyright">
            <p>© {currentYear} DocVault Inc. All rights reserved.</p>
            <span className="dv-footer-sep">•</span>
            <p>Designed for sovereign document custody.</p>
          </div>

          {/* Professional SVG Social Icons */}
          <div className="dv-public-footer__social-links">
            <a 
              href="https://github.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="dv-footer-social-btn" 
              aria-label="DocVault on GitHub"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
              </svg>
            </a>

            <a 
              href="https://twitter.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="dv-footer-social-btn" 
              aria-label="DocVault on X"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>

            <a 
              href="https://linkedin.com" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="dv-footer-social-btn" 
              aria-label="DocVault on LinkedIn"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
