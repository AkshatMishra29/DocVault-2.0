import React from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../../app/theme';
import AuthBrandPanel from './AuthBrandPanel';
import DocVaultLogo from '../../../components/common/DocVaultLogo/DocVaultLogo';
import './AuthLayout.css';
import '../pages/Auth.css';

export default function AuthLayout({ 
  children, 
  showBrandPanel = true,
  brandVariant = 'login',
  customTitle,
  customSubtitle,
  customImage,
  cardClassName = ''
}) {
  const { resolvedTheme, toggleTheme } = useTheme();

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
              <DocVaultLogo height={38} />
            </Link>
          </div>

          {/* Theme Switcher Action (Light / Dark) */}
          <div className="dv-auth-theme-action">
            <button
              type="button"
              className="dv-auth-theme-btn"
              onClick={toggleTheme}
              title={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {resolvedTheme === 'dark' ? (
                <>
                  <Sun size={15} className="dv-auth-theme-icon dv-auth-theme-icon--sun" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon size={15} className="dv-auth-theme-icon dv-auth-theme-icon--moon" />
                  <span>Dark Mode</span>
                </>
              )}
            </button>
          </div>
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
