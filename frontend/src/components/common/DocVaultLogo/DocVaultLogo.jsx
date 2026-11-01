import React from 'react';
import LogoImg from '../../../assets/logoDV.png';
import './DocVaultLogo.css';

export function DocVaultLogoIcon({ size = 36, className = "" }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 44 44" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`dv-brand-logo__svg ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="dvLogoTileGrad" x1="2" y1="2" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#01865A" />
          <stop offset="45%" stopColor="#015A47" />
          <stop offset="100%" stopColor="#052E25" />
        </linearGradient>
        <linearGradient id="dvSpokeGrad" x1="12" y1="12" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#10B981" />
        </linearGradient>
        <linearGradient id="dvCenterHub" x1="17" y1="17" x2="27" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#A7F3D0" />
        </linearGradient>
        <filter id="dvTileShadow" x="0" y="1" width="44" height="44" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#01241C" floodOpacity="0.3" />
        </filter>
      </defs>

      <g filter="url(#dvTileShadow)">
        {/* Base Squircle Vault Tile */}
        <rect x="2" y="2" width="40" height="40" rx="11" fill="url(#dvLogoTileGrad)" />
        <rect x="2" y="2" width="40" height="40" rx="11" stroke="rgba(255, 255, 255, 0.22)" strokeWidth="1" />

        {/* Embossed Folded Document Foil */}
        <path 
          d="M13 12C13 10.8954 13.8954 10 15 10H25L31 16V32C31 33.1046 30.1046 34 29 34H15C13.8954 34 13 33.1046 13 32V12Z" 
          fill="white" 
          fillOpacity="0.12" 
          stroke="white" 
          strokeOpacity="0.28" 
          strokeWidth="1.2" 
        />
        <path 
          d="M25 10V16H31" 
          fill="none" 
          stroke="white" 
          strokeOpacity="0.45" 
          strokeWidth="1.2" 
          strokeLinejoin="round" 
        />

        {/* Precision Vault Locker Wheel Track */}
        <circle cx="22" cy="22" r="7.5" stroke="url(#dvSpokeGrad)" strokeWidth="2" strokeDasharray="3.2 2" />
        <circle cx="22" cy="22" r="4.2" fill="url(#dvCenterHub)" />
        <circle cx="22" cy="22" r="1.8" fill="#013D30" />

        {/* Calibrated Directional Spokes */}
        <line x1="22" y1="11.5" x2="22" y2="13.5" stroke="#34D399" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="22" y1="30.5" x2="22" y2="32.5" stroke="#34D399" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="11.5" y1="22" x2="13.5" y2="22" stroke="#34D399" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="30.5" y1="22" x2="32.5" y2="22" stroke="#34D399" strokeWidth="1.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export default function DocVaultLogo({ 
  height = 40, 
  variant = 'default', // 'default' (dark text), 'light' (white text), 'icon-only'
  className = '',
  useImage = false
}) {
  return (
    <div className={`dv-brand-logo dv-brand-logo--${variant} ${className}`}>
      {useImage ? (
        <img 
          src={LogoImg} 
          alt="DocVault" 
          style={{ height: `${height}px`, width: 'auto' }}
          className="dv-brand-logo__img" 
        />
      ) : (
        <DocVaultLogoIcon size={height} />
      )}
      {variant !== 'icon-only' && (
        <span className="dv-brand-logo__text" style={{ fontSize: `${Math.round(height * 0.54)}px` }}>
          Doc<span className="dv-brand-logo__accent">Vault</span>
        </span>
      )}
    </div>
  );
}
