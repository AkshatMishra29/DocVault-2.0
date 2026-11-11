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

export default function EnterPinPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [showSessionMenu, setShowSessionMenu] = useState(false);

  const { 
    user, 
    pendingEmail, 
    pinLength: ctxPinLength, 
    savedSessions = [],
    switchSession,
    removeSavedSession,
    verifyPin, 
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
    </AuthLayout>
  );
}
