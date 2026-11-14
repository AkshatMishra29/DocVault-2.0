import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../../app/theme";
import { useAuth } from "../auth/context/AuthContext";
import { apiRequest } from "../../services/api";
import { 
  ShieldCheck, Download, KeyRound, Smartphone, HardDrive, 
  Clock, LogOut, CheckCircle2, ChevronRight, Sparkles, Lock, 
  Shield, Fingerprint, FileText, HelpCircle, Users, ArrowRightLeft
} from "lucide-react";
import AboutDocVaultModal from "../../components/common/AboutModal/AboutDocVaultModal";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import Skeleton from "../../components/common/Skeleton/Skeleton";

import "./MorePage.css";

export default function MorePage() {
  const { theme, setTheme } = useTheme();
  const { 
    user, 
    lockVault, 
    lockSession, 
    savedSessions, 
    switchSession, 
    removeSavedSession, 
    clearAllSavedSessions,
    logout, 
    updateSessionPreference, 
    registerBiometrics 
  } = useAuth();
  const navigate = useNavigate();

  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [singleSession, setSingleSession] = useState(Boolean(user?.singleSessionOnly));
  const [autoLock, setAutoLock] = useState(user?.autoLockEnabled !== false);
  const [biometrics, setBiometrics] = useState(Boolean(user?.biometricsEnabled));
  const [savingSessionPref, setSavingSessionPref] = useState(false);

  // Security credentials state
  const [activeSecTab, setActiveSecTab] = useState("pin"); // 'pin' | 'password'
  
  // Change PIN state
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [pinChangeLen, setPinChangeLen] = useState(user?.pinLength || 4);
  const [changingPin, setChangingPin] = useState(false);
  const [pinMessage, setPinMessage] = useState(null); // { type: 'success' | 'error', text: '' }

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState(null);
  const [savingAutoLockPref, setSavingAutoLockPref] = useState(false);
  const [registeringBio, setRegisteringBio] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [hasRegisteredBio, setHasRegisteredBio] = useState(() => {
    return Boolean(localStorage.getItem(`dv_bio_cred_${user?.email}`));
  });

  useEffect(() => {
    if (user?.singleSessionOnly !== undefined) {
      setSingleSession(Boolean(user.singleSessionOnly));
    }
    if (user?.autoLockEnabled !== undefined) {
      setAutoLock(user.autoLockEnabled !== false);
    }
    if (user?.biometricsEnabled !== undefined) {
      setBiometrics(Boolean(user.biometricsEnabled));
    }
    if (user?.email) {
      setHasRegisteredBio(Boolean(localStorage.getItem(`dv_bio_cred_${user?.email}`)));
    }
  }, [user?.singleSessionOnly, user?.autoLockEnabled, user?.biometricsEnabled, user?.email]);

  const handleChangePin = async (e) => {
    e.preventDefault();
    setPinMessage(null);

    if (!currentPin.trim()) {
      setPinMessage({ type: "error", text: "Please enter your current PIN." });
      return;
    }
    if (newPin.length !== pinChangeLen) {
      setPinMessage({ type: "error", text: `New PIN must be exactly ${pinChangeLen} digits.` });
      return;
    }
    if (newPin !== confirmNewPin) {
      setPinMessage({ type: "error", text: "New PIN and confirmation do not match." });
      return;
    }

    try {
      setChangingPin(true);
      const res = await apiRequest("/api/auth/change-pin", {
        method: "POST",
        body: JSON.stringify({ currentPin, newPin }),
      });
      if (res.success) {
        setPinMessage({ type: "success", text: "Vault PIN updated successfully." });
        setCurrentPin("");
        setNewPin("");
        setConfirmNewPin("");
      } else {
        setPinMessage({ type: "error", text: res.error || "Failed to update PIN." });
      }
    } catch (err) {
      setPinMessage({ type: "error", text: err.message || "Error updating PIN." });
    } finally {
      setChangingPin(false);
    }
  };

  const hasExistingPassword = user?.hasPassword !== false;

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (hasExistingPassword && !currentPassword) {
      setPasswordMessage({ type: "error", text: "Please enter your current password." });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMessage({ type: "error", text: "New password must be at least 8 characters long." });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordMessage({ type: "error", text: "New password and confirmation do not match." });
      return;
    }

    try {
      setChangingPassword(true);
      const res = await apiRequest("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ 
          currentPassword: hasExistingPassword ? currentPassword : "", 
          newPassword 
        }),
      });
      if (res.success) {
        setPasswordMessage({ 
          type: "success", 
          text: hasExistingPassword ? "Password updated successfully." : "Master password created successfully!" 
        });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
        if (user) {
          user.hasPassword = true;
          localStorage.setItem("docvault_user", JSON.stringify({ ...user, hasPassword: true }));
        }
      } else {
        setPasswordMessage({ type: "error", text: res.error || "Failed to change password." });
      }
    } catch (err) {
      setPasswordMessage({ type: "error", text: err.message || "Error changing password." });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleToggleSingleSession = async () => {
    const nextVal = !singleSession;
    setSavingSessionPref(true);
    const res = await updateSessionPreference({ singleSessionOnly: nextVal });
    setSavingSessionPref(false);
    if (res.success) {
      setSingleSession(res.singleSessionOnly);
    } else {
      alert("Failed to update session preferences: " + res.error);
    }
  };

  const handleToggleAutoLock = async () => {
    const nextVal = !autoLock;
    setSavingAutoLockPref(true);
    const res = await updateSessionPreference({ autoLockEnabled: nextVal });
    setSavingAutoLockPref(false);
    if (res.success) {
      setAutoLock(res.autoLockEnabled);
    } else {
      alert("Failed to update auto-lock preferences: " + res.error);
    }
  };

  const handleToggleBiometrics = async () => {
    if (!hasRegisteredBio) {
      handleRegisterFingerprint();
      return;
    }

    const nextVal = !biometrics;
    const res = await updateSessionPreference({ biometricsEnabled: nextVal });
    if (res.success) {
      setBiometrics(res.biometricsEnabled);
    } else {
      alert("Failed to update biometric preference: " + res.error);
    }
  };

  const handleRegisterFingerprint = async () => {
    setRegisteringBio(true);
    const res = await registerBiometrics(navigator.userAgent.includes("Mobile") ? "Mobile Device" : "Computer Sensor");
    setRegisteringBio(false);
    if (res.success) {
      setHasRegisteredBio(true);
      setBiometrics(true);
      alert("Biometric sensor enrolled successfully for this device!");
    } else {
      alert(res.error || "Failed to register biometric sensor.");
    }
  };

  const handleLockVault = () => {
    lockSession();
  };

  useEffect(() => {
    async function fetchAuditLogs() {
      try {
        setLoadingLogs(true);
        const res = await apiRequest("/api/vault/audit-trail");
        if (res.success && res.data) {
          setLogs(res.data);
        }
      } catch (err) {
        console.warn("Audit log fetch error:", err.message);
      } finally {
        setLoadingLogs(false);
      }
    }
    fetchAuditLogs();
  }, []);

  const handleExportVault = async () => {
    try {
      setExporting(true);
      const res = await apiRequest("/api/vault/export");
      if (res && res instanceof Response) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `docvault-backup-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      } else {
        alert("Failed to create vault export archive.");
      }
    } catch (err) {
      alert("Export failed: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="dv-settings-page">
      <AppHeader
        title="Settings"
        subtitle="Manage account credentials, two-tier isolation settings, and review immutable access logs."
      />

      <div className="dv-settings-content">
        <div className="dv-settings-grid">
          {/* Profile & Security Tier */}
          <Card padding="lg" className="dv-setting-card">
            <h3 className="dv-setting-card__title">Vault Account & Custodian Identity</h3>
            
            <div className="dv-setting-rows">
              <div className="dv-setting-row">
                <span className="dv-setting-label">Custodian Name:</span>
                <span className="dv-setting-val"><strong>{user?.name || "Vault Custodian"}</strong></span>
              </div>
              <div className="dv-setting-row">
                <span className="dv-setting-label">Registered Email:</span>
                <span className="dv-setting-val">{user?.email}</span>
              </div>
              <div className="dv-setting-row">
                <span className="dv-setting-label">Protection Tier:</span>
                <span className="dv-setting-val">
                  <Badge variant="success" size="sm">Vault Pro Isolated</Badge>
                </span>
              </div>
            </div>

            {/* Single Session Only Toggle */}
            <div className="dv-setting-toggle-row">
              <div>
                <span className="dv-toggle-title">Single Active Session</span>
                <span className="dv-toggle-sub">Automatically sign out other devices on login</span>
              </div>
              <button
                type="button"
                className={`dv-switch ${singleSession ? "dv-switch--active" : ""}`}
                disabled={savingSessionPref}
                onClick={handleToggleSingleSession}
                role="switch"
                aria-checked={singleSession}
              >
                <span className="dv-switch-thumb" />
              </button>
            </div>

            {/* Display Theme Mode Toggle */}
            <div className="dv-setting-toggle-row">
              <div>
                <span className="dv-toggle-title">Interface Appearance</span>
                <span className="dv-toggle-sub">Switch between Light, Dark, or System mode</span>
              </div>
              <div style={{ display: "flex", gap: "4px", background: "var(--color-surface-secondary)", padding: "3px", borderRadius: "8px" }}>
                <button
                  type="button"
                  onClick={() => setTheme("light")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    background: theme === "light" ? "var(--color-primary)" : "transparent",
                    color: theme === "light" ? "#FFF" : "var(--color-text-secondary)"
                  }}
                >
                  Light
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("dark")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    background: theme === "dark" ? "var(--color-primary)" : "transparent",
                    color: theme === "dark" ? "#FFF" : "var(--color-text-secondary)"
                  }}
                >
                  Dark
                </button>
                <button
                  type="button"
                  onClick={() => setTheme("system")}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    background: theme === "system" ? "var(--color-primary)" : "transparent",
                    color: theme === "system" ? "#FFF" : "var(--color-text-secondary)"
                  }}
                >
                  Auto
                </button>
              </div>
            </div>

            {/* Auto-Lock Toggle */}
            <div className="dv-setting-toggle-row">
              <div>
                <span className="dv-toggle-title">Inactivity Auto-Lock (10 Min)</span>
                <span className="dv-toggle-sub">Require PIN unlock after 10 minutes of inactivity</span>
              </div>
              <button
                type="button"
                className={`dv-switch ${autoLock ? "dv-switch--active" : ""}`}
                disabled={savingAutoLockPref}
                onClick={handleToggleAutoLock}
                role="switch"
                aria-checked={autoLock}
              >
                <span className="dv-switch-thumb" />
              </button>
            </div>

            {/* Biometric Unlock */}
            <div className="dv-setting-toggle-row">
              <div>
                <span className="dv-toggle-title">Fingerprint / Touch ID Sensor</span>
                <span className="dv-toggle-sub">
                  {hasRegisteredBio ? "Device sensor enrolled for quick PIN unlock" : "Enroll hardware authenticator on this device"}
                </span>
              </div>
              {hasRegisteredBio ? (
                <button
                  type="button"
                  className={`dv-switch ${biometrics ? "dv-switch--active" : ""}`}
                  onClick={handleToggleBiometrics}
                  role="switch"
                  aria-checked={biometrics}
                >
                  <span className="dv-switch-thumb" />
                </button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  loading={registeringBio}
                  icon={Fingerprint}
                  onClick={handleRegisterFingerprint}
                >
                  Enroll Sensor
                </Button>
              )}
            </div>

            {/* Lock Vault & Sign Out Actions */}
            <div className="dv-setting-card__actions">
              <Button variant="outline" size="sm" icon={Lock} onClick={handleLockVault} title="Lock session (⌘L)">
                Lock Session (⌘L)
              </Button>
              <Button variant="danger" size="sm" icon={LogOut} onClick={logout}>
                Sign Out
              </Button>
            </div>
          </Card>

          {/* Security & Credentials (Change PIN / Change Password) */}
          <Card padding="lg" className="dv-setting-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <KeyRound size={20} color="#3B82F6" />
                <h3 className="dv-setting-card__title" style={{ margin: 0 }}>Security Credentials</h3>
              </div>
              <div style={{ 
                display: "flex", 
                background: "var(--color-surface-secondary, rgba(255, 255, 255, 0.05))", 
                border: "1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1))",
                borderRadius: "8px", 
                padding: "3px" 
              }}>
                <button
                  type="button"
                  onClick={() => { setActiveSecTab("pin"); setPinMessage(null); }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    background: activeSecTab === "pin" ? "#2563EB" : "transparent",
                    color: activeSecTab === "pin" ? "#FFFFFF" : "var(--color-text-secondary, #94A3B8)",
                  }}
                >
                  Change PIN
                </button>
                <button
                  type="button"
                  onClick={() => { setActiveSecTab("password"); setPasswordMessage(null); }}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "none",
                    fontSize: "12px",
                    fontWeight: "600",
                    cursor: "pointer",
                    background: activeSecTab === "password" ? "#2563EB" : "transparent",
                    color: activeSecTab === "password" ? "#FFFFFF" : "var(--color-text-secondary, #94A3B8)",
                  }}
                >
                  {hasExistingPassword ? "Change Password" : "Set Master Password"}
                </button>
              </div>
            </div>

            {activeSecTab === "pin" ? (
              <form onSubmit={handleChangePin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {pinMessage && (
                  <div style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    background: pinMessage.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(220, 38, 38, 0.15)",
                    border: pinMessage.type === "success" ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(220, 38, 38, 0.3)",
                    color: pinMessage.type === "success" ? "#34D399" : "#F87171"
                  }}>
                    {pinMessage.text}
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--color-text-secondary, #CBD5E1)" }}>
                    New PIN Length
                  </label>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => { setPinChangeLen(4); setNewPin(""); setConfirmNewPin(""); }}
                      style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "12px", background: pinChangeLen === 4 ? "#2563EB" : "var(--color-surface-secondary, rgba(255, 255, 255, 0.08))", color: pinChangeLen === 4 ? "#FFF" : "var(--color-text-primary, #CBD5E1)", border: "none", cursor: "pointer" }}
                    >
                      4 Digits
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPinChangeLen(6); setNewPin(""); setConfirmNewPin(""); }}
                      style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "12px", background: pinChangeLen === 6 ? "#2563EB" : "var(--color-surface-secondary, rgba(255, 255, 255, 0.08))", color: pinChangeLen === 6 ? "#FFF" : "var(--color-text-primary, #CBD5E1)", border: "none", cursor: "pointer" }}
                    >
                      6 Digits
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--color-text-secondary, #CBD5E1)", marginBottom: "6px" }}>
                    Current PIN
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/[^0-9]/g, ""))}
                    placeholder="Enter current PIN"
                    style={{ width: "100%", padding: "10px 12px", background: "var(--color-surface-secondary, rgba(15, 23, 42, 0.6))", border: "1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.15))", borderRadius: "8px", color: "var(--color-text-primary, #FFF)", fontSize: "14px", letterSpacing: "2px" }}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--color-text-secondary, #CBD5E1)", marginBottom: "6px" }}>
                      New {pinChangeLen}-Digit PIN
                    </label>
                    <input
                      type="password"
                      maxLength={pinChangeLen}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder={`New ${pinChangeLen} digits`}
                      style={{ width: "100%", padding: "10px 12px", background: "var(--color-surface-secondary, rgba(15, 23, 42, 0.6))", border: "1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.15))", borderRadius: "8px", color: "var(--color-text-primary, #FFF)", fontSize: "14px", letterSpacing: "2px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--color-text-secondary, #CBD5E1)", marginBottom: "6px" }}>
                      Confirm New PIN
                    </label>
                    <input
                      type="password"
                      maxLength={pinChangeLen}
                      value={confirmNewPin}
                      onChange={(e) => setConfirmNewPin(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="Repeat new PIN"
                      style={{ width: "100%", padding: "10px 12px", background: "var(--color-surface-secondary, rgba(15, 23, 42, 0.6))", border: "1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.15))", borderRadius: "8px", color: "var(--color-text-primary, #FFF)", fontSize: "14px", letterSpacing: "2px" }}
                    />
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  loading={changingPin}
                  disabled={!currentPin || newPin.length !== pinChangeLen || newPin !== confirmNewPin}
                  style={{ alignSelf: "flex-start", marginTop: "4px" }}
                >
                  Update Vault PIN
                </Button>
              </form>
            ) : (
              <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {!hasExistingPassword && (
                  <div style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    background: "rgba(59, 130, 246, 0.1)",
                    border: "1px solid rgba(59, 130, 246, 0.25)",
                    color: "var(--color-primary, #3B82F6)"
                  }}>
                    You authenticated via Google Sign-In. You can create a Master Password below to enable direct email & password sign-in.
                  </div>
                )}

                {passwordMessage && (
                  <div style={{
                    padding: "10px 14px",
                    borderRadius: "8px",
                    fontSize: "13px",
                    background: passwordMessage.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(220, 38, 38, 0.15)",
                    border: passwordMessage.type === "success" ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid rgba(220, 38, 38, 0.3)",
                    color: passwordMessage.type === "success" ? "#34D399" : "#F87171"
                  }}>
                    {passwordMessage.text}
                  </div>
                )}

                {hasExistingPassword && (
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--color-text-secondary, #CBD5E1)", marginBottom: "6px" }}>
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      style={{ width: "100%", padding: "10px 12px", background: "var(--color-surface-secondary, rgba(15, 23, 42, 0.6))", border: "1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.15))", borderRadius: "8px", color: "var(--color-text-primary, #FFF)", fontSize: "14px" }}
                    />
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--color-text-secondary, #CBD5E1)", marginBottom: "6px" }}>
                      New Password (min 8 chars)
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      style={{ width: "100%", padding: "10px 12px", background: "var(--color-surface-secondary, rgba(15, 23, 42, 0.6))", border: "1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.15))", borderRadius: "8px", color: "var(--color-text-primary, #FFF)", fontSize: "14px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--color-text-secondary, #CBD5E1)", marginBottom: "6px" }}>
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Repeat new password"
                      style={{ width: "100%", padding: "10px 12px", background: "var(--color-surface-secondary, rgba(15, 23, 42, 0.6))", border: "1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.15))", borderRadius: "8px", color: "var(--color-text-primary, #FFF)", fontSize: "14px" }}
                    />
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  loading={changingPassword}
                  disabled={(hasExistingPassword && !currentPassword) || newPassword.length < 8 || newPassword !== confirmNewPassword}
                  style={{ alignSelf: "flex-start", marginTop: "4px" }}
                >
                  {hasExistingPassword ? "Update Account Password" : "Set Master Password"}
                </Button>
              </form>
            )}
          </Card>

          {/* Remembered Sessions & Switcher */}
          <Card padding="lg" className="dv-setting-card dv-sessions-card">
            <div className="dv-sessions-card__header">
              <div>
                <h3 className="dv-setting-card__title">Remembered Sessions</h3>
                <p className="dv-setting-desc">
                  Switch instantly to another account on this device or securely lock current session.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Badge variant="primary" size="sm">
                  {(savedSessions || []).filter(s => s && s.email && s.email.includes('@')).length} Saved
                </Badge>
                {(savedSessions || []).filter(s => s && s.email && s.email.includes('@')).length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Clear all saved accounts from this browser?")) {
                        clearAllSavedSessions();
                      }
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--color-text-muted, #94A3B8)",
                      fontSize: "11px",
                      cursor: "pointer",
                      textDecoration: "underline",
                      padding: "2px 6px"
                    }}
                    title="Clear saved sessions from device"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            <div className="dv-saved-sessions-list">
              {(savedSessions || []).filter(s => s && s.email && s.email.includes('@')).length > 0 ? (
                (savedSessions || []).filter(s => s && s.email && s.email.includes('@')).map((session) => {
                  const isCurrent = session.email?.toLowerCase() === user?.email?.toLowerCase();
                  const initials = (session.name || session.email || "U").slice(0, 2).toUpperCase();
                  return (
                    <div key={session.email} className={`dv-saved-session-row ${isCurrent ? "dv-saved-session-row--active" : ""}`}>
                      <div className="dv-saved-session-avatar">{initials}</div>
                      <div className="dv-saved-session-info">
                        <div className="dv-saved-session-title">
                          <strong>{session.name || "Vault Custodian"}</strong>
                          {isCurrent ? (
                            <span className="dv-session-tag-current">Active</span>
                          ) : (
                            <span className="dv-session-tag-locked">Locked</span>
                          )}
                        </div>
                        <div className="dv-saved-session-sub">
                          {session.email} • {session.pinLength || 4}-digit PIN
                        </div>
                      </div>
                      <div className="dv-saved-session-actions">
                        {!isCurrent ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              icon={ArrowRightLeft}
                              onClick={() => switchSession(session.email)}
                            >
                              Switch
                            </Button>
                            <button
                              type="button"
                              className="dv-saved-session-forget-btn"
                              title="Forget session from device"
                              onClick={() => removeSavedSession(session.email)}
                              aria-label={`Forget session for ${session.email}`}
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Lock}
                            onClick={handleLockVault}
                            title="Lock active session (⌘L)"
                          >
                            Lock
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ padding: "16px 8px", textAlign: "center", color: "var(--color-text-secondary, #94A3B8)", fontSize: "13px" }}>
                  {user?.email ? (
                    <span>Signed in as <strong>{user.email}</strong>. No other accounts remembered on this device.</span>
                  ) : (
                    <span>No saved accounts on this device.</span>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Backup & Export */}
          <Card padding="lg" className="dv-setting-card">
            <h3 className="dv-setting-card__title">Portable Vault Backup (JSON)</h3>
            <p className="dv-setting-desc">
              Download your complete encrypted metadata snapshot, asset links, and renewal deadlines as a standardized, offline-readable JSON bundle.
            </p>
            <div className="dv-export-box">
              <div className="dv-export-meta">
                <ShieldCheck size={20} color="#015A47" />
                <div>
                  <strong>Complete Vault Snapshot</strong>
                  <p>Includes document metadata, structured keyDetails, deadlines, and asset graph.</p>
                </div>
              </div>
              <Button
                variant="primary"
                size="md"
                icon={Download}
                loading={exporting}
                onClick={handleExportVault}
              >
                Export Complete Archive (.JSON)
              </Button>
            </div>
          </Card>
        </div>

        {/* Security Audit Trail Log */}
        <Card padding="lg" className="dv-audit-card">
          <div className="dv-audit-header">
            <div>
              <h3 className="dv-setting-card__title">Tamper-Proof Vault Access Log</h3>
              <p className="dv-setting-desc">
                Immutable ledger recording document inspection, downloads, uploads, and deletions.
              </p>
            </div>
            <Badge variant="primary" size="sm">{logs.length} Recent Event(s)</Badge>
          </div>

          {loadingLogs ? (
            <div className="dv-skeleton-list">
              <Skeleton height="40px" />
              <Skeleton height="40px" />
              <Skeleton height="40px" />
            </div>
          ) : logs.length === 0 ? (
            <p className="dv-text-muted">No security events logged in audit trail yet.</p>
          ) : (
            <div className="dv-audit-table">
              {logs.map((log) => (
                <div key={log._id} className="dv-audit-row">
                  <span className={`dv-audit-action dv-audit-action--${(log.action || '').toLowerCase()}`}>
                    {log.action}
                  </span>
                  <span className="dv-audit-doc">{log.documentTitle || "Vault Access"}</span>
                  <span className="dv-audit-device">{log.device ? log.device.slice(0, 30) : "Browser"}</span>
                  <span className="dv-audit-time">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <AboutDocVaultModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} />
    </div>
  );
}
