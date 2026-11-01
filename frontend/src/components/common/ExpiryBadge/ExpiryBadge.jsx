import React from 'react';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import './ExpiryBadge.css';

export default function ExpiryBadge({ expiryDate, daysLeft, size = 'sm' }) {
  let calculatedDays = daysLeft;
  
  if (calculatedDays === undefined && expiryDate) {
    const target = new Date(expiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    calculatedDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  }

  if (calculatedDays === undefined || isNaN(calculatedDays)) {
    return (
      <span className={`dv-expiry-badge dv-expiry-badge--neutral dv-expiry-badge--${size}`}>
        <Clock size={size === 'sm' ? 12 : 14} />
        <span>Tracked</span>
      </span>
    );
  }

  if (calculatedDays < 0) {
    return (
      <span className={`dv-expiry-badge dv-expiry-badge--expired dv-expiry-badge--${size}`}>
        <AlertTriangle size={size === 'sm' ? 12 : 14} />
        <span>Expired ({Math.abs(calculatedDays)}d ago)</span>
      </span>
    );
  }

  if (calculatedDays <= 15) {
    return (
      <span className={`dv-expiry-badge dv-expiry-badge--urgent dv-expiry-badge--${size}`}>
        <AlertTriangle size={size === 'sm' ? 12 : 14} />
        <span>{calculatedDays === 0 ? 'Expires today' : `${calculatedDays}d left`}</span>
      </span>
    );
  }

  if (calculatedDays <= 45) {
    return (
      <span className={`dv-expiry-badge dv-expiry-badge--warning dv-expiry-badge--${size}`}>
        <Clock size={size === 'sm' ? 12 : 14} />
        <span>{calculatedDays}d left</span>
      </span>
    );
  }

  return (
    <span className={`dv-expiry-badge dv-expiry-badge--normal dv-expiry-badge--${size}`}>
      <CheckCircle2 size={size === 'sm' ? 12 : 14} />
      <span>{calculatedDays}d left</span>
    </span>
  );
}

