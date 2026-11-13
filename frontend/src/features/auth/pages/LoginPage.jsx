import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Mail, Lock, ArrowRight, ShieldCheck, HelpCircle, KeyRound, Sparkles, CheckCircle2 } from "lucide-react";
import AboutDocVaultModal from "../../../components/common/AboutModal/AboutDocVaultModal";
import Modal from "../../../components/common/Modal/Modal";
import { signInWithGoogle } from "../../../services/firebase";
import { triggerGoogleSignIn } from "../../../services/googleAuth";
import { apiRequest } from "../../../services/api";

import AuthLayout from "../components/AuthLayout";
import AuthHeader from "../components/AuthHeader";
import AuthAlert from "../components/AuthAlert";
import PasswordInput from "../components/PasswordInput";

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

export default function LoginPage() {
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState(() => location.state?.message || "");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);

  // Set / Reset Password & OTP Login Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPin, setNewPin] = useState("");
  const [resetStep, setResetStep] = useState(1); // 1 = request code, 2 = set password / sign in
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  const { login, loginWithGoogleToken, loginWithFirebaseToken } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please provide both email/ID and password.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    setLoading(true);
    const result = await login(cleanEmail, password);
    setLoading(false);

    if (result.success) {
      navigate("/enter-pin", { 
        state: { 
          email: result.user?.email || cleanEmail, 
          pinLength: result.user?.pinLength || 4 
        } 
      });
    } else {
      setError(result.error || "Authentication failed. Please check your credentials.");
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setInfoMessage("");
    setGoogleLoading(true);
    try {
      let idToken = null;
      let accessToken = null;
      let userEmail = null;

      // 1. Try direct Google Cloud OAuth popup window
      try {
        const googleRes = await triggerGoogleSignIn();
        if (googleRes?.idToken || googleRes?.accessToken) {
          idToken = googleRes.idToken;
          accessToken = googleRes.accessToken;
          userEmail = googleRes.email;
        }
      } catch (gErr) {
        console.warn("[GCP OAuth] Direct popup fallback:", gErr.message);
        // If popup was explicitly closed by user or blocked, inform user directly
        if (gErr.message.includes('popup was closed') || gErr.message.includes('Popup blocked')) {
          setError(gErr.message);
          setGoogleLoading(false);
          return;
        }
      }

      // 2. Fallback to Firebase Google popup if GCP popup could not be established
      if (!idToken && !accessToken) {
        const cred = await signInWithGoogle();
        if (cred && cred.idToken) {
          idToken = cred.idToken;
          userEmail = cred.email;
        }
      }

      if (idToken || accessToken) {
        // Authenticate with Google GCP endpoint or fallback
        let result = await loginWithGoogleToken(idToken, accessToken);
        if (!result.success && idToken) {
          result = await loginWithFirebaseToken(idToken);
        }

        if (result.success) {
          const targetEmail = userEmail || result.user?.email;
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
          setError(result.error || "Google authentication failed.");
        }
      }
    } catch (err) {
      setError(err.message || "Google authentication failed.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleOpenResetModal = () => {
    setResetEmail(email.trim() || "");
    setResetOtp("");
    setNewPassword("");
    setNewPin("");
    setResetError("");
    setResetSuccess("");
    setResetStep(1);
    setIsResetModalOpen(true);
  };

  // Step 1: Request 6-digit OTP
  const handleSendResetOtp = async (e) => {
    e.preventDefault();
    setResetError("");
    setResetSuccess("");

    if (!resetEmail.trim()) {
      setResetError("Please enter your email or username.");
      return;
    }

    setResetLoading(true);
    try {
      const res = await apiRequest("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ email: resetEmail.trim(), purpose: "reset_password" }),
      });
      if (res.success) {
        setResetSuccess(res.message || "Verification code dispatched to your email.");
        if (res.devOtp) {
          setResetOtp(res.devOtp);
        }
        setResetStep(2);
      } else {
        setResetError(res.error || "Failed to dispatch verification code.");
      }
    } catch (err) {
      setResetError(err.message || "Network error. Please try again.");
    } finally {
      setResetLoading(false);
    }
  };

  // Step 2: Submit OTP & Set New Password
  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setResetError("");
    setResetSuccess("");

    if (!resetOtp.trim() || !newPassword) {
      setResetError("Please provide both the 6-digit code and your new password.");
      return;
    }

    setResetLoading(true);
    try {
      const res = await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          email: resetEmail.trim(),
          otp: resetOtp.trim(),
          newPassword,
          newPin: newPin.trim() || undefined,
        }),
      });

      if (res.success) {
        setResetSuccess("Manual password set successfully! You can now log in.");
        setTimeout(() => {
          setIsResetModalOpen(false);
          setEmail(resetEmail);
          setPassword(newPassword);
          setInfoMessage("Manual password set! Sign in below with your new password.");
        }, 1500);
      } else {
        setResetError(res.error || "Password update failed. Please check your code.");
      }
    } catch (err) {
      setResetError(err.message || "Failed to update password.");
    } finally {
      setResetLoading(false);
    }
  };

  // Instant OTP Login without password
  const handleQuickOtpLogin = async () => {
    if (!resetOtp.trim()) {
      setResetError("Please enter the 6-digit verification code to sign in.");
      return;
    }
    setResetLoading(true);
    try {
      const res = await apiRequest("/api/auth/login-otp", {
        method: "POST",
        body: JSON.stringify({ email: resetEmail.trim(), otp: resetOtp.trim() }),
      });
      if (res.success && res.token) {
        localStorage.setItem("token", res.token);
        localStorage.setItem("docvault_token", res.token);
        if (res.user) {
          localStorage.setItem("docvault_user", JSON.stringify(res.user));
        }
        setIsResetModalOpen(false);
        navigate("/enter-pin", {
          state: {
            email: res.user?.email || resetEmail.trim(),
            pinLength: res.user?.pinLength || 4,
          },
        });
      } else {
        setResetError(res.error || "OTP login failed. Invalid or expired code.");
      }
    } catch (err) {
      setResetError(err.message || "OTP sign in error.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <AuthLayout brandVariant="login">
      <AuthHeader
        title="Welcome back."
        subtitle="Sign in to access your personal document vault."
      />

      {error && <AuthAlert type="error" message={error} />}
      {infoMessage && <AuthAlert type="info" message={infoMessage} />}

      {/* Google Sign In */}
      <button
        type="button"
        className="dv-auth-google-btn"
        onClick={handleGoogleSignIn}
        disabled={googleLoading || loading}
      >
        <GoogleIcon />
        <span>{googleLoading ? "Connecting to Google..." : "Sign in with Google"}</span>
      </button>

      {/* Divider */}
      <div className="dv-auth-divider">
        <span className="dv-auth-divider-line" />
        <span className="dv-auth-divider-text">or sign in with email</span>
        <span className="dv-auth-divider-line" />
      </div>

      <form onSubmit={handleSubmit} className="dv-auth-form">
        <PasswordInput
          label="Email Address or DocVault ID"
          type="text"
          name="email"
          icon={Mail}
          placeholder="name@example.com, username, or DocVault ID"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
          disabled={loading || googleLoading}
        />

        <PasswordInput
          label="Password (or Vault PIN)"
          type="password"
          name="password"
          icon={Lock}
          placeholder="Enter your password or 4-digit PIN"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          disabled={loading || googleLoading}
        />

        <div className="dv-auth-remember-row">
          <label className="dv-checkbox-label">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={loading || googleLoading}
            />
            <span className="dv-checkbox-custom" />
            <span className="dv-checkbox-text">Remember this device</span>
          </label>

          <button
            type="button"
            className="dv-auth-forgot-link"
            onClick={handleOpenResetModal}
            disabled={loading || googleLoading}
          >
            Forgot / Set Password?
          </button>
        </div>

        <button
          type="submit"
          disabled={loading || googleLoading}
          className="dv-auth-submit-btn"
        >
          {loading ? "Verifying credentials..." : (
            <>
              <span>Continue securely</span>
              <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>

      <div className="dv-auth-footer-nav">
        <span className="dv-auth-footer-text">Don't have an account? </span>
        <Link to="/register" className="dv-auth-footer-link">
          Create account
        </Link>
      </div>

      <div className="dv-auth-about-link-row">
        <button
          type="button"
          className="dv-auth-about-trigger"
          onClick={() => setIsAboutModalOpen(true)}
        >
          <HelpCircle size={14} color="#0070F2" />
          <span>Know about DocVault • Sovereign Security Architecture</span>
        </button>
      </div>

      <div className="dv-auth-security-note">
        <ShieldCheck size={14} className="dv-auth-security-note-icon" />
        <span>Your documents. Your privacy. Your control.</span>
      </div>

      {/* Set / Reset Manual Password & Quick OTP Login Modal */}
      <Modal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        title="Set or Reset Manual Password"
        maxWidth="460px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ fontSize: "13.5px", color: "var(--color-text-secondary, #556B82)", margin: 0, lineHeight: 1.5 }}>
            If you originally created your vault with Google OAuth, use this to set your manual password and 4-digit PIN for direct login anytime.
          </p>

          {resetError && <AuthAlert type="error" message={resetError} />}
          {resetSuccess && <AuthAlert type="success" message={resetSuccess} />}

          {resetStep === 1 ? (
            <form onSubmit={handleSendResetOtp} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <PasswordInput
                label="Registered Email or Username"
                type="text"
                name="resetEmail"
                icon={Mail}
                placeholder="name@example.com or username"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
                disabled={resetLoading}
              />

              <button
                type="submit"
                className="dv-auth-submit-btn"
                disabled={resetLoading || !resetEmail.trim()}
              >
                {resetLoading ? "Dispatching OTP..." : "Send Verification Code"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleResetSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ fontSize: "12.5px", color: "#10B981", display: "flex", alignItems: "center", gap: "6px" }}>
                <CheckCircle2 size={14} />
                <span>Verification code dispatched to {resetEmail}</span>
              </div>

              <PasswordInput
                label="6-Digit Verification Code"
                type="text"
                name="resetOtp"
                icon={KeyRound}
                placeholder="Enter 6-digit OTP"
                value={resetOtp}
                onChange={(e) => setResetOtp(e.target.value)}
                required
                disabled={resetLoading}
              />

              <PasswordInput
                label="New Master Password"
                type="password"
                name="newPassword"
                icon={Lock}
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={resetLoading}
              />

              <PasswordInput
                label="Vault Security PIN (Optional)"
                type="password"
                name="newPin"
                icon={ShieldCheck}
                placeholder="4 or 6 digits (e.g. 1234)"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                disabled={resetLoading}
              />

              <button
                type="submit"
                className="dv-auth-submit-btn"
                disabled={resetLoading || !resetOtp.trim() || !newPassword}
              >
                {resetLoading ? "Updating credentials..." : "Set Password & Save"}
              </button>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px" }}>
                <button
                  type="button"
                  onClick={handleQuickOtpLogin}
                  disabled={resetLoading || !resetOtp.trim()}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#0070F2",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0
                  }}
                >
                  ⚡ Or Instant OTP Login
                </button>
                <button
                  type="button"
                  onClick={() => setResetStep(1)}
                  style={{ background: "none", border: "none", color: "#64748B", fontSize: "12px", cursor: "pointer" }}
                >
                  Resend code
                </button>
              </div>
            </form>
          )}
        </div>
      </Modal>

      <AboutDocVaultModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
      />
    </AuthLayout>
  );
}
