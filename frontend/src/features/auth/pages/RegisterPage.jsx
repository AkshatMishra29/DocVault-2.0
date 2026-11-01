import React, { useState, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../../../services/api";
import { 
  User, Mail, Lock, Phone, KeyRound, ShieldCheck, ArrowRight 
} from "lucide-react";
import { signInWithGoogle } from "../../../services/firebase";

import AuthLayout from "../components/AuthLayout";
import AuthHeader from "../components/AuthHeader";
import AuthAlert from "../components/AuthAlert";
import PasswordInput from "../components/PasswordInput";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import PinStrengthIndicator from "../components/PinStrengthIndicator";
import { analyzePasswordStrength } from "../../shield/services/passwordStrengthService";
import { analyzePinSecurity } from "../../shield/services/pinSecurityService";

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

export default function RegisterPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { loginWithFirebaseToken } = useAuth();

  // Pre-fill state if returning from /verify-otp
  const [formData, setFormData] = useState(() => ({
    name: location.state?.formData?.name || "",
    email: location.state?.formData?.email || "",
    password: location.state?.formData?.password || "",
    confirmPassword: location.state?.formData?.confirmPassword || "",
    pinLength: location.state?.formData?.pinLength || 4,
    pin: location.state?.formData?.pin || "",
    confirmPin: location.state?.formData?.confirmPin || "",
    phone: location.state?.formData?.phone || "",
  }));

  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Live Heuristic Password Advice
  const pwdAdvice = useMemo(() => {
    if (!formData.password) return null;
    return analyzePasswordStrength(formData.password);
  }, [formData.password]);

  // Live Heuristic PIN Security Advice
  const pinAdvice = useMemo(() => {
    if (!formData.pin || formData.pin.length < 2) return null;
    return analyzePinSecurity(formData.pin, formData.pinLength);
  }, [formData.pin, formData.pinLength]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePinLengthChange = (length) => {
    const num = Number(length);
    setFormData((prev) => ({
      ...prev,
      pinLength: num,
      pin: prev.pin.slice(0, num),
      confirmPin: prev.confirmPin.slice(0, num),
    }));
  };

  const handlePinChange = (field, val) => {
    const clean = val.replace(/\D/g, "").slice(0, Number(formData.pinLength));
    handleChange(field, clean);
  };

  const handleGoogleSignUp = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      const cred = await signInWithGoogle();
      if (cred && cred.idToken) {
        const result = await loginWithFirebaseToken(cred.idToken);
        if (result.success) {
          navigate("/enter-pin", { state: { email: cred.email } });
        } else {
          setError(result.error || "Google authentication failed.");
        }
      } else {
        setInfoMessage("Google OAuth will activate once client credentials are configured. Please create account with email.");
      }
    } catch (err) {
      setError(err.message || "Google authentication failed.");
    } finally {
      setGoogleLoading(false);
    }
  };

  // Submit registration form -> Send OTP and navigate to /verify-otp
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError("");
    setInfoMessage("");

    if (!formData.name || !formData.email || !formData.password || !formData.confirmPassword || !formData.pin || !formData.confirmPin) {
      setError("Please fill out all required fields.");
      return;
    }

    if (formData.password.length < 8) {
      setError("Master password must be at least 8 characters long.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Master password and confirmation do not match.");
      return;
    }

    if (formData.pin.length !== Number(formData.pinLength)) {
      setError(`Vault Security PIN must be exactly ${formData.pinLength} digits.`);
      return;
    }

    if (formData.pin !== formData.confirmPin) {
      setError("Vault Security PIN and confirmation do not match.");
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

      // Navigate to dedicated OTP verification page
      navigate("/verify-otp", {
        state: {
          formData,
          infoMessage: `A 6-digit verification code has been dispatched to ${formData.email}.`
        }
      });
    } catch (err) {
      setError(err.message || "Failed to send verification code. Please check your email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout 
      cardClassName="dv-auth-form-card--register" 
      brandVariant="register"
    >
      <AuthHeader
        title="Create your account"
        subtitle="Create an account to access your secure document vault."
      />

      {error && <AuthAlert type="error" message={error} />}
      {infoMessage && <AuthAlert type="info" message={infoMessage} />}

      {/* Continue with Google */}
      <button
        type="button"
        className="dv-auth-google-btn"
        onClick={handleGoogleSignUp}
        disabled={googleLoading || loading}
      >
        <GoogleIcon />
        <span>{googleLoading ? "Connecting to Google..." : "Continue with Google"}</span>
      </button>

      {/* Divider */}
      <div className="dv-auth-divider">
        <span className="dv-auth-divider-line" />
        <span className="dv-auth-divider-text">or create account with email</span>
        <span className="dv-auth-divider-line" />
      </div>

      <form onSubmit={handleRequestOtp} className="dv-auth-form dv-auth-form--register">
        <div className="dv-reg-grid">
          {/* Row 1: Full Name & Email Address */}
          <div>
            <PasswordInput
              label="Full Name"
              type="text"
              name="name"
              icon={User}
              placeholder="Enter your full name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              required
              autoComplete="name"
              disabled={loading || googleLoading}
            />
          </div>

          <div>
            <PasswordInput
              label="Email Address"
              type="email"
              name="email"
              icon={Mail}
              placeholder="name@example.com"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              required
              autoComplete="email"
              disabled={loading || googleLoading}
            />
          </div>

          {/* Row 2: Master Password & Confirm Password */}
          <div>
            <PasswordInput
              label="Master Password"
              type="password"
              name="password"
              icon={Lock}
              placeholder="Create master password"
              value={formData.password}
              onChange={(e) => handleChange("password", e.target.value)}
              required
              autoComplete="new-password"
              disabled={loading || googleLoading}
            />
          </div>

          <div>
            <PasswordInput
              label="Confirm Password"
              type="password"
              name="confirmPassword"
              icon={Lock}
              placeholder="Confirm master password"
              value={formData.confirmPassword}
              onChange={(e) => handleChange("confirmPassword", e.target.value)}
              required
              autoComplete="new-password"
              disabled={loading || googleLoading}
            />
          </div>

          {/* Password Strength Meter (Only when typing) */}
          {formData.password && (
            <div className="dv-reg-col-full">
              <PasswordStrengthMeter advice={pwdAdvice} />
            </div>
          )}

          {/* Row 3: Vault PIN & Confirm PIN with inline toggle */}
          <div>
            <PasswordInput
              label="Vault PIN"
              labelRight={
                <div className="dv-pin-len-toggle">
                  <button
                    type="button"
                    className={`dv-pin-len-btn ${formData.pinLength === 4 ? "dv-pin-len-btn--active" : ""}`}
                    onClick={() => handlePinLengthChange(4)}
                  >
                    4D
                  </button>
                  <button
                    type="button"
                    className={`dv-pin-len-btn ${formData.pinLength === 6 ? "dv-pin-len-btn--active" : ""}`}
                    onClick={() => handlePinLengthChange(6)}
                  >
                    6D
                  </button>
                </div>
              }
              type="password"
              name="pin"
              icon={KeyRound}
              placeholder={`Enter ${formData.pinLength}-digit PIN`}
              value={formData.pin}
              onChange={(e) => handlePinChange("pin", e.target.value)}
              maxLength={formData.pinLength}
              required
              inputMode="numeric"
              pattern="[0-9]*"
              disabled={loading || googleLoading}
            />
          </div>

          <div>
            <PasswordInput
              label="Confirm PIN"
              type="password"
              name="confirmPin"
              icon={KeyRound}
              placeholder={`Confirm ${formData.pinLength}-digit PIN`}
              value={formData.confirmPin}
              onChange={(e) => handlePinChange("confirmPin", e.target.value)}
              maxLength={formData.pinLength}
              required
              inputMode="numeric"
              pattern="[0-9]*"
              disabled={loading || googleLoading}
            />
          </div>

          {/* PIN Strength Indicator (Only when typing) */}
          {pinAdvice && (
            <div className="dv-reg-col-full">
              <PinStrengthIndicator advice={pinAdvice} />
            </div>
          )}

          {/* Row 4: Phone Number (Optional) */}
          <div className="dv-reg-col-full">
            <PasswordInput
              label="Phone Number (Optional)"
              type="tel"
              name="phone"
              icon={Phone}
              placeholder="Enter contact phone number"
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              autoComplete="tel"
              disabled={loading || googleLoading}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || googleLoading}
          className="dv-auth-submit-btn"
        >
          {loading ? "Dispatching code..." : (
            <>
              <span>Create account</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <div className="dv-auth-footer-nav">
        <span className="dv-auth-footer-text">Already have an account? </span>
        <Link to="/login" className="dv-auth-footer-link">
          Sign in
        </Link>
      </div>

      <div className="dv-auth-security-note">
        <ShieldCheck size={14} className="dv-auth-security-note-icon" />
        <span>Your documents. Your privacy. Your control.</span>
      </div>
    </AuthLayout>
  );
}
