import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../../../services/api";
import { 
  User, Mail, Lock, Phone, KeyRound, AlertCircle, ArrowRight, 
  Sun, Moon, ShieldCheck, RefreshCw, Eye, EyeOff 
} from "lucide-react";
import DocVaultLogo from "../../../components/common/DocVaultLogo/DocVaultLogo";
import { analyzePasswordStrength } from "../../shield/services/passwordStrengthService";
import { analyzePinSecurity } from "../../shield/services/pinSecurityService";
import "./Auth.css";

export default function RegisterPage() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") || "dark");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    pinLength: 4, // 4 or 6 digits
    pin: "",
    phone: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState("form"); // "form" | "otp"
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // Live Heuristic Password Advice (100% In-Memory Shannon Entropy & Rule Engine)
  const pwdAdvice = useMemo(() => {
    if (!formData.password) return null;
    return analyzePasswordStrength(formData.password);
  }, [formData.password]);

  // Live Heuristic PIN Security Advice (100% In-Memory DataGenetics Engine)
  const pinAdvice = useMemo(() => {
    if (!formData.pin || formData.pin.length < 2) return null;
    return analyzePinSecurity(formData.pin, formData.pinLength);
  }, [formData.pin, formData.pinLength]);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePinChange = (val) => {
    const clean = val.replace(/\D/g, "").slice(0, Number(formData.pinLength));
    handleChange("pin", clean);
  };

  // Step 1: Send 6-Digit OTP to User's Email via MongoDB
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError("");
    setInfoMessage("");

    if (!formData.name || !formData.email || !formData.password || !formData.pin) {
      setError("Please fill out all required fields.");
      return;
    }

    if (formData.pin.length < 4 || formData.pin.length > 6 || !/^\d+$/.test(formData.pin)) {
      setError("Vault Security PIN must be between 4 and 6 numeric digits.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiRequest("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ email: formData.email, purpose: "register" }),
      });

      if (!res.ok) {
        throw new Error(res.error || res.message || "Failed to dispatch verification code.");
      }

      setStep("otp");
      setInfoMessage(`A 6-digit verification code has been dispatched to ${formData.email}.`);
    } catch (err) {
      setError(err.message || "Failed to send verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP and Provision Cryptographic Vault Account
  const handleVerifyOtpAndRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (!otp || otp.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const result = await register({
        ...formData,
        otp: otp.trim(),
      });

      if (result.success) {
        navigate("/dashboard");
      } else {
        setError(result.error || "Verification failed. Please re-check the OTP.");
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred during account verification.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError("");
    setResending(true);
    try {
      const res = await apiRequest("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ email: formData.email, purpose: "register" }),
      });
      if (!res.ok) throw new Error(res.error || "Failed to resend code.");
      setInfoMessage("A fresh verification code has been sent!");
    } catch (err) {
      setError(err.message || "Failed to resend verification code.");
    } finally {
      setResending(false);
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
        {/* Left Side: Clean Minimalist Sign Up Form */}
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

            {step === "otp" ? (
              <div>
                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <div
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "50%",
                      background: "rgba(16, 185, 129, 0.12)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 12px",
                      color: "#10b981",
                    }}
                  >
                    <ShieldCheck size={28} />
                  </div>
                  <h1 className="arcana-title" style={{ fontSize: "22px", marginBottom: "6px" }}>
                    Enter Verification OTP
                  </h1>
                  <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                    Sent a 6-digit code to <strong style={{ color: "var(--color-primary)" }}>{formData.email}</strong>
                  </p>
                </div>

                {error && (
                  <div className="arcana-alert-error" style={{ marginBottom: "16px" }}>
                    <AlertCircle size={15} />
                    <span>{error}</span>
                  </div>
                )}

                {infoMessage && (
                  <div style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(16, 185, 129, 0.12)",
                    border: "1px solid rgba(16, 185, 129, 0.25)",
                    color: "#10b981",
                    fontSize: "12.5px",
                    marginBottom: "16px",
                    textAlign: "center"
                  }}>
                    {infoMessage}
                  </div>
                )}

                <form onSubmit={handleVerifyOtpAndRegister} className="arcana-form">
                  <div className="arcana-field">
                    <label className="arcana-label" style={{ textAlign: "center" }}>6-Digit OTP Code</label>
                    <div className="arcana-input-wrap" style={{ height: "52px" }}>
                      <input
                        type="text"
                        name="otp"
                        maxLength={6}
                        autoFocus
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                        placeholder="••••••"
                        style={{
                          textAlign: "center",
                          fontSize: "24px",
                          letterSpacing: "10px",
                          fontWeight: 700,
                          fontFamily: "monospace"
                        }}
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="arcana-submit-btn"
                    disabled={loading || otp.length !== 6}
                    style={{ marginTop: "16px" }}
                  >
                    <span>{loading ? "Verifying..." : "Verify & Unlock Vault"}</span>
                    <ArrowRight size={15} />
                  </button>
                </form>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "18px", fontSize: "12.5px" }}>
                  <button
                    type="button"
                    onClick={() => { setStep("form"); setError(""); }}
                    style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", textDecoration: "underline" }}
                  >
                    Change details
                  </button>
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resending}
                    style={{ background: "none", border: "none", color: "var(--color-primary)", fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
                  >
                    <RefreshCw size={13} className={resending ? "spin-animation" : ""} />
                    {resending ? "Sending..." : "Resend Code"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="arcana-title">Create account</h1>

                {error && (
                  <div className="arcana-alert-error">
                    <AlertCircle size={15} />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleRequestOtp} className="arcana-form">
                  <div className="arcana-form-row">
                    <div className="arcana-field">
                      <label className="arcana-label">Full Name</label>
                      <div className="arcana-input-wrap">
                        <User size={15} className="arcana-input-icon" />
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={(e) => handleChange("name", e.target.value)}
                          placeholder="Alex Hunter"
                          required
                        />
                      </div>
                    </div>

                    <div className="arcana-field">
                      <label className="arcana-label">Phone Number (Optional)</label>
                      <div className="arcana-input-wrap">
                        <Phone size={15} className="arcana-input-icon" />
                        <input
                          type="tel"
                          name="phone"
                          value={formData.phone}
                          onChange={(e) => handleChange("phone", e.target.value)}
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="arcana-field">
                    <label className="arcana-label">Email Address</label>
                    <div className="arcana-input-wrap">
                      <Mail size={15} className="arcana-input-icon" />
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={(e) => handleChange("email", e.target.value)}
                        placeholder="alex.hunter@example.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="arcana-form-row">
                    <div className="arcana-field">
                      <label className="arcana-label">Master Password</label>
                      <div className="arcana-input-wrap" style={{ position: "relative" }}>
                        <Lock size={15} className="arcana-input-icon" />
                        <input
                          type={showPassword ? "text" : "password"}
                          name="password"
                          value={formData.password}
                          onChange={(e) => handleChange("password", e.target.value)}
                          placeholder="••••••••••••"
                          style={{ paddingRight: "34px" }}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          style={{
                            position: "absolute",
                            right: "10px",
                            background: "none",
                            border: "none",
                            color: "var(--color-text-secondary, #64748b)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            padding: "4px"
                          }}
                          title={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>

                      {/* Live Password Strength Meter & Actionable Advice */}
                      {pwdAdvice && formData.password && (
                        <div style={{ marginTop: "6px", fontSize: "11px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                            <div style={{ display: "flex", gap: "3px", width: "72px" }}>
                              {[0, 1, 2, 3].map((idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    height: "4px",
                                    flex: 1,
                                    borderRadius: "2px",
                                    background: idx <= pwdAdvice.score ? pwdAdvice.level.color : "rgba(148, 163, 184, 0.25)",
                                    transition: "all 0.2s ease"
                                  }}
                                />
                              ))}
                            </div>
                            <span style={{ fontWeight: 700, color: pwdAdvice.level.color }}>
                              {pwdAdvice.level.label}
                            </span>
                            <span style={{ color: "var(--color-text-muted, #94a3b8)", fontSize: "10px" }}>
                              ~{pwdAdvice.entropy} bits entropy
                            </span>
                          </div>
                          {pwdAdvice.recommendations && pwdAdvice.recommendations.length > 0 && (
                            <ul style={{ margin: "3px 0 0", paddingLeft: "14px", color: "var(--color-text-secondary, #94a3b8)", lineHeight: 1.35 }}>
                              {pwdAdvice.recommendations.slice(0, 2).map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="arcana-field">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <label className="arcana-label" style={{ marginBottom: 0 }}>Security PIN</label>
                        <select
                          value={formData.pinLength}
                          onChange={(e) => {
                            const len = Number(e.target.value);
                            setFormData(prev => ({ ...prev, pinLength: len, pin: prev.pin.slice(0, len) }));
                          }}
                          style={{
                            background: "var(--color-surface, #0f172a)",
                            color: "var(--color-primary, #38bdf8)",
                            border: "1px solid var(--color-border, #334155)",
                            borderRadius: "4px",
                            fontSize: "11px",
                            padding: "2px 6px",
                            cursor: "pointer"
                          }}
                        >
                          <option value={4}>4 Digits</option>
                          <option value={6}>6 Digits</option>
                        </select>
                      </div>
                      <div className="arcana-input-wrap" style={{ marginTop: "6px", position: "relative" }}>
                        <KeyRound size={15} className="arcana-input-icon" />
                        <input
                          type={showPin ? "text" : "password"}
                          inputMode="numeric"
                          name="pin"
                          maxLength={formData.pinLength}
                          value={formData.pin}
                          onChange={(e) => handlePinChange(e.target.value)}
                          placeholder={formData.pinLength === 6 ? "••••••" : "••••"}
                          style={{ paddingRight: "34px", letterSpacing: showPin ? "2px" : "normal" }}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPin(!showPin)}
                          style={{
                            position: "absolute",
                            right: "10px",
                            background: "none",
                            border: "none",
                            color: "var(--color-text-secondary, #64748b)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            padding: "4px"
                          }}
                          title={showPin ? "Hide PIN" : "Show PIN"}
                        >
                          {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>

                      {/* Live PIN Resistance Advice & Warnings */}
                      {pinAdvice && formData.pin && (
                        <div style={{ marginTop: "6px", fontSize: "11px" }}>
                          <span style={{
                            fontWeight: 700,
                            color: pinAdvice.isBlocked ? "#ef4444" : "#10b981",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px"
                          }}>
                            {pinAdvice.isBlocked ? "⚠️ Notice: Vulnerable Pattern" : "✓ Acceptable Resistance Pattern"}
                          </span>
                          {pinAdvice.warnings && pinAdvice.warnings.length > 0 && (
                            <ul style={{ margin: "3px 0 0", paddingLeft: "14px", color: "#f87171", lineHeight: 1.35 }}>
                              {pinAdvice.warnings.slice(0, 2).map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Private & Zero-Knowledge In-Memory Security Note */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    background: "rgba(1, 90, 71, 0.08)",
                    border: "1px solid rgba(1, 90, 71, 0.2)",
                    fontSize: "11.5px",
                    color: "var(--color-text-secondary, #64748b)",
                    lineHeight: 1.4,
                    marginBottom: "4px"
                  }}>
                    <ShieldCheck size={16} color="#10b981" style={{ flexShrink: 0 }} />
                    <span>
                      <strong style={{ color: "var(--color-text-primary, #0f172a)" }}>Private & Client-Side:</strong> Evaluated strictly in local device memory using Shannon entropy and heuristic dictionaries. No credentials ever leave your browser.
                    </span>
                  </div>

                  <button
                    type="submit"
                    className="arcana-submit-btn"
                    disabled={loading}
                  >
                    <span>{loading ? "Sending Verification OTP..." : "Get Verification Code"}</span>
                    <ArrowRight size={15} />
                  </button>
                </form>

                <div className="arcana-links-row" style={{ marginTop: "20px" }}>
                  <span className="arcana-links-text">Already have an account? </span>
                  <Link to="/login" className="arcana-link-bold">Sign in</Link>
                </div>
              </>
            )}
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
                  <linearGradient id="regShieldEmeraldLeft" x1="160" y1="20" x2="60" y2="240" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#047857" />
                    <stop offset="50%" stop-color="#015A47" />
                    <stop offset="100%" stop-color="#064E3B" />
                  </linearGradient>
                  <linearGradient id="regShieldEmeraldRight" x1="160" y1="20" x2="260" y2="240" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#015A47" />
                    <stop offset="60%" stop-color="#064E3B" />
                    <stop offset="100%" stop-color="#022C22" />
                  </linearGradient>
                  <linearGradient id="regLockGold" x1="140" y1="120" x2="180" y2="180" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stop-color="#34D399" />
                    <stop offset="100%" stop-color="#059669" />
                  </linearGradient>
                  <filter id="regShieldGlowGreen" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="14" stdDeviation="20" flood-color="#01362B" flood-opacity="0.85" />
                  </filter>
                </defs>
                <g filter="url(#regShieldGlowGreen)">
                  {/* Outer Shield Left Half */}
                  <path d="M160 20L60 62V145C60 205 102 248 160 262V20Z" fill="url(#regShieldEmeraldLeft)" />
                  {/* Outer Shield Right Half */}
                  <path d="M160 20L260 62V145C260 205 218 248 160 262V20Z" fill="url(#regShieldEmeraldRight)" />
                  {/* Inner Shield Inset */}
                  <path d="M160 38L78 72V142C78 192 113 230 160 244C207 230 242 192 242 142V72L160 38Z" fill="#031F19" fill-opacity="0.75" />
                  {/* Shield Center Divider */}
                  <path d="M160 38V244" stroke="rgba(52, 211, 153, 0.25)" stroke-width="2" />
                  {/* Floating Lock Shackle */}
                  <path d="M136 128V106C136 93 146.5 82 160 82C173.5 82 184 93 184 106V128" stroke="url(#regLockGold)" stroke-width="9" stroke-linecap="round" fill="none" />
                  {/* Lock Body */}
                  <rect x="124" y="124" width="72" height="58" rx="14" fill="url(#regLockGold)" />
                  {/* Lock Keyhole */}
                  <circle cx="160" cy="148" r="5" fill="#022C22" />
                  <path d="M157.5 151L156 166H164L162.5 151H157.5Z" fill="#022C22" />
                </g>
              </svg>
            </div>

            {/* Middle Copy */}
            <div className="arcana-card-copy">
              <span className="arcana-brand-pill">DocVault Sovereignty</span>
              <h2 className="arcana-welcome-heading">Create your safe vault</h2>
              <p className="arcana-welcome-desc">
                Bank-grade encrypted private document management with instant OCR extraction and AI assistant grounded on your files.
              </p>
              <span className="arcana-stats-line">Zero-knowledge tenant isolation</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
