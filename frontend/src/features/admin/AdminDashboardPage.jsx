import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  ShieldCheck, HardDrive, Users, FileText, 
  Activity, RefreshCw, AlertCircle, CheckCircle2, 
  Clock, Database, Cpu, Eye, Lock, Layers,
  Search, ExternalLink, KeyRound, ShieldAlert
} from "lucide-react";
import { apiRequest } from "../../services/api";
import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import Skeleton from "../../components/common/Skeleton/Skeleton";
import "./AdminDashboardPage.css";

export default function AdminDashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("custodians"); // 'custodians' | 'audit' | 'storage'
  const [searchQuery, setSearchQuery] = useState("");

  const fetchAdminStats = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const res = await apiRequest("/api/vault/admin/stats");
      if (res?.success && res.data) {
        setData(res.data);
      } else {
        throw new Error(res?.error || "Failed to load admin stats");
      }
    } catch (err) {
      console.warn("[Admin] Error fetching stats:", err.message);
      setError("Unable to sync admin metrics. Ensure backend server is reachable.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAdminStats();
  }, []);

  const stats = data?.stats || {};
  const systemHealth = data?.systemHealth || {};
  const categoryStats = data?.categoryStats || [];
  const recentLogs = data?.recentLogs || [];
  const custodians = data?.custodians || [];

  const filteredCustodians = custodians.filter(
    (c) =>
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="dv-admin-page">
      <AppHeader
        title="Enclave Administration Console"
        subtitle="Platform telemetry, infrastructure health monitoring, and custodian directories."
      />

      <div className="dv-admin-content">
        {/* Top Control Bar */}
        <div className="dv-admin-hero">
          <div className="dv-admin-hero__info">
            <div className="dv-admin-badge">
              <span className="dv-admin-pulse" />
              <span>Platform Core v2.6 • Hardware Enclave Online</span>
            </div>
            <h2 className="dv-admin-hero__title">System Administration & Telemetry</h2>
            <p className="dv-admin-hero__desc">
              Monitor active custodian accounts, storage quotas, deterministic OCR pipelines, and cryptographic tamper logs.
            </p>
          </div>

          <div className="dv-admin-hero__actions">
            <button
              type="button"
              className={`dv-admin-refresh-btn ${refreshing ? "spinning" : ""}`}
              onClick={fetchAdminStats}
              disabled={refreshing}
            >
              <RefreshCw size={16} />
              <span>{refreshing ? "Syncing..." : "Refresh Telemetry"}</span>
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="dv-admin-alert" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* System Health Indicators */}
        <div className="dv-health-grid">
          <div className="dv-health-card">
            <div className="dv-health-card__icon dv-health-card__icon--emerald">
              <Database size={18} />
            </div>
            <div className="dv-health-card__meta">
              <span className="dv-health-label">Database Engine</span>
              <span className="dv-health-value">
                <span className="dv-health-dot dv-health-dot--green" />
                {systemHealth.database || "Operational (MongoDB Cloud)"}
              </span>
            </div>
          </div>

          <div className="dv-health-card">
            <div className="dv-health-card__icon dv-health-card__icon--blue">
              <Cpu size={18} />
            </div>
            <div className="dv-health-card__meta">
              <span className="dv-health-label">OCR & Ingestion</span>
              <span className="dv-health-value">
                <span className="dv-health-dot dv-health-dot--green" />
                {systemHealth.ocrPipeline || "Active (Sharp + Tesseract)"}
              </span>
            </div>
          </div>

          <div className="dv-health-card">
            <div className="dv-health-card__icon dv-health-card__icon--orange">
              <ShieldCheck size={18} />
            </div>
            <div className="dv-health-card__meta">
              <span className="dv-health-label">Privacy Policy Gate</span>
              <span className="dv-health-value">
                <span className="dv-health-dot dv-health-dot--green" />
                {systemHealth.privacyGate || "Strict STORAGE_ONLY Enforced"}
              </span>
            </div>
          </div>

          <div className="dv-health-card">
            <div className="dv-health-card__icon dv-health-card__icon--purple">
              <Lock size={18} />
            </div>
            <div className="dv-health-card__meta">
              <span className="dv-health-label">Cryptographic Core</span>
              <span className="dv-health-value">
                <span className="dv-health-dot dv-health-dot--green" />
                {systemHealth.encryptionEngine || "AES-256-GCM Dual Tier"}
              </span>
            </div>
          </div>
        </div>

        {/* KPI Metrics Grid */}
        <div className="dv-admin-kpi-grid">
          <Card padding="md" className="dv-admin-kpi-card">
            <div className="dv-admin-kpi-header">
              <span className="dv-admin-kpi-label">Vault Custodians</span>
              <Users size={18} color="#FD2B06" />
            </div>
            <div className="dv-admin-kpi-value">
              {loading ? <Skeleton width="50px" height="32px" /> : (stats.totalCustodians || 1)}
            </div>
            <span className="dv-admin-kpi-sub">Active identity accounts</span>
          </Card>

          <Card padding="md" className="dv-admin-kpi-card">
            <div className="dv-admin-kpi-header">
              <span className="dv-admin-kpi-label">Total Documents</span>
              <FileText size={18} color="#2563EB" />
            </div>
            <div className="dv-admin-kpi-value">
              {loading ? <Skeleton width="50px" height="32px" /> : (stats.totalDocuments || 0)}
            </div>
            <span className="dv-admin-kpi-sub">
              {stats.storageOnlyCount || 0} Storage-Only • {stats.processableCount || 0} Processed
            </span>
          </Card>

          <Card padding="md" className="dv-admin-kpi-card">
            <div className="dv-admin-kpi-header">
              <span className="dv-admin-kpi-label">Renewal Deadlines</span>
              <Clock size={18} color="#D97706" />
            </div>
            <div className="dv-admin-kpi-value">
              {loading ? <Skeleton width="50px" height="32px" /> : (stats.totalDeadlines || 0)}
            </div>
            <span className="dv-admin-kpi-sub">Active calendar monitors</span>
          </Card>

          <Card padding="md" className="dv-admin-kpi-card">
            <div className="dv-admin-kpi-header">
              <span className="dv-admin-kpi-label">Audit Log Records</span>
              <Activity size={18} color="#16A34A" />
            </div>
            <div className="dv-admin-kpi-value">
              {loading ? <Skeleton width="50px" height="32px" /> : (stats.totalAuditLogs || 0)}
            </div>
            <span className="dv-admin-kpi-sub">Tamper-evident trail</span>
          </Card>
        </div>

        {/* Section Panes with Tab Navigation */}
        <div className="dv-admin-tabs-section">
          <div className="dv-admin-tabs-bar">
            <button
              type="button"
              className={`dv-admin-tab-btn ${activeTab === "custodians" ? "active" : ""}`}
              onClick={() => setActiveTab("custodians")}
            >
              <Users size={16} />
              <span>Custodian Directory ({custodians.length})</span>
            </button>
            <button
              type="button"
              className={`dv-admin-tab-btn ${activeTab === "audit" ? "active" : ""}`}
              onClick={() => setActiveTab("audit")}
            >
              <Activity size={16} />
              <span>Security Audit Stream ({recentLogs.length})</span>
            </button>
            <button
              type="button"
              className={`dv-admin-tab-btn ${activeTab === "storage" ? "active" : ""}`}
              onClick={() => setActiveTab("storage")}
            >
              <HardDrive size={16} />
              <span>Category Distribution</span>
            </button>
          </div>

          {/* TAB 1: CUSTODIAN DIRECTORY */}
          {activeTab === "custodians" && (
            <Card padding="lg" className="dv-admin-pane-card">
              <div className="dv-admin-pane-header">
                <div>
                  <h3 className="dv-admin-pane-title">Registered Custodians</h3>
                  <p className="dv-admin-pane-sub">Enrolled vault accounts and isolation tiers.</p>
                </div>
                <div className="dv-admin-search-wrap">
                  <Search size={16} className="dv-admin-search-icon" />
                  <input
                    type="text"
                    className="dv-admin-search-input"
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {filteredCustodians.length === 0 ? (
                <div className="dv-admin-empty">
                  <p>No custodians match your search query.</p>
                </div>
              ) : (
                <div className="dv-table-container">
                  <table className="dv-admin-table">
                    <thead>
                      <tr>
                        <th>Custodian</th>
                        <th>Email</th>
                        <th>Vault Tier</th>
                        <th>Single Session</th>
                        <th>Joined</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustodians.map((c) => (
                        <tr key={c._id}>
                          <td>
                            <div className="dv-admin-user-cell">
                              <div className="dv-admin-avatar">
                                {c.name ? c.name[0].toUpperCase() : "U"}
                              </div>
                              <span className="dv-admin-user-name">{c.name || "Anonymous"}</span>
                            </div>
                          </td>
                          <td className="dv-admin-mono-cell">{c.email}</td>
                          <td>
                            <span className="dv-admin-tier-tag">
                              {c.tier || "Personal Enclave"}
                            </span>
                          </td>
                          <td>
                            {c.singleSessionOnly ? (
                              <span className="dv-status-chip dv-status-chip--green">Enforced</span>
                            ) : (
                              <span className="dv-status-chip dv-status-chip--gray">Standard</span>
                            )}
                          </td>
                          <td className="dv-admin-date-cell">
                            {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "Active"}
                          </td>
                          <td>
                            <span className="dv-admin-badge-active">
                              <CheckCircle2 size={12} color="#16A34A" />
                              <span>Verified</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* TAB 2: LIVE SECURITY AUDIT STREAM */}
          {activeTab === "audit" && (
            <Card padding="lg" className="dv-admin-pane-card">
              <div className="dv-admin-pane-header">
                <div>
                  <h3 className="dv-admin-pane-title">Cryptographic Audit Stream</h3>
                  <p className="dv-admin-pane-sub">Chronological append-only events stored for forensics and compliance.</p>
                </div>
              </div>

              {recentLogs.length === 0 ? (
                <div className="dv-admin-empty">
                  <p>No audit trail records logged yet.</p>
                </div>
              ) : (
                <div className="dv-audit-stream">
                  {recentLogs.map((log) => (
                    <div key={log._id} className="dv-audit-item">
                      <div className="dv-audit-item__left">
                        <span className={`dv-action-badge dv-action-badge--${log.action?.toLowerCase()}`}>
                          {log.action}
                        </span>
                        <div>
                          <div className="dv-audit-item__desc">
                            {log.documentTitle ? (
                              <span>Document: <strong>{log.documentTitle}</strong></span>
                            ) : (
                              <span>Event action executed by custodian</span>
                            )}
                          </div>
                          <div className="dv-audit-item__device">
                            <span>Client: {log.device || "Secure Web Client"}</span>
                          </div>
                        </div>
                      </div>
                      <div className="dv-audit-item__time">
                        <Clock size={12} />
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* TAB 3: CATEGORY & STORAGE BREAKDOWN */}
          {activeTab === "storage" && (
            <Card padding="lg" className="dv-admin-pane-card">
              <div className="dv-admin-pane-header">
                <div>
                  <h3 className="dv-admin-pane-title">Vault Document Categories</h3>
                  <p className="dv-admin-pane-sub">Distribution of uploaded files categorized by OCR rules.</p>
                </div>
              </div>

              {categoryStats.length === 0 ? (
                <div className="dv-admin-empty">
                  <p>No documents uploaded in the system yet.</p>
                </div>
              ) : (
                <div className="dv-category-grid">
                  {categoryStats.map((item, index) => (
                    <div key={index} className="dv-category-card">
                      <div className="dv-category-card__header">
                        <Layers size={18} color="#FD2B06" />
                        <span className="dv-category-card__count">{item.count}</span>
                      </div>
                      <h4 className="dv-category-card__name">{item.category}</h4>
                      <div className="dv-category-card__bar-wrap">
                        <div 
                          className="dv-category-card__bar" 
                          style={{ width: `${Math.min(100, Math.max(15, (item.count / (stats.totalDocuments || 1)) * 100))}%` }} 
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
