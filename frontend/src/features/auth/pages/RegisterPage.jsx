import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../../../services/api";
import { 
  User, Mail, Lock, Phone, KeyRound, ShieldCheck, ArrowRight, 
  ArrowLeft, RefreshCw, Sparkles 
} from "lucide-react";

import AuthLayout from "../components/AuthLayout";
import AuthHeader from "../components/AuthHeader";
import AuthAlert from "../components/AuthAlert";
import PasswordInput from "../components/PasswordInput";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import PinStrengthIndicator from "../components/PinStrengthIndicator";
import OtpInput from "../components/OtpInput";
import Button from "../../../components/common/Button/Button";
import { analyzePasswordStrength } from "../../shield/services/passwordStrengthService";
import { analyzePinSecurity } from "../../shield/services/pinSecurityService";

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    pinLength: 4, // 4 or 6 digits
    pin: "",
    phone: "",
  });

  const [step, setStep] = useState("form"); // "form" | "otp"
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

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

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePinLengthChange = (length) => {
    const num = Number(length);
    setFormData((prev) => ({
      ...prev,
      pinLength: num,
      pin: prev.pin.slice(0, num),
    }));
  };

  const handlePinChange = (val) => {
    const clean = val.replace(/\D/g, "").slice(0, Number(formData.pinLength));
    handleChange("pin", clean);
  };

  // Step 1: Send 6-Digit OTP to User's Email
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError("");
    setInfoMessage("");

    if (!formData.name || !formData.email || !formData.password || !formData.pin) {
      setError("Please fill out all required fields.");
      return;
    }

    if (formData.pin.length !== Number(formData.pinLength)) {
      setError(`Vault Security PIN must be exactly ${formData.pinLength} digits.`);
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
      setResendCooldown(60);
      const timer = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      setInfoMessage(`A 6-digit verification code has been dispatched to ${formData.email}.`);
    } catch (err) {
      setError(err.message || "Failed to send verification code. Please check your email.");
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
      setError(err.message || "An unexpected error occurred during account registration.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || resending) return;
    setError("");
    setResending(true);
    try {
      const res = await apiRequest("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ email: formData.email, purpose: "register" }),
      });
      if (!res.ok) throw new Error(res.error || "Failed to resend code.");
      setInfoMessage("A fresh verification code has been dispatched!");
      setResendCooldown(60);
    } catch (err) {
      setError(err.message || "Failed to resend verification code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthLayout>
      {step === "form" ? (
        <>
          <AuthHeader
            badgeText="Sovereign Vault Account"
            title="Create your vault"
            subtitle="Set up two-stage cryptographic protection for your personal records."
          />

          {error && <AuthAlert type="error" message={error} />}

          <form onSubmit={handleRequestOtp} className="dv-auth-form">
            <PasswordInput
              label="Full Name"
              type="text"
              name="name"
              icon={User}
              placeholder="e.g. John Doe"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              required
              autoComplete="name"
              disabled={loading}
            />

            <PasswordInput
              label="Email Address"
              type="email"
              name="email"
              icon={Mail}
              placeholder="your.email@domain.com"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
            />

            <div className="dv-form-field-wrap">
              <PasswordInput
                label="Master Password"
                type="password"
                name="password"
                icon={Lock}
                placeholder="Minimum 8 characters"
                value={formData.password}
                onChange={(e) => handleChange("password", e.target.value)}
                required
                autoComplete="new-password"
                disabled={loading}
              />
              <PasswordStrengthMeter advice={pwdAdvice} />
            </div>

            {/* PIN Configuration: 4 vs 6 Digits */}
            <div className="dv-pin-config-section">
              <div className="dv-pin-config-header">
                <label className="dv-input-label">
                  Vault Security PIN <span className="dv-required-star">*</span>
                </label>
                <div className="dv-pin-len-toggle">
                  <button
                    type="button"
                    className={`dv-pin-len-btn ${formData.pinLength === 4 ? "dv-pin-len-btn--active" : ""}`}
                    onClick={() => handlePinLengthChange(4)}
                  >
                    4 Digits
                  </button>
                  <button
                    type="button"
                    className={`dv-pin-len-btn ${formData.pinLength === 6 ? "dv-pin-len-btn--active" : ""}`}
                    onClick={() => handlePinLengthChange(6)}
                  >
                    6 Digits
                  </button>
                </div>
              </div>

              <PasswordInput
                type="password"
                name="pin"
                icon={KeyRound}
                placeholder={`${formData.pinLength}-digit numeric passcode`}
                value={formData.pin}
                onChange={(e) => handlePinChange(e.target.value)}
                maxLength={formData.pinLength}
                required
                inputMode="numeric"
                pattern="[0-9]*"
                disabled={loading}
              />
              <PinStrengthIndicator advice={pinAdvice} />
            </div>

            <PasswordInput
              label="Phone Number (Optional)"
              type="tel"
              name="phone"
              icon={Phone}
              placeholder="+91 98765 43210"
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              autoComplete="tel"
              disabled={loading}
            />

            <Button
              variant="primary"
              size="lg"
              type="submit"
              loading={loading}
              icon={ArrowRight}
              iconPosition="right"
              className="dv-auth-submit-btn"
            >
              {loading ? "Dispatching OTP..." : "Continue to Verification"}
            </Button>
          </form>

          <div className="dv-auth-footer-nav">
            <span className="dv-auth-footer-text">Already registered your vault? </span>
            <Link to="/login" className="dv-auth-footer-link">
              Sign in
            </Link>
          </div>
        </>
      ) : (
        /* Step 2: Email OTP Verification */
        <>
          <button
            type="button"
            className="dv-step-back-btn"
            onClick={() => setStep("form")}
            title="Edit registration details"
          >
            <ArrowLeft size={15} />
            <span>Edit details</span>
          </button>

          <AuthHeader
            badgeText="Step 2: Email Verification"
            title="Verify your email"
            subtitle={`Enter the six-digit code sent to ${formData.email}`}
          />

          {error && <AuthAlert type="error" message={error} />}
          {infoMessage && <AuthAlert type="info" message={infoMessage} />}

          <form onSubmit={handleVerifyOtpAndRegister} className="dv-auth-form">
            <OtpInput
              value={otp}
              onChange={setOtp}
              disabled={loading}
              hasError={Boolean(error)}
            />

            <Button
              variant="primary"
              size="lg"
              type="submit"
              loading={loading}
              disabled={otp.length !== 6 || loading}
              icon={ArrowRight}
              iconPosition="right"
              className="dv-auth-submit-btn"
            >
              {loading ? "Creating Vault Account..." : "Complete Vault Setup"}
            </Button>
          </form>

          <div className="dv-resend-box">
            <span className="dv-resend-text">Didn't receive the code? </span>
            <button
              type="button"
              className="dv-resend-btn"
              onClick={handleResendOtp}
              disabled={resendCooldown > 0 || resending}
            >
              {resending ? (
                "Sending..."
              ) : resendCooldown > 0 ? (
                `Resend in ${resendCooldown}s`
              ) : (
                "Resend verification code"
              )}
            </button>
          </div>
        </>
      )}

      <div className="dv-auth-security-note">
        <ShieldCheck size={14} color="#059669" />
        <span>Protected by two-stage cryptographic authentication & PIN lock</span>
      </div>
    </AuthLayout>
  );
}
