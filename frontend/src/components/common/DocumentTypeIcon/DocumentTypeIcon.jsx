import React from 'react';
import {
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  Shield,
  ShieldCheck,
  UserCheck,
  Receipt,
  Award,
  HeartPulse,
  Home,
  Car,
  Tv,
  Lock,
  File,
} from 'lucide-react';
import './DocumentTypeIcon.css';

export default function DocumentTypeIcon({
  category = 'Other',
  format = 'PDF',
  size = 18,
  isStorageOnly = false,
  className = '',
}) {
  if (isStorageOnly) {
    return (
      <div className={`dv-type-icon dv-type-icon--storage-only ${className}`} title="Storage Only / Encrypted Vault">
        <Lock size={size} />
      </div>
    );
  }

  const catLower = (category || '').toLowerCase();
  const formatLower = (format || '').toLowerCase();

  let Icon = FileText;
  let variant = 'default';

  // 1. Format-specific overrides
  if (formatLower.includes('png') || formatLower.includes('jpg') || formatLower.includes('jpeg') || formatLower.includes('webp') || formatLower.includes('image')) {
    Icon = ImageIcon;
    variant = 'indigo';
  } else if (formatLower.includes('xls') || formatLower.includes('csv') || formatLower.includes('sheet')) {
    Icon = FileSpreadsheet;
    variant = 'emerald';
  }

  // 2. Category classification
  if (catLower.includes('insurance')) {
    Icon = Shield;
    variant = 'emerald';
  } else if (catLower.includes('identity') || catLower.includes('id card') || catLower.includes('aadhaar') || catLower.includes('pan') || catLower.includes('passport')) {
    Icon = UserCheck;
    variant = 'blue';
  } else if (catLower.includes('invoice') || catLower.includes('receipt') || catLower.includes('bill') || catLower.includes('tax') || catLower.includes('gst')) {
    Icon = Receipt;
    variant = 'amber';
  } else if (catLower.includes('certificate') || catLower.includes('academic') || catLower.includes('degree') || catLower.includes('diploma')) {
    Icon = Award;
    variant = 'gold';
  } else if (catLower.includes('medical') || catLower.includes('health') || catLower.includes('prescription')) {
    Icon = HeartPulse;
    variant = 'ruby';
  } else if (catLower.includes('vehicle') || catLower.includes('car') || catLower.includes('registration') || catLower.includes('rc')) {
    Icon = Car;
    variant = 'purple';
  } else if (catLower.includes('property') || catLower.includes('estate') || catLower.includes('home')) {
    Icon = Home;
    variant = 'purple';
  } else if (catLower.includes('appliance') || catLower.includes('electronic') || catLower.includes('warranty')) {
    Icon = Tv;
    variant = 'amber';
  }

  return (
    <div className={`dv-type-icon dv-type-icon--${variant} ${className}`} title={`${category} (${format})`}>
      <Icon size={size} />
    </div>
  );
}
