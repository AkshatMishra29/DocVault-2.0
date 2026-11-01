import React from 'react';
import { Link } from 'react-router-dom';
import DocVaultLogo from '../../common/DocVaultLogo/DocVaultLogo';
import './PublicFooter.css';

export default function PublicFooter() {
  return (
    <footer className="dv-public-footer">
      <div className="dv-public-footer__container">
        <div className="dv-public-footer__brand">
          <DocVaultLogo height={48} />
          <p className="dv-public-footer__tagline">
            Secure, Organize, Stay Ahead. Your sovereign intelligent personal document vault.
          </p>
        </div>

        <div className="dv-public-footer__columns">
          <div className="dv-public-footer__col">
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#security">Security</a>
            <a href="#faq">FAQ</a>
          </div>

          <div className="dv-public-footer__col">
            <h4>Company</h4>
            <a href="#about">About</a>
            <a href="#blog">Blog</a>
            <a href="#careers">Careers</a>
          </div>

          <div className="dv-public-footer__col">
            <h4>Support</h4>
            <a href="#help">Help Center</a>
            <a href="#faq">FAQ</a>
            <a href="#privacy">Privacy Policy</a>
          </div>
        </div>

        <div className="dv-public-footer__socials">
          <span style={{ fontSize: '15px', color: '#64748B', fontWeight: 700 }}>𝕏</span>
          <span style={{ fontSize: '15px', color: '#64748B', fontWeight: 700 }}>in</span>
          <span style={{ fontSize: '15px', color: '#64748B', fontWeight: 700 }}>gh</span>
        </div>
      </div>

      <div className="dv-public-footer__bottom">
        <div className="dv-public-footer__bottom-container">
          <p>© {new Date().getFullYear()} DocVault. All rights reserved.</p>
          <p className="dv-public-footer__made-with">Made with 💚 for a smarter tomorrow.</p>
        </div>
      </div>
    </footer>
  );
}
