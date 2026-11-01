import React from 'react';
import './AuthHeader.css';

export default function AuthHeader({ title, subtitle, badgeText }) {
  return (
    <div className="dv-auth-header">
      {badgeText && (
        <div className="dv-auth-header__badge">
          <span className="dv-auth-header__badge-dot" />
          <span>{badgeText}</span>
        </div>
      )}
      <h1 className="dv-auth-header__title">{title}</h1>
      {subtitle && <p className="dv-auth-header__subtitle">{subtitle}</p>}
    </div>
  );
}

