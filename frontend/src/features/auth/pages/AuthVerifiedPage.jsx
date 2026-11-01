import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, ShieldCheck, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import AuthLayout from "../components/AuthLayout";
import AuthHeader from "../components/AuthHeader";
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
    <AuthLayout brandVariant="otp">
      {status === "verifying" && (
        <div style={{ textAlign: "center", padding: "20px 8px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "rgba(253, 43, 6, 0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              color: "var(--color-auth-cta, #FD2B06)",
            }}
          >
            <Loader2 size={32} className="spin-animation" />
          </div>
          <AuthHeader
            title="Verifying link..."
            subtitle="Cryptographically validating your authentication session."
          />
        </div>
      )}

      {status === "verified" && (
        <div style={{ textAlign: "center", padding: "16px 8px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "rgba(40, 122, 82, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              color: "var(--color-auth-success, #287A52)",
            }}
          >
            <CheckCircle2 size={36} />
          </div>

          <AuthHeader
            title="Account verified!"
            subtitle={`Welcome back, ${userEmail}. Your credentials have been authenticated.`}
          />

          <div
            style={{
              padding: "12px",
              borderRadius: "10px",
              background: "var(--color-auth-panel-light, #F2ECE6)",
              border: "1px solid var(--color-auth-border, #D8CCC3)",
              fontFamily: "var(--font-ui, 'Manrope', sans-serif)",
              fontSize: "13px",
              color: "var(--color-auth-text-dark, #1C1310)",
              marginBottom: "20px",
            }}
          >
            Redirecting in <strong>{countdown}s</strong>...
          </div>

          <button
            type="button"
            className="dv-auth-submit-btn"
            onClick={() => navigate("/enter-pin", { state: { email: userEmail } })}
          >
            <span>Proceed to vault unlock</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {status === "error" && (
        <div style={{ textAlign: "center", padding: "16px 8px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              color: "var(--color-auth-error, #C63B2E)",
            }}
          >
            <AlertCircle size={36} />
          </div>

          <AuthHeader
            title="Link verification failed"
            subtitle={errorMessage}
          />

          <button
            type="button"
            className="dv-auth-submit-btn"
            onClick={() => navigate("/login")}
          >
            <span>Return to sign in</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      <div className="dv-auth-security-note">
        <ShieldCheck size={14} className="dv-auth-security-note-icon" />
        <span>Your documents. Your privacy. Your control.</span>
      </div>
    </AuthLayout>
  );
}
