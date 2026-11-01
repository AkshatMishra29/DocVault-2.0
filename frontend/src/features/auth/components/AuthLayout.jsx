import React from 'react';
import { Link } from 'react-router-dom';
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
              <DocVaultLogo height={44} />
            </Link>
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
