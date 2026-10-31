import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, ShieldCheck, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import DocVaultLogo from "../../../components/common/DocVaultLogo/DocVaultLogo";
import Card from "../../../components/common/Card/Card";
import Button from "../../../components/common/Button/Button";
import { verifyEmailLinkSignIn } from "../../../services/firebase";
import { useAuth } from "../context/AuthContext";
import "./Auth.css";

export default function AuthVerifiedPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithFirebaseToken, register } = useAuth();

  const [status, setStatus] = useState("verifying"); // verifying, verified, error
  const [errorMessage, setErrorMessage] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    let timerId = null;

    async function completeAuth() {
      try {
        const cred = await verifyEmailLinkSignIn();
        if (cred && cred.idToken) {
          setUserEmail(cred.email);

          // Check if user was in middle of registering with name, password, pin
          const pendingReg = sessionStorage.getItem("docvault_pending_registration");
          let result;

          if (pendingReg) {
            try {
              const regData = JSON.parse(pendingReg);
              if (regData.email.toLowerCase() === cred.email.toLowerCase()) {
                result = await register(regData);
                sessionStorage.removeItem("docvault_pending_registration");
              }
            } catch (e) {
              console.warn("Failed to parse pending registration:", e);
            }
          }

          if (!result || !result.success) {
            result = await loginWithFirebaseToken(cred.idToken);
          }

          if (result && result.success) {
            setStatus("verified");
            // Auto redirect to enter-pin (Step 2 security) or dashboard after countdown
            const dest = result.requiresPin ? "/enter-pin" : "/dashboard";
            timerId = setInterval(() => {
              setCountdown((prev) => {
                if (prev <= 1) {
                  clearInterval(timerId);
                  navigate(dest, { state: { email: cred.email } });
                  return 0;
                }
                return prev - 1;
              });
            }, 1000);
          } else {
            setStatus("error");
            setErrorMessage(result?.error || "Vault account synchronization failed.");
          }
        } else {
          setStatus("error");
          setErrorMessage("Invalid or expired authentication link. Please request a new link.");
        }
      } catch (err) {
        setStatus("error");
        setErrorMessage(err.message || "Failed to verify authentication link.");
      }
    }

    completeAuth();

    return () => {
      if (timerId) clearInterval(timerId);
    };
  }, []);

  return (
    <div className="dv-auth-page-centered">
      <div className="dv-auth-container--pin" style={{ maxWidth: "440px" }}>
        <div className="dv-auth-brand" style={{ textAlign: "center", marginBottom: "24px" }}>
          <Link to="/">
            <DocVaultLogo height={42} />
          </Link>
        </div>

        <Card padding="lg" className="dv-auth-card" style={{ textAlign: "center" }}>
          {status === "verifying" && (
            <div style={{ padding: "24px 8px" }}>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "rgba(1, 90, 71, 0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                  color: "var(--color-primary)",
                }}
              >
                <Loader2 size={32} className="spin-animation" />
              </div>
              <h2 className="dv-auth-card__title" style={{ fontSize: "20px", marginBottom: "8px" }}>
                Verifying Secure Link...
              </h2>
              <p className="dv-auth-card__subtitle">
                Cryptographically authenticating your DocVault session without passwords.
              </p>
            </div>
          )}

          {status === "verified" && (
            <div style={{ padding: "16px 8px" }}>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "rgba(16, 185, 129, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                  color: "#10b981",
                }}
              >
                <CheckCircle2 size={36} />
              </div>

              <h2 className="dv-auth-card__title" style={{ fontSize: "22px", color: "var(--color-text-primary)", marginBottom: "8px" }}>
                Account Verified!
              </h2>

              <p className="dv-auth-card__subtitle" style={{ fontSize: "14px", marginBottom: "20px" }}>
                Welcome back, <strong style={{ color: "var(--color-primary)" }}>{userEmail}</strong>.<br />
                Your credentials have been securely verified.
              </p>

              <div
                style={{
                  padding: "12px",
                  borderRadius: "8px",
                  background: "var(--color-surface-secondary)",
                  border: "1px solid var(--color-border)",
                  fontSize: "13px",
                  color: "var(--color-text-secondary)",
                  marginBottom: "20px",
                }}
              >
                Redirecting to your vault overview in <strong>{countdown}s</strong>...
              </div>

              <Button
                variant="primary"
                size="lg"
                fullWidth
                icon={ArrowRight}
                iconPosition="right"
                onClick={() => navigate("/enter-pin", { state: { email: userEmail } })}
              >
                Proceed to Vault Unlock
              </Button>
            </div>
          )}

          {status === "error" && (
            <div style={{ padding: "16px 8px" }}>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "50%",
                  background: "rgba(220, 38, 38, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 20px",
                  color: "#dc2626",
                }}
              >
                <AlertCircle size={36} />
              </div>

              <h2 className="dv-auth-card__title" style={{ fontSize: "20px", color: "#dc2626", marginBottom: "8px" }}>
                Verification Failed
              </h2>

              <p className="dv-auth-card__subtitle" style={{ fontSize: "13.5px", marginBottom: "24px" }}>
                {errorMessage}
              </p>

              <Button
                variant="primary"
                size="md"
                fullWidth
                onClick={() => navigate("/login")}
              >
                Return to Login
              </Button>
            </div>
          )}
        </Card>

        <div className="dv-auth-security-notice" style={{ marginTop: "24px" }}>
          <ShieldCheck size={16} color="var(--color-primary)" />
          <span>Zero-Knowledge Architecture • Enterprise Encrypted Vault</span>
        </div>
      </div>
    </div>
  );
}

