import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { 
  ShieldCheck, AlertCircle, ArrowLeft, KeyRound, Fingerprint, 
  Lock, LogOut, ArrowRight, Clock 
} from "lucide-react";

import AuthLayout from "../components/AuthLayout";
import AuthHeader from "../components/AuthHeader";
import AuthAlert from "../components/AuthAlert";
import PinInput from "../components/PinInput";
import PinKeypad from "../components/PinKeypad";
import Button from "../../../components/common/Button/Button";

export default function EnterPinPage() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  const { verifyPin, unlockWithBiometrics, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const email = location.state?.email || localStorage.getItem("pending_pin_email") || "";
  const initialPinLength = Number(location.state?.pinLength || localStorage.getItem(`dv_pin_len_${email}`) || 4);
  const [pinLength, setPinLength] = useState(initialPinLength === 6 ? 6 : 4);

  // Check if this device has registered biometrics
  const hasBiometrics = Boolean(email && localStorage.getItem(`dv_bio_cred_${email}`));
  const [usePinFallback, setUsePinFallback] = useState(!hasBiometrics);

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

  useEffect(() => {
    if (email) {
      localStorage.setItem("pending_pin_email", email);
    }
  }, [email]);

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

  const isLocked = lockoutRemaining > 0;

  return (
    <AuthLayout>
      <AuthHeader
        badgeText="Security Barrier 2"
        title="Unlock your vault"
        subtitle="Step 2: Enter your personal security PIN to decrypt your documents."
      />

      {/* Account Email Identification Pill */}
      {email && (
        <div className="dv-auth-account-pill">
          <Lock size={14} className="dv-account-pill-icon" />
          <span className="dv-account-pill-email">{email}</span>
        </div>
      )}

      {error && <AuthAlert type="error" message={error} />}

      {/* Lockout Warning State */}
      {isLocked ? (
        <div className="dv-lockout-box" role="alert">
          <Clock size={36} color="#DC2626" />
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

          <Button
            variant="outline"
            size="md"
            onClick={() => setUsePinFallback(true)}
            style={{ marginTop: "16px" }}
          >
            Use Security PIN Instead
          </Button>
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

          <Button
            variant="primary"
            size="lg"
            onClick={() => handleUnlock(pin)}
            loading={loading}
            disabled={pin.length !== pinLength || loading || isLocked}
            icon={ArrowRight}
            iconPosition="right"
            className="dv-auth-submit-btn"
          >
            {loading ? "Decrypting Vault..." : "Unlock Vault"}
          </Button>

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
        <ShieldCheck size={14} color="#059669" />
        <span>Protected by two-stage cryptographic authentication & PIN lock</span>
      </div>
    </AuthLayout>
  );
}
