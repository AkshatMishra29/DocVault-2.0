import React from 'react';
import DocVaultLogoImg from '../../../assets/DocVault Logo.png';
import './DocVaultLogo.css';

export function DocVaultLogoIcon({ size = 36, className = "" }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 48 48" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`dv-brand-logo__svg ${className}`}
      aria-hidden="true"
    >
      <defs>
        {/* Obsidian & Espresso Vault Tile */}
        <linearGradient id="dvVaultTileGrad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2E1D17" />
          <stop offset="50%" stopColor="#1C110D" />
          <stop offset="100%" stopColor="#120A07" />
        </linearGradient>

        {/* Dynamic Beveled Sunset Rim */}
        <linearGradient id="dvTileBorderGrad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FD2B06" stopOpacity="0.8" />
          <stop offset="35%" stopColor="#EB6C3B" stopOpacity="0.4" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0.12)" />
        </linearGradient>

        {/* Vault Dial Track Gradient */}
        <linearGradient id="dvRingSunset" x1="12" y1="12" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FD2B06" />
          <stop offset="50%" stopColor="#EB6C3B" />
          <stop offset="100%" stopColor="#FFA07A" />
        </linearGradient>

        {/* Holographic Document Foil */}
        <linearGradient id="dvDocGrad" x1="16" y1="12" x2="32" y2="35" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(253, 43, 6, 0.28)" />
          <stop offset="100%" stopColor="rgba(235, 108, 59, 0.06)" />
        </linearGradient>

        {/* Precision Core Node */}
        <radialGradient id="dvEmberCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="35%" stopColor="#FFA380" />
          <stop offset="75%" stopColor="#FD2B06" />
          <stop offset="100%" stopColor="#C42003" />
        </radialGradient>

        {/* Ambient Ember Glow Filter */}
        <filter id="dvLogoDropShadow" x="0" y="2" width="48" height="46" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="3" stdDeviation="3.5" floodColor="#1C110D" floodOpacity="0.4" />
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#FD2B06" floodOpacity="0.25" />
        </filter>
      </defs>

      <g filter="url(#dvLogoDropShadow)">
        {/* Base Squircle Vault Chamber */}
        <rect x="3" y="3" width="42" height="42" rx="12" fill="url(#dvVaultTileGrad)" />
        <rect x="3.5" y="3.5" width="41" height="41" rx="11.5" stroke="url(#dvTileBorderGrad)" strokeWidth="1.2" />

        {/* Outer Calibrated Dial Ring */}
        <circle 
          cx="24" 
          cy="24" 
          r="14.5" 
          stroke="url(#dvRingSunset)" 
          strokeWidth="1.8" 
          strokeDasharray="4 2.5" 
          strokeOpacity="0.75"
        />

        {/* Dimensional Document Silhouette (Folded Origami Geometry) */}
        <path 
          d="M17 14C17 13.1716 17.6716 12.5 18.5 12.5H25.5L31 18V32.5C31 33.3284 30.3284 34 29.5 34H18.5C17.6716 34 17 33.3284 17 32.5V14Z" 
          fill="url(#dvDocGrad)" 
          stroke="#EB6C3B" 
          strokeWidth="1.3" 
          strokeOpacity="0.75"
        />
        {/* Precision Folded Document Flap */}
        <path 
          d="M25.5 12.5V18H31" 
          fill="none" 
          stroke="#FFA380" 
          strokeWidth="1.3" 
          strokeLinejoin="round" 
        />

        {/* Central Luminous Cryptographic Aperture / Vault Lock Wheel */}
        <circle cx="24" cy="24" r="5.5" fill="url(#dvEmberCore)" stroke="#FFFFFF" strokeWidth="1" strokeOpacity="0.9" />
        <circle cx="24" cy="24" r="2" fill="#1C110D" />

        {/* Cardinal Caliper Ticks (Laser Alignment Nodes) */}
        <line x1="24" y1="12" x2="24" y2="14.5" stroke="#FD2B06" strokeWidth="2" strokeLinecap="round" />
        <line x1="24" y1="33.5" x2="24" y2="36" stroke="#FD2B06" strokeWidth="2" strokeLinecap="round" />
        <line x1="12" y1="24" x2="14.5" y2="24" stroke="#FD2B06" strokeWidth="2" strokeLinecap="round" />
        <line x1="33.5" y1="24" x2="36" y2="24" stroke="#FD2B06" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export default function DocVaultLogo({ 
  height = 50, 
  variant = 'default', // 'default' (dark text), 'light' (white text), 'icon-only'
  className = '',
  useImage = true
}) {
  if (variant === 'icon-only') {
    return (
      <div className={`dv-brand-logo dv-brand-logo--icon-only ${className}`}>
        <DocVaultLogoIcon size={height} />
      </div>
    );
  }

  return (
    <div className={`dv-brand-logo dv-brand-logo--${variant} ${className}`}>
      {useImage ? (
        <img 
          src={DocVaultLogoImg} 
          alt="DocVault - Secure • Organize • Access" 
          style={{ height: `${height}px`, width: 'auto' }}
          className="dv-brand-logo__img" 
        />
      ) : (
        <>
          <DocVaultLogoIcon size={height} />
          <span className="dv-brand-logo__text" style={{ fontSize: `${Math.round(height * 0.52)}px` }}>
            Doc<span className="dv-brand-logo__accent">Vault</span>
          </span>
        </>
      )}
    </div>
  );
}
