import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { 
  ShieldCheck, AlertCircle, ArrowLeft, KeyRound, Fingerprint, 
  Lock, LogOut, ArrowRight, Clock, Users, ChevronDown, X, UserPlus 
} from "lucide-react";

import AuthLayout from "../components/AuthLayout";
import AuthHeader from "../components/AuthHeader";
import AuthAlert from "../components/AuthAlert";
import PinInput from "../components/PinInput";
import PinKeypad from "../components/PinKeypad";
import Modal from "../../../components/common/Modal/Modal";
import { apiRequest } from "../../../services/api";

export default function EnterPinPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [showSessionMenu, setShowSessionMenu] = useState(false);
  
  // Forgot PIN state
  const [showForgotPinModal, setShowForgotPinModal] = useState(false);
  const [forgotStep, setForgotStep] = useState("request"); // 'request' | 'verify'
  const [forgotOtp, setForgotOtp] = useState("");
  const [forgotNewPin, setForgotNewPin] = useState("");
  const [forgotConfirmPin, setForgotConfirmPin] = useState("");
  const [forgotPinLen, setForgotPinLen] = useState(4);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");

  const { 
    user, 
    pendingEmail, 
    pinLength: ctxPinLength, 
    savedSessions = [],
    switchSession,
    removeSavedSession,
    verifyPin, 
    setupCredentials,
    resetPinWithOtp,
    unlockWithBiometrics, 
    logout 
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const email = (
    location.state?.email ||
    pendingEmail ||
    user?.email ||
    sessionStorage.getItem("docvault_pending_email") ||
    localStorage.getItem("pending_pin_email") ||
    ""
  ).toLowerCase().trim();

  const initialPinLength = Number(
    location.state?.pinLength ||
    ctxPinLength ||
    user?.pinLength ||
    sessionStorage.getItem("docvault_pin_length") ||
    localStorage.getItem(`dv_pin_len_${email}`) ||
    4
  );
  const [pinLength, setPinLength] = useState(initialPinLength === 6 ? 6 : 4);

  // Setup PIN Mode for Google OAuth / new users without configured PIN
  const isSetupMode = Boolean(
    location.state?.isSetup ||
    location.state?.requiresPinSetup ||
    sessionStorage.getItem("docvault_requires_pin_setup") === "true" ||
    user?.pinSet === false
  );

  const [setupPin, setSetupPin] = useState("");
  const [setupConfirmPin, setSetupConfirmPin] = useState("");
  const [setupMasterPassword, setSetupMasterPassword] = useState("");
  const [setupPinLength, setSetupPinLength] = useState(4);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState("");

  const handleSetupCredentials = async (e) => {
    if (e) e.preventDefault();
    setSetupError("");

    if (setupPin.length !== setupPinLength) {
      setSetupError(`Please enter a complete ${setupPinLength}-digit PIN.`);
      return;
    }
    if (setupPin !== setupConfirmPin) {
      setSetupError("PIN and confirmation do not match.");
      return;
    }
    if (setupMasterPassword && setupMasterPassword.length < 8) {
      setSetupError("Master password must be at least 8 characters long.");
      return;
    }

    setSetupLoading(true);
    try {
      const res = await setupCredentials({
        email,
        pin: setupPin,
        password: setupMasterPassword.trim() || undefined,
      });

      if (res.success) {
        sessionStorage.removeItem("docvault_requires_pin_setup");
        navigate("/dashboard", { replace: true });
      } else {
        setSetupError(res.error || "Failed to set up vault PIN.");
      }
    } catch (err) {
      setSetupError(err.message || "Error setting up vault PIN.");
    } finally {
      setSetupLoading(false);
    }
  };

  // Check if this device has registered biometrics
  const hasBiometrics = Boolean(email && localStorage.getItem(`dv_bio_cred_${email}`));
  const [usePinFallback, setUsePinFallback] = useState(!hasBiometrics);

  // Redirect to login if no email exists anywhere
  useEffect(() => {
    if (email) {
      localStorage.setItem("pending_pin_email", email);
      sessionStorage.setItem("docvault_pending_email", email);
    } else {
      console.warn("[EnterPinPage] No email found for PIN verification. Redirecting to login.");
      navigate("/login", { replace: true, state: { message: "Please sign in with your email and password first." } });
    }
  }, [email, navigate]);

  // Check stored lockout state
  useEffect(() => {
    if (email) {
      const storedLock = localStorage.getItem(`dv_lock_until_${email}`);
      if (storedLock) {
        const remaining = Math.ceil((new Date(storedLock).getTime() - Date.now()) / 1000);
        if (remaining > 0) {
          setLockoutRemaining(remaining);
        } else {
          localStorage.removeItem(`dv_lock_until_${email}`);
        }
      }
    }
  }, [email]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const interval = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (email) localStorage.removeItem(`dv_lock_until_${email}`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutRemaining, email]);



  // Physical Keyboard support (standard digits, numpad, backspace, enter)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (lockoutRemaining > 0 || loading) return;

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (pin.length === pinLength) {
          handleUnlock(pin);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pin, pinLength, lockoutRemaining, loading]);

  const handleDigit = (digit) => {
    if (lockoutRemaining > 0 || loading) return;
    if (pin.length < pinLength) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setError("");

      // Auto-submit when length reached
      if (nextPin.length === pinLength) {
        handleUnlock(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    if (lockoutRemaining > 0 || loading) return;
    setPin((prev) => prev.slice(0, -1));
    setError("");
  };

  const handleClear = () => {
    if (lockoutRemaining > 0 || loading) return;
    setPin("");
    setError("");
  };

  const formatLockoutTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Forgot PIN handlers
  const handleSendResetPinOtp = async () => {
    setForgotLoading(true);
    setForgotError("");
    try {
      const res = await apiRequest("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ email, purpose: "reset_pin" }),
      });
      if (res.success) {
        if (res.devOtp) {
          setForgotOtp(res.devOtp);
        }
        setForgotStep("verify");
      } else {
        setForgotError(res.error || "Failed to send reset code.");
      }
    } catch (err) {
      setForgotError(err.message || "Error sending reset code.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetPinSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!forgotOtp.trim()) {
      setForgotError("Please enter the 6-digit code.");
      return;
    }
    if (forgotNewPin.length !== forgotPinLen) {
      setForgotError(`New PIN must be ${forgotPinLen} digits.`);
      return;
    }
    if (forgotNewPin !== forgotConfirmPin) {
      setForgotError("PIN confirmation does not match.");
      return;
    }

    setForgotLoading(true);
    setForgotError("");
    try {
      const res = await resetPinWithOtp(email, forgotOtp.trim(), forgotNewPin.trim());
      if (res.success) {
        setShowForgotPinModal(false);
        navigate("/dashboard", { replace: true });
      } else {
        setForgotError(res.error || "Failed to reset PIN.");
      }
    } catch (err) {
      setForgotError(err.message || "Error resetting PIN.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleUnlock = async (submittedPin = pin) => {
    if (lockoutRemaining > 0 || loading) return;

    if (submittedPin.length < pinLength) {
      setError(`Please enter your full ${pinLength}-digit PIN.`);
      return;
    }

    setLoading(true);
    setError("");

    const result = await verifyPin(email, submittedPin);
    setLoading(false);

    if (result.success) {
      localStorage.removeItem("pending_pin_email");
      if (email) localStorage.removeItem(`dv_lock_until_${email}`);
      navigate("/dashboard");
    } else {
      setPin("");
      if (result.remainingSeconds || result.lockUntil) {
        const secs = result.remainingSeconds || 300;
        setLockoutRemaining(secs);
        if (email && result.lockUntil) {
          localStorage.setItem(`dv_lock_until_${email}`, result.lockUntil);
        }
        setError(result.error || "Vault is locked for 5 minutes due to consecutive failed attempts.");
      } else {
        setError(result.error || "Incorrect Security PIN. Please try again.");
      }
    }
  };

  const handleBiometricUnlock = async () => {
    if (lockoutRemaining > 0 || bioLoading) return;
    setError("");
    setBioLoading(true);
    const result = await unlockWithBiometrics(email);
    setBioLoading(false);

    if (result.success) {
      localStorage.removeItem("pending_pin_email");
      if (email) localStorage.removeItem(`dv_lock_until_${email}`);
      navigate("/dashboard");
    } else {
      if (result.remainingSeconds || result.lockUntil) {
        setLockoutRemaining(result.remainingSeconds || 300);
      }
      setError(result.error || "Biometric authentication failed. Please enter your PIN.");
    }
  };

  const handleSwitchAccount = () => {
    logout();
    navigate("/login");
  };

  const handleSelectSession = (targetEmail) => {
    switchSession(targetEmail);
    setPin("");
    setError("");
    setShowSessionMenu(false);
  };

  const isLocked = lockoutRemaining > 0;
  const otherSessions = savedSessions.filter((s) => s.email.toLowerCase() !== email.toLowerCase());

  if (isSetupMode) {
    return (
      <AuthLayout brandVariant="pin">
        <button
          type="button"
          className="dv-step-back-btn"
          onClick={handleSwitchAccount}
          title="Sign in with another account"
        >
          <ArrowLeft size={15} />
          <span>Switch account</span>
        </button>

        <AuthHeader
          title="Set Up Your Vault Security"
          subtitle={`Welcome${location.state?.name ? `, ${location.state.name}` : ''}! Create your personal security PIN to encrypt and unlock your DocVault.`}
        />

        {email && (
          <div className="dv-auth-session-bar" style={{ marginBottom: '18px' }}>
            <div className="dv-auth-account-pill">
              <Lock size={13} className="dv-account-pill-icon" />
              <span className="dv-account-pill-email">{email}</span>
              <span className="dv-account-pill-badge" style={{ background: '#3B82F6', color: '#fff' }}>New Vault Setup</span>
            </div>
          </div>
        )}

        {setupError && <AuthAlert type="error" message={setupError} />}

        <form onSubmit={handleSetupCredentials} className="dv-auth-form">
          {/* PIN Length Selector */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
            <span style={{ fontSize: '13px', color: 'var(--color-auth-muted)' }}>PIN Length:</span>
            <button
              type="button"
              onClick={() => { setSetupPinLength(4); setSetupPin(""); setSetupConfirmPin(""); }}
              style={{
                padding: '5px 14px',
                borderRadius: '8px',
                border: setupPinLength === 4 ? '1.5px solid var(--color-primary, #0070F2)' : '1px solid var(--color-auth-border)',
                background: setupPinLength === 4 ? 'var(--color-primary, #0070F2)' : 'transparent',
                color: setupPinLength === 4 ? '#ffffff' : 'inherit',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px',
                transition: 'all 0.15s ease'
              }}
            >
              4 Digits
            </button>
            <button
              type="button"
              onClick={() => { setSetupPinLength(6); setSetupPin(""); setSetupConfirmPin(""); }}
              style={{
                padding: '5px 14px',
                borderRadius: '8px',
                border: setupPinLength === 6 ? '1.5px solid var(--color-primary, #0070F2)' : '1px solid var(--color-auth-border)',
                background: setupPinLength === 6 ? 'var(--color-primary, #0070F2)' : 'transparent',
                color: setupPinLength === 6 ? '#ffffff' : 'inherit',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '12px',
                transition: 'all 0.15s ease'
              }}
            >
              6 Digits
            </button>
          </div>

          {/* PIN Input 1 */}
          <div className="dv-auth-field-group">
            <label className="dv-auth-label">Choose Your Security PIN ({setupPinLength} digits)</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={setupPinLength}
              placeholder={`Enter ${setupPinLength}-digit PIN`}
              value={setupPin}
              onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, '').slice(0, setupPinLength))}
              className="dv-auth-input"
              autoFocus
              required
            />
          </div>

          {/* PIN Input 2 */}
          <div className="dv-auth-field-group">
            <label className="dv-auth-label">Confirm Your Security PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={setupPinLength}
              placeholder={`Confirm ${setupPinLength}-digit PIN`}
              value={setupConfirmPin}
              onChange={(e) => setSetupConfirmPin(e.target.value.replace(/\D/g, '').slice(0, setupPinLength))}
              className="dv-auth-input"
              required
            />
          </div>

          {/* Optional Master Password */}
          <div className="dv-auth-field-group">
            <label className="dv-auth-label">
              Master Password <span style={{ fontWeight: 400, opacity: 0.7 }}>(Optional - for emergency email sign in)</span>
            </label>
            <input
              type="password"
              placeholder="At least 8 characters (optional)"
              value={setupMasterPassword}
              onChange={(e) => setSetupMasterPassword(e.target.value)}
              className="dv-auth-input"
            />
          </div>

          <button
            type="submit"
            disabled={setupLoading || setupPin.length !== setupPinLength || setupConfirmPin.length !== setupPinLength}
            className="dv-auth-submit-btn"
            style={{ marginTop: '14px' }}
          >
            {setupLoading ? "Encrypting & Unlocking Vault..." : (
              <>
                <span>Save PIN & Access Dashboard</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout brandVariant="pin">
      <AuthHeader
        title="Unlock your vault."
        subtitle="Enter your personal security PIN to decrypt your documents."
      />

      {/* Account Email Identification Pill & Session Switcher */}
      {email && (
        <div className="dv-auth-session-bar">
          <div className="dv-auth-account-pill">
            <Lock size={13} className="dv-account-pill-icon" />
            <span className="dv-account-pill-email">{email}</span>
            <span className="dv-account-pill-badge">Session Locked</span>
          </div>

          {savedSessions.length > 1 && (
            <button
              type="button"
              onClick={() => setShowSessionMenu(!showSessionMenu)}
              className="dv-session-switch-toggle"
              title="Switch to another remembered session"
            >
              <Users size={12} />
              <span>Switch Session ({savedSessions.length})</span>
              <ChevronDown size={12} className={`dv-toggle-chevron ${showSessionMenu ? "dv-rotate-180" : ""}`} />
            </button>
          )}

          {/* Dropdown Menu of Saved Sessions */}
          {showSessionMenu && (
            <div className="dv-saved-sessions-list">
              <div className="dv-saved-sessions-header">
                <span>Remembered Sessions on this Device</span>
              </div>
              {savedSessions.map((s) => {
                const isCurrent = s.email.toLowerCase() === email.toLowerCase();
                return (
                  <div key={s.email} className={`dv-saved-session-item ${isCurrent ? 'dv-saved-session-item--current' : ''}`}>
                    <button
                      type="button"
                      className="dv-saved-session-btn"
                      onClick={() => {
                        if (!isCurrent) {
                          handleSelectSession(s.email);
                        }
                      }}
                    >
                      <div className="dv-session-avatar">
                        <span>{s.name?.[0]?.toUpperCase() || 'U'}</span>
                      </div>
                      <div className="dv-session-meta">
                        <strong>{s.name}</strong>
                        <small>{s.email}</small>
                      </div>
                      {isCurrent ? (
                        <span className="dv-session-current-pill">Current</span>
                      ) : (
                        <span className="dv-session-locked-pill">Locked</span>
                      )}
                    </button>
                    {!isCurrent && (
                      <button
                        type="button"
                        className="dv-session-remove-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSavedSession(s.email);
                        }}
                        title="Forget this session"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                className="dv-session-add-new-btn"
                onClick={handleSwitchAccount}
              >
                <UserPlus size={13} />
                <span>Sign in with another account</span>
              </button>
            </div>
          )}
        </div>
      )}

      {error && <AuthAlert type="error" message={error} />}

      {/* Lockout Warning State */}
      {isLocked ? (
        <div className="dv-lockout-box" role="alert">
          <Clock size={36} color="#C63B2E" />
          <h3 className="dv-lockout-title">Vault Temporarily Locked</h3>
          <p className="dv-lockout-desc">
            Too many consecutive incorrect attempts. Protection protocol active.
          </p>
          <div className="dv-lockout-timer">
            <span>Cooldown: <strong>{formatLockoutTime(lockoutRemaining)}</strong></span>
          </div>
        </div>
      ) : hasBiometrics && !usePinFallback ? (
        /* Biometric Unlock Option */
        <div className="dv-biometric-prompt">
          <button
            type="button"
            className="dv-biometric-circle"
            onClick={handleBiometricUnlock}
            disabled={bioLoading}
            title="Scan Fingerprint"
          >
            <Fingerprint size={48} />
          </button>
          <p className="dv-biometric-title">Touch ID / Fingerprint Ready</p>
          <span className="dv-biometric-sub">Tap the sensor to unlock your personal vault</span>

          <button
            type="button"
            onClick={() => setUsePinFallback(true)}
            className="dv-auth-switch-btn"
            style={{ marginTop: "16px" }}
          >
            Use Security PIN Instead
          </button>
        </div>
      ) : (
        /* PIN Input & Numeric Keypad */
        <div className="dv-pin-entry-container">
          <PinInput
            length={pinLength}
            value={pin}
            hasError={Boolean(error)}
            isMasked={true}
          />

          <PinKeypad
            onDigit={handleDigit}
            onBackspace={handleBackspace}
            onClear={handleClear}
            disabled={loading || isLocked}
          />

          <button
            type="button"
            onClick={() => handleUnlock(pin)}
            disabled={pin.length !== pinLength || loading || isLocked}
            className="dv-auth-submit-btn"
          >
            {loading ? "Decrypting vault..." : (
              <>
                <span>Unlock vault</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <button
            type="button"
            className="dv-forgot-pin-trigger"
            style={{
              background: "none",
              border: "none",
              color: "#60A5FA",
              fontSize: "13px",
              fontWeight: "500",
              cursor: "pointer",
              marginTop: "12px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 10px",
              borderRadius: "6px"
            }}
            onClick={() => {
              setShowForgotPinModal(true);
              setForgotStep("request");
              setForgotError("");
              setForgotOtp("");
              setForgotNewPin("");
              setForgotConfirmPin("");
            }}
          >
            <KeyRound size={14} />
            <span>Forgot Vault PIN?</span>
          </button>

          {hasBiometrics && (
            <button
              type="button"
              className="dv-switch-bio-btn"
              onClick={() => setUsePinFallback(false)}
            >
              <Fingerprint size={16} />
              <span>Use Biometric Sensor</span>
            </button>
          )}
        </div>
      )}

      <div className="dv-auth-footer-nav" style={{ marginTop: "24px" }}>
        <button
          type="button"
          onClick={handleSwitchAccount}
          className="dv-auth-footer-link dv-auth-switch-btn"
        >
          <LogOut size={14} />
          <span>Sign in to a different account</span>
        </button>
      </div>

      <div className="dv-auth-security-note">
        <ShieldCheck size={14} className="dv-auth-security-note-icon" />
        <span>Your documents. Your privacy. Your control.</span>
      </div>
      {/* Forgot PIN Recovery Modal */}
      <Modal
        isOpen={showForgotPinModal}
        onClose={() => setShowForgotPinModal(false)}
        title="Reset Vault PIN"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "4px 0" }}>
          {forgotError && (
            <div style={{ padding: "10px 12px", background: "rgba(220, 38, 38, 0.15)", border: "1px solid rgba(220, 38, 38, 0.3)", borderRadius: "8px", color: "#F87171", fontSize: "13px" }}>
              {forgotError}
            </div>
          )}

          {forgotStep === "request" ? (
            <div>
              <p style={{ fontSize: "14px", color: "var(--color-text-secondary, #94A3B8)", marginBottom: "16px", lineHeight: "1.5" }}>
                Forgot your vault PIN? We can send a secure 6-digit verification code to your registered email address (<strong>{email}</strong>).
              </p>
              <button
                type="button"
                className="dv-auth-submit-btn"
                onClick={handleSendResetPinOtp}
                disabled={forgotLoading}
              >
                {forgotLoading ? "Sending Code..." : "Send Verification Code"}
              </button>
            </div>
          ) : (
            <form onSubmit={handleResetPinSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <p style={{ fontSize: "13px", color: "var(--color-text-secondary, #94A3B8)", margin: 0 }}>
                Enter the 6-digit code sent to <strong>{email}</strong> and choose a new PIN.
              </p>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#CBD5E1", marginBottom: "6px" }}>
                  6-Digit OTP Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={forgotOtp}
                  onChange={(e) => setForgotOtp(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="123456"
                  style={{ width: "100%", padding: "10px 12px", background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "8px", color: "#FFF", fontSize: "16px", letterSpacing: "4px", textAlign: "center" }}
                  autoFocus
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "#CBD5E1" }}>
                  PIN Length Preference
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <button
                    type="button"
                    onClick={() => { setForgotPinLen(4); setForgotNewPin(""); setForgotConfirmPin(""); }}
                    style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "12px", background: forgotPinLen === 4 ? "#2563EB" : "rgba(255, 255, 255, 0.08)", color: "#FFF", border: "none", cursor: "pointer" }}
                  >
                    4 Digits
                  </button>
                  <button
                    type="button"
                    onClick={() => { setForgotPinLen(6); setForgotNewPin(""); setForgotConfirmPin(""); }}
                    style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "12px", background: forgotPinLen === 6 ? "#2563EB" : "rgba(255, 255, 255, 0.08)", color: "#FFF", border: "none", cursor: "pointer" }}
                  >
                    6 Digits
                  </button>
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#CBD5E1", marginBottom: "6px" }}>
                  New {forgotPinLen}-Digit PIN
                </label>
                <input
                  type="password"
                  maxLength={forgotPinLen}
                  value={forgotNewPin}
                  onChange={(e) => setForgotNewPin(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder={`Enter ${forgotPinLen} digits`}
                  style={{ width: "100%", padding: "10px 12px", background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "8px", color: "#FFF", fontSize: "16px", letterSpacing: "4px", textAlign: "center" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#CBD5E1", marginBottom: "6px" }}>
                  Confirm New PIN
                </label>
                <input
                  type="password"
                  maxLength={forgotPinLen}
                  value={forgotConfirmPin}
                  onChange={(e) => setForgotConfirmPin(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder={`Re-enter ${forgotPinLen} digits`}
                  style={{ width: "100%", padding: "10px 12px", background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "8px", color: "#FFF", fontSize: "16px", letterSpacing: "4px", textAlign: "center" }}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setForgotStep("request")}
                  style={{ flex: 1, padding: "10px", background: "rgba(255, 255, 255, 0.08)", border: "none", borderRadius: "8px", color: "#CBD5E1", cursor: "pointer", fontSize: "13px" }}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="dv-auth-submit-btn"
                  style={{ flex: 2 }}
                  disabled={forgotLoading || forgotNewPin.length !== forgotPinLen || forgotNewPin !== forgotConfirmPin}
                >
                  {forgotLoading ? "Resetting..." : "Save PIN & Unlock"}
                </button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </AuthLayout>
  );
}
