import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import AuthBrandPanel from './AuthBrandPanel';
import DocVaultLogo from '../../../components/common/DocVaultLogo/DocVaultLogo';
import './AuthLayout.css';

export default function AuthLayout({ 
  children, 
  showBrandPanel = true,
  brandVariant = 'login',
  customTitle,
  customSubtitle,
  customImage,
  cardClassName = ''
}) {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'light');

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('docvault_theme', next);
    setTheme(next);
  };

  return (
    <div className="dv-auth-split-layout">
      {/* 48% Left 3D Editorial Panel (Desktop) */}
      {showBrandPanel && (
        <AuthBrandPanel 
          variant={brandVariant}
          customTitle={customTitle}
          customSubtitle={customSubtitle}
          customImage={customImage}
        />
      )}

      {/* 52% Right Form Panel */}
      <main className="dv-auth-form-panel">
        <div className="dv-auth-top-bar">
          {/* Mobile-only brand logo */}
          <div className="dv-auth-mobile-logo">
            <Link to="/" title="Return to DocVault Home">
              <DocVaultLogo height={32} />
            </Link>
          </div>

          {/* Theme switcher */}
          <button
            type="button"
            className="dv-auth-theme-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun size={17} color="#FBBF24" />
            ) : (
              <Moon size={17} color="#1C1310" />
            )}
          </button>
        </div>

        <div className="dv-auth-form-viewport">
          <div className={`dv-auth-form-card ${cardClassName}`}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
