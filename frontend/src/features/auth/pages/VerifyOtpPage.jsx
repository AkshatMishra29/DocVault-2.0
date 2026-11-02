import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import AuthHeader from "../components/AuthHeader";
import AuthAlert from "../components/AuthAlert";
import OtpInput from "../components/OtpInput";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../../../services/api";
import { Mail, ArrowRight, ArrowLeft, ShieldCheck } from "lucide-react";
import "./Auth.css";

export default function VerifyOtpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { register } = useAuth();

  const formData = location.state?.formData || location.state?.pendingRegistration;
  const initialInfo = location.state?.infoMessage || "";

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState(initialInfo);
  const [resendCooldown, setResendCooldown] = useState(60);

  // If user reaches this page directly without registration data, redirect to register
  useEffect(() => {
    if (!formData || !formData.email) {
      navigate("/register", { replace: true });
    }
  }, [formData, navigate]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleVerifyOtpAndRegister = async (e) => {
    if (e) e.preventDefault();
    setError("");

    if (!otp || otp.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      const result = await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        pinLength: formData.pinLength,
        pin: formData.pin,
        phone: formData.phone,
        otp: otp.trim(),
      });

      if (result.success) {
        // Only after account is verified, proceed to dashboard
        navigate("/dashboard", { replace: true });
      } else {
        setError(result.error || "Verification failed. Please check the code and try again.");
      }
    } catch (err) {
      setError(err.message || "An unexpected error occurred during account verification.");
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

      if (!res.ok) {
        throw new Error(res.error || res.message || "Failed to resend code.");
      }

      setInfoMessage("A fresh 6-digit verification code has been dispatched to your email!");
      setResendCooldown(60);
      setOtp("");
    } catch (err) {
      setError(err.message || "Failed to resend verification code.");
    } finally {
      setResending(false);
    }
  };

  if (!formData || !formData.email) {
    return null;
  }

  return (
    <AuthLayout brandVariant="otp">
      {/* Return to Registration / Edit Details */}
      <button
        type="button"
        className="dv-step-back-btn"
        onClick={() => navigate("/register", { state: { formData } })}
        title="Edit registration details"
      >
        <ArrowLeft size={15} />
        <span>Back to registration</span>
      </button>

      <AuthHeader
        title="Verify your email."
        subtitle="We've sent a 6-digit verification code to your email address."
      />

      {/* Verified Email Target Pill */}
      <div className="dv-account-pill">
        <Mail size={14} className="dv-account-pill-icon" />
        <span className="dv-account-pill-email">{formData.email}</span>
      </div>

      {error && <AuthAlert type="error" message={error} />}
      {infoMessage && !error && <AuthAlert type="info" message={infoMessage} />}

      <form onSubmit={handleVerifyOtpAndRegister} className="dv-auth-form">
        <OtpInput
          value={otp}
          onChange={(val) => {
            setOtp(val);
            if (val.length === 6) {
              setError("");
            }
          }}
          disabled={loading}
          hasError={Boolean(error)}
        />

        <button
          type="submit"
          disabled={otp.length !== 6 || loading}
          className="dv-auth-submit-btn"
        >
          {loading ? (
            "Verifying & accessing vault..."
          ) : (
            <>
              <span>Verify & Access Dashboard</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
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

      <div className="dv-auth-security-note">
        <ShieldCheck size={14} className="dv-auth-security-note-icon" />
        <span>Your documents. Your privacy. Your control.</span>
      </div>
    </AuthLayout>
  );
}

