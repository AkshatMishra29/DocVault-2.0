import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Mail, Lock, AlertCircle, ArrowRight, Sun, Moon, Sparkles } from "lucide-react";
import DocVaultLogo from "../../../components/common/DocVaultLogo/DocVaultLogo";
import "./Auth.css";

export default function LoginPage() {
  const location = useLocation();
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") || "dark");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState(() => location.state?.message || "");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please provide both email and password.");
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      navigate("/enter-pin", { state: { email, pinLength: result.user?.pinLength || 4 } });
    } else {
      setError(result.error || "Authentication failed. Please check your credentials.");
    }
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("docvault_theme", next);
    setTheme(next);
  };

  return (
    <div className="arcana-auth-page">
      <div className="arcana-auth-wrapper">
        {/* Left Side: Clean Minimalist Sign In Form */}
        <div className="arcana-form-side">
          <div className="arcana-form-content">
            {/* Top Logo & Dark/Light Mode Switcher */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <Link to="/" className="arcana-brand-logo" style={{ marginBottom: 0 }}>
                <DocVaultLogo height={38} />
              </Link>
              <button
                type="button"
                onClick={toggleTheme}
                title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
                }}
              >
                {theme === "dark" ? <Sun size={17} color="#fbbf24" /> : <Moon size={17} color="#0f172a" />}
              </button>
            </div>

            <h1 className="arcana-title">Sign in</h1>

            {error && (
              <div className="arcana-alert-error">
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            {infoMessage && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 14px",
                borderRadius: "8px",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#10b981",
                fontSize: "13px",
                marginBottom: "16px"
              }}>
                <Sparkles size={16} />
                <span>{infoMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="arcana-form">
              <div className="arcana-field">
                <label className="arcana-label">Email Address</label>
                <div className="arcana-input-wrap">
                  <Mail size={15} className="arcana-input-icon" />
                  <input
                    type="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="johndoe@gmail.com"
                    required
                  />
                </div>
              </div>

              <div className="arcana-field">
                <label className="arcana-label">Password</label>
                <div className="arcana-input-wrap">
                  <Lock size={15} className="arcana-input-icon" />
                  <input
                    type="password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    required
                  />
                </div>
              </div>

              <div className="arcana-remember-wrap">
                <label className="arcana-checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span className="arcana-custom-checkbox"></span>
                  <span className="arcana-checkbox-text">Remember me</span>
                </label>
              </div>

              <button
                type="submit"
                className="arcana-submit-btn"
                disabled={loading}
              >
                <span>{loading ? "Signing in..." : "Sign In to Vault"}</span>
                <ArrowRight size={15} />
              </button>
            </form>

            <div className="arcana-links-row" style={{ marginTop: "24px" }}>
              <span className="arcana-links-text">Don't have an account? </span>
              <Link to="/register" className="arcana-link-bold">Sign up</Link>
            </div>
          </div>
        </div>

        {/* Right Side: Deep Emerald & Slate Black Card with 3D Security Shield & Stepped Folder */}
        <div className="arcana-hero-side">
          <div className="arcana-black-card">
            {/* Ambient Lighting */}
            <div className="arcana-light-streak"></div>

            {/* 3D Bank-Grade Security Shield & Lock Artwork */}
            <div className="arcana-monolith-wrap">
              <svg className="arcana-monolith-svg" viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="shieldEmeraldLeft" x1="160" y1="20" x2="60" y2="240" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#047857" />
                    <stop offset="50%" stop-color="#015A47" />
                    <stop offset="100%" stop-color="#064E3B" />
                  </linearGradient>
                  <linearGradient id="shieldEmeraldRight" x1="160" y1="20" x2="260" y2="240" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#015A47" />
                    <stop offset="60%" stop-color="#064E3B" />
                    <stop offset="100%" stop-color="#022C22" />
                  </linearGradient>
                  <linearGradient id="lockGold" x1="140" y1="120" x2="180" y2="180" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#34D399" />
                    <stop offset="100%" stop-color="#059669" />
                  </linearGradient>
                  <filter id="shieldGlowGreen" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="14" stdDeviation="20" flood-color="#01362B" flood-opacity="0.85" />
                  </filter>
                </defs>
                <g filter="url(#shieldGlowGreen)">
                  {/* Outer Shield Left Half */}
                  <path d="M160 20L60 62V145C60 205 102 248 160 262V20Z" fill="url(#shieldEmeraldLeft)" />
                  {/* Outer Shield Right Half */}
                  <path d="M160 20L260 62V145C260 205 218 248 160 262V20Z" fill="url(#shieldEmeraldRight)" />
                  {/* Inner Shield Inset */}
                  <path d="M160 38L78 72V142C78 192 113 230 160 244C207 230 242 192 242 142V72L160 38Z" fill="#031F19" fill-opacity="0.75" />
                  {/* Shield Center Divider */}
                  <path d="M160 38V244" stroke="rgba(52, 211, 153, 0.25)" stroke-width="2" />
                  {/* Floating Lock Shackle */}
                  <path d="M136 128V106C136 93 146.5 82 160 82C173.5 82 184 93 184 106V128" stroke="url(#lockGold)" stroke-width="9" stroke-linecap="round" fill="none" />
                  {/* Lock Body */}
                  <rect x="124" y="124" width="72" height="58" rx="14" fill="url(#lockGold)" />
                  {/* Lock Keyhole */}
                  <circle cx="160" cy="148" r="5" fill="#022C22" />
                  <path d="M157.5 151L156 166H164L162.5 151H157.5Z" fill="#022C22" />
                </g>
              </svg>
            </div>

            {/* Middle Copy */}
            <div className="arcana-card-copy">
              <span className="arcana-brand-pill">DocVault Sovereignty</span>
              <h2 className="arcana-welcome-heading">Welcome to DocVault</h2>
              <p className="arcana-welcome-desc">
                DocVault helps individuals & teams build organized, bank-grade encrypted vaults with automated OCR extraction.
              </p>
              <span className="arcana-stats-line">More than 17k people joined us, it’s your turn</span>
            </div>

            {/* Authentic Stepped Folder Silhouette */}
            <div className="arcana-authentic-folder">
              <div className="arcana-folder-content">
                <div className="arcana-folder-left">
                  <h3>Get your private vault and right place for documents</h3>
                  <p>Be among the first custodians to experience sovereign file organization.</p>
                </div>

                <div className="arcana-avatar-stack">
                  <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80" alt="Member" className="arcana-avatar-img" />
                  <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=80&q=80" alt="Member" className="arcana-avatar-img" />
                  <img src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=80&q=80" alt="Member" className="arcana-avatar-img" />
                  <div className="arcana-avatar-badge">+2</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
