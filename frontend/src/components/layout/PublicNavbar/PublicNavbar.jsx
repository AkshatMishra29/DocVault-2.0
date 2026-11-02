import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import DocVaultLogo from '../../common/DocVaultLogo/DocVaultLogo';
import { 
  ArrowRight, Lock, LayoutDashboard, ShieldCheck, 
  Menu, X, Sparkles 
} from 'lucide-react';
import { useAuth } from '../../../features/auth/context/AuthContext';
import './PublicNavbar.css';

export default function PublicNavbar() {
  const { user, isVaultUnlocked, lockVault } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Monitor scroll for dynamic header elevation
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile drawer on route / hash change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  const handleManualLock = () => {
    lockVault();
    navigate('/enter-pin', { state: { email: user?.email } });
  };

  return (
    <header className={`dv-public-navbar ${scrolled ? 'dv-public-navbar--scrolled' : ''}`} role="banner">
      <div className="dv-public-navbar__inner">
        {/* Brand Identity */}
        <Link to="/" className="dv-nav-brand" title="DocVault - Sovereign Document Vault">
          <DocVaultLogo height={42} />
        </Link>

        {/* Center Desktop Navigation */}
        <nav className="dv-nav-menu" aria-label="Primary Navigation">
          <a href="#features" className="dv-nav-link">
            <span>Features</span>
          </a>
          <a href="#intelligence" className="dv-nav-link">
            <span>Intelligence</span>
          </a>
          <a href="#how-it-works" className="dv-nav-link">
            <span>How It Works</span>
          </a>
          <a href="#security" className="dv-nav-link">
            <span>Security</span>
          </a>
          <a href="#faq" className="dv-nav-link">
            <span>FAQ</span>
          </a>
        </nav>

        {/* Right Actions */}
        <div className="dv-nav-actions">
          {user && isVaultUnlocked ? (
            <div className="dv-nav-user-actions">
              <button
                type="button"
                onClick={handleManualLock}
                className="dv-nav-btn-lock"
                title="Lock vault session immediately"
              >
                <Lock size={14} />
                <span>Lock Vault</span>
              </button>

              <Link to="/dashboard" className="dv-nav-btn-primary">
                <LayoutDashboard size={14} />
                <span>Dashboard</span>
              </Link>
            </div>
          ) : (
            <div className="dv-nav-auth-actions">
              <Link to="/login" className="dv-nav-btn-ghost">
                Sign In
              </Link>

              <Link to="/register" className="dv-nav-btn-primary">
                <span>Get Started</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          )}

          {/* Mobile Hamburger Toggle Button */}
          <button
            type="button"
            className="dv-nav-mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Dropdown Sheet */}
      {mobileMenuOpen && (
        <div className="dv-nav-mobile-sheet">
          <nav className="dv-nav-mobile-links">
            <a 
              href="#features" 
              className="dv-nav-mobile-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span>Features</span>
            </a>
            <a 
              href="#intelligence" 
              className="dv-nav-mobile-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span>Intelligence</span>
            </a>
            <a 
              href="#how-it-works" 
              className="dv-nav-mobile-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span>How It Works</span>
            </a>
            <a 
              href="#security" 
              className="dv-nav-mobile-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span>Security</span>
            </a>
            <a 
              href="#faq" 
              className="dv-nav-mobile-link"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span>FAQ</span>
            </a>
          </nav>

          <div className="dv-nav-mobile-footer">
            {user && isVaultUnlocked ? (
              <div className="dv-nav-mobile-cta-group">
                <button
                  type="button"
                  onClick={() => {
                    handleManualLock();
                    setMobileMenuOpen(false);
                  }}
                  className="dv-nav-btn-lock dv-nav-btn-lock--full"
                >
                  <Lock size={14} />
                  <span>Lock Vault</span>
                </button>
                <Link 
                  to="/dashboard" 
                  className="dv-nav-btn-primary dv-nav-btn-primary--full"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <LayoutDashboard size={15} />
                  <span>Open Dashboard</span>
                </Link>
              </div>
            ) : (
              <div className="dv-nav-mobile-cta-group">
                <Link 
                  to="/login" 
                  className="dv-nav-btn-ghost dv-nav-btn-ghost--full"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
                <Link 
                  to="/register" 
                  className="dv-nav-btn-primary dv-nav-btn-primary--full"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span>Create Account</span>
                  <ArrowRight size={15} />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
