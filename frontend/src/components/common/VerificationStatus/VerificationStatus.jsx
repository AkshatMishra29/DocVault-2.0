import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Lock, UserCheck } from 'lucide-react';
import './VerificationStatus.css';

export default function VerificationStatus({ status = 'accepted', size = 'sm' }) {
  switch (status) {
    case 'user_corrected':
      return (
        <span className={`dv-status-pill dv-status-pill--corrected dv-status-pill--${size}`}>
          <UserCheck size={size === 'sm' ? 12 : 14} />
          <span>User Verified</span>
        </span>
      );
    case 'needs_review':
      return (
        <span className={`dv-status-pill dv-status-pill--review dv-status-pill--${size}`}>
          <AlertTriangle size={size === 'sm' ? 12 : 14} />
          <span>Needs Review</span>
        </span>
      );
    case 'rejected':
      return (
        <span className={`dv-status-pill dv-status-pill--rejected dv-status-pill--${size}`}>
          <XCircle size={size === 'sm' ? 12 : 14} />
          <span>Rejected</span>
        </span>
      );
    case 'storage_only':
      return (
        <span className={`dv-status-pill dv-status-pill--storage dv-status-pill--${size}`}>
          <Lock size={size === 'sm' ? 12 : 14} />
          <span>Storage Only</span>
        </span>
      );
    case 'accepted':
    case 'ready':
    case 'completed':
    default:
      return (
        <span className={`dv-status-pill dv-status-pill--accepted dv-status-pill--${size}`}>
          <CheckCircle2 size={size === 'sm' ? 12 : 14} />
          <span>Verified</span>
        </span>
      );
  }
}
