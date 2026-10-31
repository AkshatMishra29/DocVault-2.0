import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import DocVaultLogo from '../../common/DocVaultLogo/DocVaultLogo';
import { ArrowRight, Sun, Moon, Lock, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../../features/auth/context/AuthContext';
import './PublicNavbar.css';

export default function PublicNavbar() {
  const { user, isVaultUnlocked, lockVault } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('docvault_theme', next);
    setTheme(next);
  };

  const handleManualLock = () => {
    lockVault();
    navigate('/enter-pin', { state: { email: user?.email } });
  };

  return (
    <header className="dv-public-nav">
      <div className="dv-public-nav__container">
        <Link to="/" className="dv-public-nav__logo">
          <DocVaultLogo height={44} />
        </Link>

        <nav className="dv-public-nav__links">
          <a href="#features" className="dv-public-nav__link">Features</a>
          <a href="#how-it-works" className="dv-public-nav__link">How It Works</a>
          <a href="#security" className="dv-public-nav__link">Security</a>
          <a href="#faq" className="dv-public-nav__link">FAQ</a>
        </nav>

        <div className="dv-public-nav__actions">
          {/* Theme Switcher Button */}
          <button
            type="button"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: 'var(--color-surface, #ffffff)',
              border: '1px solid var(--color-border, #e2e8f0)',
              color: 'var(--color-text-primary, #0f172a)',
              cursor: 'pointer',
              marginRight: '8px',
              transition: 'all 0.2s ease',
            }}
          >
            {theme === 'dark' ? <Sun size={18} color="#fbbf24" /> : <Moon size={18} color="#0f172a" />}
          </button>

          {user && isVaultUnlocked ? (
            <>
              <button
                type="button"
                onClick={handleManualLock}
                title="Lock your vault session now"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  marginRight: '8px'
                }}
              >
                <Lock size={14} />
                <span>Lock Vault</span>
              </button>

              <Link to="/dashboard" className="dv-public-nav__btn-primary">
                <LayoutDashboard size={15} />
                <span>Open Vault</span>
              </Link>
            </>
          ) : (
            <>
              <Link to="/login" className="dv-public-nav__login">
                Login
              </Link>
              <Link to="/register" className="dv-public-nav__btn-primary">
                <span>Get Started</span>
                <ArrowRight size={16} />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
