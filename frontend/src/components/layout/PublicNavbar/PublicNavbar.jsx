import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DocVaultLogo from '../../common/DocVaultLogo/DocVaultLogo';
import { ArrowRight, Lock, LayoutDashboard, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../../features/auth/context/AuthContext';
import './PublicNavbar.css';

export default function PublicNavbar() {
  const { user, isVaultUnlocked, lockVault } = useAuth();
  const navigate = useNavigate();

  const handleManualLock = () => {
    lockVault();
    navigate('/enter-pin', { state: { email: user?.email } });
  };

  return (
    <header className="dv-public-nav">
      <div className="dv-public-nav__container">
        {/* Brand Logo */}
        <Link to="/" className="dv-public-nav__logo" title="DocVault - Home">
          <DocVaultLogo height={48} />
        </Link>

        {/* Navigation Links */}
        <nav className="dv-public-nav__links" aria-label="Main Navigation">
          <a href="#features" className="dv-public-nav__link">
            <span>Features</span>
          </a>
          <a href="#intelligence" className="dv-public-nav__link">
            <span>Intelligence</span>
          </a>
          <a href="#how-it-works" className="dv-public-nav__link">
            <span>How It Works</span>
          </a>
          <a href="#security" className="dv-public-nav__link">
            <span>Security</span>
          </a>
          <a href="#faq" className="dv-public-nav__link">
            <span>FAQ</span>
          </a>
        </nav>

        {/* Action Controls & Live Security Badge */}
        <div className="dv-public-nav__actions">
          <div className="dv-public-nav__security-pill" title="End-to-End Cryptographic Protection Active">
            <span className="dv-nav-pulse-dot" />
            <ShieldCheck size={14} className="dv-nav-shield-icon" />
            <span>256-Bit Vault</span>
          </div>

          {user && isVaultUnlocked ? (
            <>
              <button
                type="button"
                onClick={handleManualLock}
                className="dv-public-nav__btn-lock"
                title="Lock your vault session immediately"
              >
                <Lock size={14} />
                <span>Lock Vault</span>
              </button>

              <Link to="/dashboard" className="dv-public-nav__btn-primary">
                <LayoutDashboard size={15} />
                <span>Open Dashboard</span>
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="dv-public-nav__login">
                Sign in
              </Link>
              <Link to="/register" className="dv-public-nav__btn-primary">
                <span>Get Started</span>
                <ArrowRight size={15} />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
