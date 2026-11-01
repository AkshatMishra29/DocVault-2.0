import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Lock, Sparkles, KeyRound, CheckCircle2 } from 'lucide-react';
import DocVaultLogo from '../../../components/common/DocVaultLogo/DocVaultLogo';
import './AuthBrandPanel.css';

const VARIANT_CONFIGS = {
  login: {
    kicker: "DOCVAULT / PRIVATE DOCUMENT MANAGEMENT",
    title: "Your documents, beautifully in order.",
    subtitle: "Everything important, organized in one secure place.",
    imageSrc: "/assets/auth/hero-vault.jpg",
    imageAlt: "DocVault 3D sculptural safe and floating documents",
    bullets: [
      { icon: ShieldCheck, text: "Client-side encrypted zero-knowledge custody" },
      { icon: Sparkles, text: "Smart OCR and structured document metadata" },
      { icon: Lock, text: "Two-stage PIN and biometric hardware security" },
    ]
  },
  register: {
    kicker: "JOIN DOCVAULT / SECURE YOUR FILES",
    title: "Make room for what matters.",
    subtitle: "Create your private space for important documents.",
    imageSrc: "/assets/auth/hero-register.jpg",
    imageAlt: "DocVault 3D architectural archive drawers and sculptural folders",
    bullets: [
      { icon: ShieldCheck, text: "Private vault isolated from third-party tracking" },
      { icon: KeyRound, text: "Flexible 4 or 6-digit cryptographic security PIN" },
      { icon: Sparkles, text: "Instant automatic expiry and renewal tracking" },
    ]
  },
  otp: {
    kicker: "ENCRYPTED TRANSIT / IDENTITY VERIFICATION",
    title: "Verify your email.",
    subtitle: "We've sent a 6-digit verification code to confirm ownership.",
    imageSrc: "/assets/auth/hero-otp.jpg",
    imageAlt: "DocVault 3D ceramic security envelope and metallic shield",
    bullets: [
      { icon: ShieldCheck, text: "Expiring single-use OTP dispatch" },
      { icon: Lock, text: "Defense against unauthorized automated signups" },
      { icon: CheckCircle2, text: "Fast seamless transition to vault configuration" },
    ]
  },
  pin: {
    kicker: "LOCAL HARDWARE LOCK / ACCESS CONTROL",
    title: "Unlock your vault.",
    subtitle: "Enter your vault PIN to decrypt your documents.",
    imageSrc: "/assets/auth/hero-pin.jpg",
    imageAlt: "DocVault 3D combination dial and metallic security tumblers",
    bullets: [
      { icon: Lock, text: "Anti-tamper rate limiting and lockout defense" },
      { icon: KeyRound, text: "Hardware WebAuthn biometric fallback support" },
      { icon: ShieldCheck, text: "Zero-knowledge local decryption keys" },
    ]
  }
};

export default function AuthBrandPanel({
  variant = 'login',
  customTitle,
  customSubtitle,
  customKicker,
  customImage
}) {
  const config = VARIANT_CONFIGS[variant] || VARIANT_CONFIGS.login;
  const kicker = customKicker || config.kicker;
  const title = customTitle || config.title;
  const subtitle = customSubtitle || config.subtitle;
  const imageSrc = customImage || config.imageSrc;
  const imageAlt = config.imageAlt;
  const bullets = config.bullets;

  return (
    <aside className="dv-auth-editorial-panel" aria-label="DocVault Overview">
      {/* Editorial Decorative Grain & Ambient Canvas */}
      <div className="dv-editorial-grain" />

      {/* Top Header Area */}
      <div className="dv-editorial-top">
        <Link to="/" className="dv-editorial-logo-link" title="Return to DocVault Home">
          <DocVaultLogo height={36} />
        </Link>
        <span className="dv-editorial-tagline-pill">Private & Encrypted</span>
      </div>

      {/* 3D Illustration Frame */}
      <div className="dv-editorial-visual-frame">
        <div className="dv-editorial-image-wrapper">
          <img
            src={imageSrc}
            alt={imageAlt}
            className="dv-editorial-3d-img"
            loading="eager"
            onError={(e) => {
              // Graceful fallback if image is loading
              e.currentTarget.style.display = 'none';
            }}
          />
          {/* Subtle warm glow overlay */}
          <div className="dv-editorial-image-vignette" />
        </div>
      </div>

      {/* Bottom Editorial Narrative */}
      <div className="dv-editorial-narrative">
        <span className="dv-editorial-kicker">{kicker}</span>
        <h2 className="dv-editorial-title">{title}</h2>
        <p className="dv-editorial-subtitle">{subtitle}</p>

        {/* Feature Micro-Badges */}
        <div className="dv-editorial-bullets">
          {bullets.map((b, i) => {
            const Icon = b.icon;
            return (
              <div key={i} className="dv-editorial-bullet-item">
                <span className="dv-bullet-dot">
                  <Icon size={13} strokeWidth={2.4} />
                </span>
                <span className="dv-bullet-text">{b.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Editorial Footer */}
      <div className="dv-editorial-footer">
        <span>DocVault • Sovereign Document Custody</span>
        <span className="dv-editorial-footer-sep">/</span>
        <span>Zero-Knowledge Architecture</span>
      </div>
    </aside>
  );
}
