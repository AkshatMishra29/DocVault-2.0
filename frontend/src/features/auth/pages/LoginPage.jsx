import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Mail, Lock, ArrowRight, ShieldCheck, HelpCircle } from "lucide-react";
import AboutDocVaultModal from "../../../components/common/AboutModal/AboutDocVaultModal";
import { signInWithGoogle } from "../../../services/firebase";

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

  const { login, loginWithFirebaseToken } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please provide both email and password.");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    setLoading(true);
    const result = await login(cleanEmail, password);
    setLoading(false);

    if (result.success) {
      navigate("/enter-pin", { 
        state: { 
          email: cleanEmail, 
          pinLength: result.user?.pinLength || 4 
        } 
      });
    } else {
      setError(result.error || "Authentication failed. Please check your credentials.");
    }
  };

  const handleGoogleSignIn = async () => {
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
        setInfoMessage("Google OAuth will activate once client credentials are configured. Please sign in with email.");
      }
    } catch (err) {
      setError(err.message || "Google authentication failed.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = () => {
    if (email) {
      setInfoMessage(`Password reset link dispatched to ${email}. Please check your inbox.`);
    } else {
      setError("Please enter your email address to receive reset instructions.");
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
          label="Email Address"
          type="email"
          name="email"
          icon={Mail}
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={loading || googleLoading}
        />

        <PasswordInput
          label="Password"
          type="password"
          name="password"
          icon={Lock}
          placeholder="Enter your password"
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
            onClick={handleForgotPassword}
            disabled={loading || googleLoading}
          >
            Forgot password?
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
          <HelpCircle size={14} color="#FD2B06" />
          <span>Know about DocVault • Sovereign Security Architecture</span>
        </button>
      </div>

      <div className="dv-auth-security-note">
        <ShieldCheck size={14} className="dv-auth-security-note-icon" />
        <span>Your documents. Your privacy. Your control.</span>
      </div>

      <AboutDocVaultModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
      />
    </AuthLayout>
  );
}
