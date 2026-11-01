import React from 'react';
import { 
  Shield, 
  UserCheck, 
  Tv, 
  Home, 
  HeartPulse, 
  FileText, 
  FileSpreadsheet, 
  FileCode, 
  Lock 
} from 'lucide-react';
import './DocumentTypeIcon.css';

export default function DocumentTypeIcon({ category = 'Other', format = 'PDF', size = 18, isStorageOnly = false }) {
  if (isStorageOnly) {
    return (
      <div className="dv-type-icon dv-type-icon--storage-only" title="Storage Only / Sensitive ID">
        <Lock size={size} />
      </div>
    );
  }

  const catLower = (category || '').toLowerCase();

  let Icon = FileText;
  let variant = 'default';

  if (catLower.includes('insurance')) {
    Icon = Shield;
    variant = 'emerald';
  } else if (catLower.includes('identity')) {
    Icon = UserCheck;
    variant = 'blue';
  } else if (catLower.includes('appliance') || catLower.includes('electronic')) {
    Icon = Tv;
    variant = 'amber';
  } else if (catLower.includes('property') || catLower.includes('estate') || catLower.includes('vehicle')) {
    Icon = Home;
    variant = 'purple';
  } else if (catLower.includes('medical') || catLower.includes('health')) {
    Icon = HeartPulse;
    variant = 'ruby';
  }

  return (
    <div className={`dv-type-icon dv-type-icon--${variant}`} title={`${category} (${format})`}>
      <Icon size={size} />
    </div>
  );
}

