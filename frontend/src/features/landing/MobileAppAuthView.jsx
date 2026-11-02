import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/context/AuthContext";
import { 
  ShieldCheck, Lock, Mail, User, KeyRound, 
  ArrowRight, Sparkles, HelpCircle, Smartphone, 
  Eye, EyeOff, Info, CheckCircle2, ChevronRight
} from "lucide-react";
import { signInWithGoogle } from "../../services/firebase";
import { apiRequest } from "../../services/api";
import DocVaultLogo from "../../components/common/DocVaultLogo/DocVaultLogo";
import AboutDocVaultModal from "../../components/common/AboutModal/AboutDocVaultModal";
import PasswordStrengthMeter from "../auth/components/PasswordStrengthMeter";
import { analyzePasswordStrength } from "../shield/services/passwordStrengthService";
import "./MobileAppAuthView.css";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}

export default function MobileAppAuthView({ onSwitchToDesktopWeb }) {
  const [activeTab, setActiveTab] = useState("login"); // 'login' | 'register'
  const [isAboutOpen, setIsAboutOpen] = useState(false);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Register form state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [pinLength, setPinLength] = useState(4);
  const [regPin, setRegPin] = useState("");
  const [regConfirmPin, setRegConfirmPin] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegPin, setShowRegPin] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState("");

  const { login, loginWithFirebaseToken } = useAuth();
  const navigate = useNavigate();

  const pwdAdvice = analyzePasswordStrength(regPassword);

  /* ==========================================================================
     Login Submission
     ========================================================================== */
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");

    if (!loginEmail || !loginPassword) {
      setLoginError("Please enter your email and password.");
      return;
    }

    const cleanEmail = loginEmail.trim().toLowerCase();
    setLoginLoading(true);
    const result = await login(cleanEmail, loginPassword);
    setLoginLoading(false);

    if (result.success) {
      navigate("/enter-pin", { 
        state: { 
          email: cleanEmail, 
          pinLength: result.user?.pinLength || 4 
        } 
      });
    } else {
      setLoginError(result.error || "Invalid credentials. Please verify and try again.");
    }
  };

  /* ==========================================================================
     Register / OTP Submission
     ========================================================================== */
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegError("");

    if (!regName.trim() || !regEmail.trim() || !regPassword || !regPin) {
      setRegError("Please fill out all mandatory fields.");
      return;
    }

    if (regPassword !== regConfirmPassword) {
      setRegError("Master passwords do not match.");
      return;
    }

    if (regPin !== regConfirmPin) {
      setRegError(`Vault PINs do not match.`);
      return;
    }

    if (regPin.length !== pinLength) {
      setRegError(`Please enter a complete ${pinLength}-digit PIN.`);
      return;
    }

    const cleanEmail = regEmail.trim().toLowerCase();
    setRegLoading(true);
    try {
      const otpRes = await apiRequest("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ email: cleanEmail, purpose: "register" }),
      });

      if (!otpRes?.success && !otpRes?.ok) {
        throw new Error(otpRes?.error || otpRes?.message || "Failed to dispatch verification code.");
      }

      const registrationData = {
        name: regName.trim(),
        email: cleanEmail,
        password: regPassword,
        confirmPassword: regConfirmPassword,
        pin: regPin,
        confirmPin: regConfirmPin,
        pinLength,
        phone: regPhone.trim(),
      };

      navigate("/verify-otp", {
        state: {
          formData: registrationData,
          pendingRegistration: registrationData,
          targetEmail: cleanEmail,
          infoMessage: `A 6-digit verification code has been dispatched to ${cleanEmail}.`
        },
      });
    } catch (err) {
      setRegError(err.message || "Failed to initiate verification. Please retry.");
    } finally {
      setRegLoading(false);
    }
  };

  /* ==========================================================================
     Google One-Tap / Firebase Sign In
     ========================================================================== */
  const handleGoogleAuth = async () => {
    try {
      const cred = await signInWithGoogle();
      if (cred && cred.idToken) {
        const result = await loginWithFirebaseToken(cred.idToken);
        if (result.success) {
          const targetEmail = cred.email || result.user?.email;
          const pinLen = result.user?.pinLength || 4;
          localStorage.setItem('pending_pin_email', targetEmail);
          sessionStorage.setItem('docvault_pending_email', targetEmail);
          sessionStorage.setItem('docvault_pin_length', pinLen.toString());
          navigate("/enter-pin", { 
            state: { 
              email: targetEmail, 
              pinLength: pinLen 
            } 
          });
        } else {
          setLoginError(result.error || "Google sign-in could not complete.");
        }
      }
    } catch (err) {
      setLoginError(err.message || "Google Sign-In canceled or blocked.");
    }
  };

  return (
    <div className="dv-native-app-screen">
      {/* Native App Top Bar */}
      <header className="dv-native-app-bar">
        <div className="dv-native-app-bar__brand">
          <DocVaultLogo height={36} />
        </div>
      </header>

      {/* Main Native App Content Container */}
      <main className="dv-native-app-body">
        {/* Native Segmented Control (iOS / Android Material 3 Pill Tabs) */}
        <div className="dv-native-segmented-bar" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "login"}
            className={`dv-native-segment-btn ${activeTab === "login" ? "dv-native-segment-btn--active" : ""}`}
            onClick={() => {
              setActiveTab("login");
              setLoginError("");
            }}
          >
            <span>Sign In</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "register"}
            className={`dv-native-segment-btn ${activeTab === "register" ? "dv-native-segment-btn--active" : ""}`}
            onClick={() => {
              setActiveTab("register");
              setRegError("");
            }}
          >
            <span>Create Account</span>
          </button>
        </div>

        {/* Native Card Surface */}
        <div className="dv-native-card">
          {activeTab === "login" ? (
            /* ==========================================
               LOGIN FORM
               ========================================== */
            <form onSubmit={handleLoginSubmit} className="dv-native-form">
              <div className="dv-native-card__intro">
                <h2 className="dv-native-card__title">Sign In to Your Vault</h2>
                <p className="dv-native-card__desc">Authenticate credentials to access your secure document vault.</p>
              </div>

              {loginError && (
                <div className="dv-native-alert dv-native-alert--error" role="alert">
                  <Info size={16} />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Google Fast Sign In */}
              <button
                type="button"
                className="dv-native-google-btn"
                onClick={handleGoogleAuth}
              >
                <GoogleIcon />
                <span>Continue with Google</span>
              </button>

              <div className="dv-native-divider">
                <span>or email sign in</span>
              </div>

              {/* Email Input */}
              <div className="dv-native-field">
                <label className="dv-native-label">Email Address</label>
                <div className="dv-native-input-wrap">
                  <Mail size={18} className="dv-native-input-icon" />
                  <input
                    type="email"
                    className="dv-native-input"
                    placeholder="name@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="dv-native-field">
                <div className="dv-native-field-header">
                  <label className="dv-native-label">Master Password</label>
                  <Link to="/login" className="dv-native-link-sm">Forgot?</Link>
                </div>
                <div className="dv-native-input-wrap">
                  <Lock size={18} className="dv-native-input-icon" />
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    className="dv-native-input"
                    placeholder="Enter your master password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="dv-native-eye-btn"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={loginLoading}
                className="dv-native-submit-btn"
              >
                {loginLoading ? "Unlocking vault..." : (
                  <>
                    <span>Unlock Vault</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* ==========================================
               REGISTRATION FORM
               ========================================== */
            <form onSubmit={handleRegisterSubmit} className="dv-native-form">
              <div className="dv-native-card__intro">
                <h2 className="dv-native-card__title">Create Encrypted Vault</h2>
                <p className="dv-native-card__desc">Set your master credentials and personal security PIN.</p>
              </div>

              {regError && (
                <div className="dv-native-alert dv-native-alert--error" role="alert">
                  <Info size={16} />
                  <span>{regError}</span>
                </div>
              )}

              {/* Name */}
              <div className="dv-native-field">
                <label className="dv-native-label">Full Name</label>
                <div className="dv-native-input-wrap">
                  <User size={18} className="dv-native-input-icon" />
                  <input
                    type="text"
                    className="dv-native-input"
                    placeholder="Enter your full name"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="dv-native-field">
                <label className="dv-native-label">Email Address</label>
                <div className="dv-native-input-wrap">
                  <Mail size={18} className="dv-native-input-icon" />
                  <input
                    type="email"
                    className="dv-native-input"
                    placeholder="name@example.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="dv-native-field">
                <label className="dv-native-label">Master Password</label>
                <div className="dv-native-input-wrap">
                  <Lock size={18} className="dv-native-input-icon" />
                  <input
                    type={showRegPassword ? "text" : "password"}
                    className="dv-native-input"
                    placeholder="Create master password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="dv-native-eye-btn"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    aria-label="Toggle password visibility"
                  >
                    {showRegPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {regPassword && (
                  <div style={{ marginTop: 8 }}>
                    <PasswordStrengthMeter advice={pwdAdvice} />
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div className="dv-native-field">
                <label className="dv-native-label">Confirm Password</label>
                <div className="dv-native-input-wrap">
                  <Lock size={18} className="dv-native-input-icon" />
                  <input
                    type={showRegPassword ? "text" : "password"}
                    className="dv-native-input"
                    placeholder="Confirm master password"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {/* PIN Length Selection */}
              <div className="dv-native-pin-header">
                <label className="dv-native-label">Vault Unlock PIN</label>
                <div className="dv-native-pin-toggle">
                  <button
                    type="button"
                    className={`dv-native-pin-pill ${pinLength === 4 ? "active" : ""}`}
                    onClick={() => {
                      setPinLength(4);
                      setRegPin("");
                      setRegConfirmPin("");
                    }}
                  >
                    4 Digits
                  </button>
                  <button
                    type="button"
                    className={`dv-native-pin-pill ${pinLength === 6 ? "active" : ""}`}
                    onClick={() => {
                      setPinLength(6);
                      setRegPin("");
                      setRegConfirmPin("");
                    }}
                  >
                    6 Digits
                  </button>
                </div>
              </div>

              {/* Dual PIN Inputs */}
              <div className="dv-native-grid-2">
                <div className="dv-native-field">
                  <div className="dv-native-input-wrap">
                    <KeyRound size={18} className="dv-native-input-icon" />
                    <input
                      type={showRegPin ? "text" : "password"}
                      className="dv-native-input"
                      placeholder={`${pinLength}-digit PIN`}
                      maxLength={pinLength}
                      value={regPin}
                      onChange={(e) => setRegPin(e.target.value.replace(/\D/g, ""))}
                      required
                    />
                  </div>
                </div>

                <div className="dv-native-field">
                  <div className="dv-native-input-wrap">
                    <KeyRound size={18} className="dv-native-input-icon" />
                    <input
                      type={showRegPin ? "text" : "password"}
                      className="dv-native-input"
                      placeholder={`Confirm PIN`}
                      maxLength={pinLength}
                      value={regConfirmPin}
                      onChange={(e) => setRegConfirmPin(e.target.value.replace(/\D/g, ""))}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                disabled={regLoading}
                className="dv-native-submit-btn"
              >
                {regLoading ? "Sending OTP code..." : (
                  <>
                    <span>Verify & Continue</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Under Form: App Info & About Us Link */}
          <div className="dv-native-app-links">
            <button
              type="button"
              className="dv-native-about-btn"
              onClick={() => setIsAboutOpen(true)}
            >
              <HelpCircle size={15} color="#FD2B06" />
              <span>Know about DocVault & Privacy Architecture</span>
              <ChevronRight size={14} className="dv-native-about-chevron" />
            </button>

            {onSwitchToDesktopWeb && (
              <button
                type="button"
                className="dv-native-web-btn"
                onClick={onSwitchToDesktopWeb}
              >
                <span>Switch to full web presentation</span>
              </button>
            )}
          </div>
        </div>

        {/* Bottom Security Assurance */}
        <footer className="dv-native-footer">
          <ShieldCheck size={14} color="#16A34A" />
          <span>Hardware Isolated Protection • End-to-End Vaulting</span>
        </footer>
      </main>

      {/* About Us Bottom Sheet / Modal */}
      <AboutDocVaultModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
    </div>
  );
}
