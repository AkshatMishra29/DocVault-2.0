import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Mail, Lock, ArrowRight, ShieldCheck } from "lucide-react";

import AuthLayout from "../components/AuthLayout";
import AuthHeader from "../components/AuthHeader";
import AuthAlert from "../components/AuthAlert";
import PasswordInput from "../components/PasswordInput";
import Button from "../../../components/common/Button/Button";

export default function LoginPage() {
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState(() => location.state?.message || "");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please provide both email and password.");
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result.success) {
      navigate("/enter-pin", { 
        state: { 
          email, 
          pinLength: result.user?.pinLength || 4 
        } 
      });
    } else {
      setError(result.error || "Authentication failed. Please check your credentials.");
    }
  };

  return (
    <AuthLayout>
      <AuthHeader
        badgeText="Secure Authentication"
        title="Welcome back"
        subtitle="Sign in to continue to your secure document vault."
      />

      {error && <AuthAlert type="error" message={error} />}
      {infoMessage && <AuthAlert type="info" message={infoMessage} />}

      <form onSubmit={handleSubmit} className="dv-auth-form">
        <PasswordInput
          label="Email Address"
          type="email"
          name="email"
          icon={Mail}
          placeholder="your.email@domain.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={loading}
        />

        <PasswordInput
          label="Vault Password"
          type="password"
          name="password"
          icon={Lock}
          placeholder="••••••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          disabled={loading}
        />

        <div className="dv-auth-remember-row">
          <label className="dv-checkbox-label">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={loading}
            />
            <span className="dv-checkbox-custom" />
            <span className="dv-checkbox-text">Remember this device</span>
          </label>
        </div>

        <Button
          variant="primary"
          size="lg"
          type="submit"
          loading={loading}
          icon={ArrowRight}
          iconPosition="right"
          className="dv-auth-submit-btn"
        >
          {loading ? "Verifying Credentials..." : "Continue to Vault"}
        </Button>
      </form>

      <div className="dv-auth-footer-nav">
        <span className="dv-auth-footer-text">Don't have a vault account? </span>
        <Link to="/register" className="dv-auth-footer-link">
          Create vault
        </Link>
      </div>

      <div className="dv-auth-security-note">
        <ShieldCheck size={14} color="#059669" />
        <span>Protected by two-stage cryptographic authentication & PIN lock</span>
      </div>
    </AuthLayout>
  );
}
