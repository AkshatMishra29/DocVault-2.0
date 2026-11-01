import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/context/AuthContext";
import { apiRequest } from "../../services/api";
import { 
  ShieldCheck, Download, KeyRound, Smartphone, HardDrive, 
  Clock, LogOut, CheckCircle2, ChevronRight, Sparkles, Lock, 
  Shield, Fingerprint, FileText
} from "lucide-react";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import Skeleton from "../../components/common/Skeleton/Skeleton";

import "./MorePage.css";

export default function MorePage() {
  const { user, lockVault, logout, updateSessionPreference, registerBiometrics } = useAuth();
  const navigate = useNavigate();

  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [singleSession, setSingleSession] = useState(Boolean(user?.singleSessionOnly));
  const [autoLock, setAutoLock] = useState(user?.autoLockEnabled !== false);
  const [biometrics, setBiometrics] = useState(Boolean(user?.biometricsEnabled));
  const [savingSessionPref, setSavingSessionPref] = useState(false);
  const [savingAutoLockPref, setSavingAutoLockPref] = useState(false);
  const [registeringBio, setRegisteringBio] = useState(false);
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
    lockVault();
    navigate('/enter-pin', { state: { email: user?.email } });
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
        title="Settings & Audit Security"
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
              <Button variant="outline" size="sm" icon={Lock} onClick={handleLockVault}>
                Lock Vault Now
              </Button>
              <Button variant="danger" size="sm" icon={LogOut} onClick={logout}>
                Sign Out
              </Button>
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
    </div>
  );
}
