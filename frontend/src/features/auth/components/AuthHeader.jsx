import React from 'react';
import './AuthHeader.css';

export default function AuthHeader({ title, subtitle }) {
  return (
    <div className="dv-auth-header">
      <h1 className="dv-auth-header__title">{title}</h1>
      {subtitle && <p className="dv-auth-header__subtitle">{subtitle}</p>}
    </div>
  );
}
