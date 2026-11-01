import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import './AuthAlert.css';

export default function AuthAlert({ type = 'error', message, className = '' }) {
  if (!message) return null;

  const Icon = type === 'success' ? CheckCircle2 : type === 'info' ? Info : AlertCircle;

  return (
    <div className={`dv-auth-alert dv-auth-alert--${type} ${className}`} role="alert">
      <Icon size={16} className="dv-auth-alert__icon" />
      <span className="dv-auth-alert__text">{message}</span>
    </div>
  );
}
