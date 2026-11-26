import React, { useState, useRef, useEffect } from "react";
import { 
  ShieldCheck, Lock, Sparkles, FileText, CheckCircle2, 
  Calendar, ArrowUpRight, Cpu, Layers, Fingerprint, 
  Activity, Zap, ShieldAlert, Award
} from "lucide-react";
import "./AppleSpatialVault3D.css";

const VAULT_ITEMS = [
  {
    id: "insurance",
    tag: "INTELLIGENT VAULT",
    tagColor: "blue",
    title: "Health Suraksha Policy",
    docType: "Insurance Policy",
    number: "POL-HDFC-992140",
    holder: "Aarav Sharma",
    metricLabel: "Sum Insured",
    metricValue: "₹ 15,00,000",
    statusText: "Active • Tier 1 Verified",
    statusType: "success",
    expiryText: "Renews on 15 Apr 2027",
    encryptionPill: "AES-GCM-256 Cryptographic Custody",
    aiEnabled: true,
    aiBadgeText: "Grounded AI Copilot Enabled",
  },
  {
    id: "identity",
    tag: "SECURE STORAGE ONLY",
    tagColor: "amber",
    title: "National Identity (Aadhaar)",
    docType: "Government Identity",
    number: "•••• •••• 8821",
    holder: "Aarav Sharma",
    metricLabel: "Checksum Gate",
    metricValue: "Verhoeff Validated",
    statusText: "Strict Personal Isolation",
    statusType: "warning",
    expiryText: "Lifetime Validity",
    encryptionPill: "Client-Side Zero-AI Custody",
    aiEnabled: false,
    aiBadgeText: "Zero External LLM Exposure",
  },
  {
    id: "asset",
    tag: "LIFECYCLE & ASSETS",
    tagColor: "emerald",
    title: "Vehicle Registration & Deed",
    docType: "Asset Record (Vehicle)",
    number: "DL-01-AX-9921",
    holder: "BMW 330i M Sport",
    metricLabel: "Linked Documents",
    metricValue: "3 Files (RC, Insurance, PUC)",
    statusText: "Renewal Radar Active",
    statusType: "info",
    expiryText: "PUC Renewal in 24 Days",
    encryptionPill: "Automated Calendar Sync",
    aiEnabled: true,
    aiBadgeText: "Automated Reminder Scheduled",
  },
];

export default function AppleSpatialVault3D() {
  const [activeTab, setActiveTab] = useState("insurance");
  const cardRef = useRef(null);
  const targetRotateRef = useRef({ x: 0, y: 0, scale: 1 });
  const currentRotateRef = useRef({ x: 0, y: 0, scale: 1 });
  const isInteractingRef = useRef(false);
  const hasGyroRef = useRef(false);
  const gyroBaselineRef = useRef(null);

  const currentDoc = VAULT_ITEMS.find((item) => item.id === activeTab) || VAULT_ITEMS[0];

  // 60fps direct-DOM lerp loop (zero React re-renders during tilt/gyro motion)
  useEffect(() => {
    let rafId = null;
    let startTime = performance.now();

    const tick = (now) => {
      // Subtle ambient spatial float on mobile/idle when not actively hovering
      if (!isInteractingRef.current && !hasGyroRef.current) {
        const t = (now - startTime) * 0.0012;
        targetRotateRef.current = {
          x: Math.sin(t) * 2.4,
          y: Math.cos(t * 0.85) * 3.4,
          scale: 1,
        };
      }

      const cur = currentRotateRef.current;
      const tgt = targetRotateRef.current;
      cur.x += (tgt.x - cur.x) * 0.12;
      cur.y += (tgt.y - cur.y) * 0.12;
      cur.scale += (tgt.scale - cur.scale) * 0.12;

      if (cardRef.current) {
        cardRef.current.style.transform = `perspective(1100px) rotateX(${cur.x.toFixed(2)}deg) rotateY(${cur.y.toFixed(2)}deg) scale3d(${cur.scale.toFixed(3)}, ${cur.scale.toFixed(3)}, 1)`;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // Automatic mobile gyroscope / accelerometer tracking (no touch required on Android; auto-enables on first tap on iOS)
  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) return;

    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

    const handleOrientation = (event) => {
      if (event.beta === null || event.gamma === null) return;
      hasGyroRef.current = true;

      if (!gyroBaselineRef.current) {
        gyroBaselineRef.current = { beta: event.beta, gamma: event.gamma };
      }

      const dBeta = event.beta - gyroBaselineRef.current.beta;
      const dGamma = event.gamma - gyroBaselineRef.current.gamma;

      // Slowly drift baseline so natural posture changes stay centered
      gyroBaselineRef.current.beta += dBeta * 0.015;
      gyroBaselineRef.current.gamma += dGamma * 0.015;

      targetRotateRef.current = {
        x: clamp(-dBeta * 0.45, -12, 12),
        y: clamp(dGamma * 0.55, -14, 14),
        scale: 1.015,
      };
    };

    const startListening = () => {
      window.addEventListener("deviceorientation", handleOrientation, true);
    };

    const requestIOSPermissionOnce = async () => {
      try {
        const res = await window.DeviceOrientationEvent.requestPermission();
        if (res === "granted") {
          startListening();
        }
      } catch (_) {}
      window.removeEventListener("touchstart", requestIOSPermissionOnce);
      window.removeEventListener("click", requestIOSPermissionOnce);
    };

    if (typeof window.DeviceOrientationEvent.requestPermission === "function") {
      window.addEventListener("touchstart", requestIOSPermissionOnce, { passive: true, once: true });
      window.addEventListener("click", requestIOSPermissionOnce, { passive: true, once: true });
    } else {
      startListening();
    }

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
      window.removeEventListener("touchstart", requestIOSPermissionOnce);
      window.removeEventListener("click", requestIOSPermissionOnce);
    };
  }, []);

  // Mouse tilt tracking for desktop
  const handleMouseMove = (e) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    targetRotateRef.current = {
      x: ((y - centerY) / centerY) * -10,
      y: ((x - centerX) / centerX) * 12,
      scale: 1.02,
    };
  };

  const handleMouseEnter = () => {
    isInteractingRef.current = true;
  };

  const handleMouseLeave = () => {
    isInteractingRef.current = false;
    targetRotateRef.current = { x: 0, y: 0, scale: 1 };
  };

  return (
    <div className="dv-3d-scene">
      {/* Ambient background light bloom */}
      <div className={`dv-3d-ambient-bloom dv-3d-ambient-bloom--${currentDoc.tagColor}`} />

      {/* Floating 3D Spatial Frame - Mouse tilt on desktop, real-time phone motion gyroscope on mobile */}
      <div
        ref={cardRef}
        className="dv-3d-tilt-container"
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Spatial Floating Badge: Top Left */}
        <div className="dv-3d-orbit-pill dv-3d-orbit-pill--top-left">
          <div className="dv-3d-orbit-icon dv-3d-orbit-icon--biometric">
            <Fingerprint size={16} />
          </div>
          <div className="dv-3d-orbit-content">
            <span className="dv-3d-orbit-label">Hardware Custody</span>
            <span className="dv-3d-orbit-val">Face ID / Touch ID PIN</span>
          </div>
          <span className="dv-3d-pulse-dot" />
        </div>

        {/* Spatial Floating Badge: Bottom Right */}
        <div className="dv-3d-orbit-pill dv-3d-orbit-pill--bottom-right">
          <div className="dv-3d-orbit-icon dv-3d-orbit-icon--guard">
            {currentDoc.aiEnabled ? <Sparkles size={16} /> : <Lock size={16} />}
          </div>
          <div className="dv-3d-orbit-content">
            <span className="dv-3d-orbit-label">Security Protocol</span>
            <span className="dv-3d-orbit-val">{currentDoc.encryptionPill}</span>
          </div>
        </div>

        {/* The Main Titanium Glass Vault Window */}
        <div className="dv-3d-vault-card">
          {/* Apple-style window chrome */}
          <div className="dv-3d-card-chrome">
            <div className="dv-3d-traffic-lights">
              <span className="dv-3d-dot dv-3d-dot--red" />
              <span className="dv-3d-dot dv-3d-dot--yellow" />
              <span className="dv-3d-dot dv-3d-dot--green" />
            </div>

            <div className="dv-3d-status-pill">
              <Lock size={11} className="dv-3d-status-lock" />
              <span>DOCVAULT SOVEREIGN SANDBOX</span>
            </div>

            <div className="dv-3d-badge-secure">
              <ShieldCheck size={13} />
              <span>E2EE 256-BIT</span>
            </div>
          </div>

          {/* Segmented Controller (Tabs) */}
          <div className="dv-3d-segmented-control" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "insurance"}
              className={`dv-3d-seg-btn ${activeTab === "insurance" ? "dv-3d-seg-btn--active" : ""}`}
              onClick={() => setActiveTab("insurance")}
            >
              <FileText size={13} />
              <span>Smart Vault</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "identity"}
              className={`dv-3d-seg-btn ${activeTab === "identity" ? "dv-3d-seg-btn--active" : ""}`}
              onClick={() => setActiveTab("identity")}
            >
              <Lock size={13} />
              <span>Storage Only</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "asset"}
              className={`dv-3d-seg-btn ${activeTab === "asset" ? "dv-3d-seg-btn--active" : ""}`}
              onClick={() => setActiveTab("asset")}
            >
              <Calendar size={13} />
              <span>Renewals</span>
            </button>
          </div>

          {/* Floating Internal Document Sheet (Depth translateZ) */}
          <div className="dv-3d-doc-stage">
            <div className={`dv-3d-doc-sheet dv-3d-doc-sheet--${currentDoc.tagColor}`}>
              {/* Document Header */}
              <div className="dv-3d-doc-header">
                <div className="dv-3d-doc-tag-box">
                  <span className={`dv-3d-tag dv-3d-tag--${currentDoc.tagColor}`}>
                    {currentDoc.tag}
                  </span>
                  <span className="dv-3d-doc-type">{currentDoc.docType}</span>
                </div>
                <div className="dv-3d-verified-badge">
                  <CheckCircle2 size={14} />
                  <span>Verified</span>
                </div>
              </div>

              {/* Document Title & Reference */}
              <div className="dv-3d-doc-body">
                <h3 className="dv-3d-doc-title">{currentDoc.title}</h3>
                <div className="dv-3d-doc-code-pill">
                  <span>Ref:</span>
                  <strong>{currentDoc.number}</strong>
                </div>
              </div>

              {/* Data Grid with 3D Depth */}
              <div className="dv-3d-data-grid">
                <div className="dv-3d-data-cell">
                  <span className="dv-3d-cell-label">{currentDoc.metricLabel}</span>
                  <span className="dv-3d-cell-val dv-3d-cell-val--strong">{currentDoc.metricValue}</span>
                </div>
                <div className="dv-3d-data-cell">
                  <span className="dv-3d-cell-label">Holder / Entity</span>
                  <span className="dv-3d-cell-val">{currentDoc.holder}</span>
                </div>
                <div className="dv-3d-data-cell">
                  <span className="dv-3d-cell-label">Status</span>
                  <span className={`dv-3d-cell-val dv-3d-cell-val--status dv-3d-cell-val--${currentDoc.statusType}`}>
                    <span className="dv-3d-cell-indicator" />
                    {currentDoc.statusText}
                  </span>
                </div>
                <div className="dv-3d-data-cell">
                  <span className="dv-3d-cell-label">Timeline</span>
                  <span className="dv-3d-cell-val dv-3d-cell-val--timeline">{currentDoc.expiryText}</span>
                </div>
              </div>

              {/* Document Footer Bar */}
              <div className="dv-3d-doc-footer">
                <div className="dv-3d-ai-badge">
                  {currentDoc.aiEnabled ? (
                    <Sparkles size={13} className="dv-3d-sparkle-icon" />
                  ) : (
                    <ShieldAlert size={13} className="dv-3d-shield-icon" />
                  )}
                  <span>{currentDoc.aiBadgeText}</span>
                </div>
                <div className="dv-3d-watermark-stamp">
                  <span>SOVEREIGN ARCHIVE</span>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Micro-hint */}
          <div className="dv-3d-footer-hint">
            <span className="dv-3d-hint-dot" />
            <span>Move cursor or touch to rotate in 3D space • Switch tabs to inspect vault modes</span>
          </div>
        </div>
      </div>
    </div>
  );
}

