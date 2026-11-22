import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/context/AuthContext";
import { apiRequest, API_BASE_URL } from "../../services/api";
import {
  Share2, ShieldCheck, Lock, Clock, Eye, Download, Sparkles, Plus,
  Trash2, AlertTriangle, Key, ExternalLink, MessageSquare, Check, X,
  FileText, Users, ArrowRight, RefreshCw, Send, CheckCircle2, Copy,
  Calendar, HardDrive, Shield, Edit3, Activity, AlertCircle, FileCheck,
  ZoomIn, ZoomOut, RotateCw, Loader2
} from "lucide-react";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import Input from "../../components/common/Input/Input";
import Modal from "../../components/common/Modal/Modal";
import EmptyState from "../../components/common/EmptyState/EmptyState";
import Skeleton from "../../components/common/Skeleton/Skeleton";
import DocumentTypeIcon from "../../components/common/DocumentTypeIcon/DocumentTypeIcon";

import "./ShareCenterPage.css";

export default function ShareCenterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Active Tab: 'OVERVIEW' | 'SENT' | 'RECEIVED' | 'PRIVATE' | 'ACTIVITY' | 'SMART_PACK'
  const [activeTab, setActiveTab] = useState("OVERVIEW");

  // Core Data
  const [overviewData, setOverviewData] = useState(null);
  const [sentShares, setSentShares] = useState([]);
  const [receivedShares, setReceivedShares] = useState([]);
  const [privateDocs, setPrivateDocs] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [userDocs, setUserDocs] = useState([]);
  const [userConnections, setUserConnections] = useState([]);

  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [myDocVaultId, setMyDocVaultId] = useState(() => {
    return user?.docVaultId || (() => {
      try {
        const stored = JSON.parse(localStorage.getItem('docvault_user') || localStorage.getItem('user') || '{}');
        return stored.docVaultId || '';
      } catch {
        return '';
      }
    })();
  });

  // Direct Share Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [shareForm, setShareForm] = useState({
    purpose: "",
    documentIds: [],
    recipientUserId: "",
    recipientEmail: "",
    shareType: "CONNECTION",
    permissions: { view: true, download: false },
    expiresInHours: 24,
    password: "",
    otpRequired: false,
    watermarkEnabled: true,
    watermarkCustomText: "",
    redactTermsText: "",
  });

  const [recipientInput, setRecipientInput] = useState("");
  const [verifiedRecipient, setVerifiedRecipient] = useState(null);
  const [verifyingRecipient, setVerifyingRecipient] = useState(false);
  const [recipientVerifyError, setRecipientVerifyError] = useState("");
  const [createdShareResult, setCreatedShareResult] = useState(null);

  // Edit Permissions / Expiry Modal State
  const [editingShare, setEditingShare] = useState(null);
  const [editPermissions, setEditPermissions] = useState({ view: true, download: false });
  const [editExpiryHours, setEditExpiryHours] = useState("24");
  const [savingEdit, setSavingEdit] = useState(false);

  // Document Activity Timeline Modal State
  const [viewingDocActivity, setViewingDocActivity] = useState(null);
  const [docActivityLogs, setDocActivityLogs] = useState([]);
  const [docActivityLoading, setDocActivityLoading] = useState(false);

  // Smart Pack State
  const [smartPurpose, setSmartPurpose] = useState("");
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartResult, setSmartResult] = useState(null);
  const [selectedSmartDocs, setSelectedSmartDocs] = useState([]);

  // Instant Quick Preview Modal State (Shared With Me)
  const [quickPreview, setQuickPreview] = useState(null); // { share, doc }
  const [previewZoom, setPreviewZoom] = useState(100);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState(false);

  const handleOpenQuickPreview = (share, doc) => {
    setQuickPreview({ share, doc });
    setPreviewZoom(100);
    setPreviewRotation(0);
    setPreviewLoading(true);
    setPreviewError(false);
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  async function fetchAllData() {
    try {
      setLoading(true);
      const [overviewRes, sentRes, recvRes, privateRes, activityRes, docsRes, connRes, meRes] = await Promise.all([
        apiRequest("/api/sharing/access-overview").catch(() => ({ data: null })),
        apiRequest("/api/shares/sent").catch(() => ({ data: [] })),
        apiRequest("/api/shares/received").catch(() => ({ data: [] })),
        apiRequest("/api/sharing/private-documents").catch(() => ({ data: [] })),
        apiRequest("/api/sharing/all-activity?limit=30").catch(() => ({ data: [] })),
        apiRequest("/api/documents").catch(() => ({ data: [] })),
        apiRequest("/api/connections").catch(() => ({ data: [] })),
        user?.docVaultId ? Promise.resolve(null) : apiRequest("/api/auth/me").catch(() => null),
      ]);

      if (overviewRes?.data) setOverviewData(overviewRes.data);
      setSentShares(sentRes.data || []);
      setReceivedShares(recvRes.data || []);
      setPrivateDocs(privateRes.data || []);
      setActivityLogs(activityRes.data || []);
      setUserDocs(docsRes.data || []);
      setUserConnections(connRes.data || []);

      if (meRes?.success && meRes.user?.docVaultId) {
        setMyDocVaultId(meRes.user.docVaultId);
      }
    } catch (err) {
      console.warn("Failed to load access management data:", err.message);
    } finally {
      setLoading(false);
    }
  }

  const copyMyId = () => {
    if (myDocVaultId) {
      navigator.clipboard.writeText(myDocVaultId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleVerifyRecipientInput = async (val) => {
    const q = val !== undefined ? val : recipientInput;
    if (!q || !q.trim()) {
      setVerifiedRecipient(null);
      setRecipientVerifyError("");
      return;
    }

    setVerifyingRecipient(true);
    setRecipientVerifyError("");
    try {
      let res = await apiRequest(`/api/sharing/lookup-recipient?q=${encodeURIComponent(q.trim())}`);
      if (!res.success && res.error && res.error.includes("Cast to ObjectId")) {
        res = await apiRequest(`/api/shares/lookup-recipient?q=${encodeURIComponent(q.trim())}`);
      }
      if (res.success && res.data) {
        setVerifiedRecipient(res.data);
        setRecipientVerifyError("");
      } else {
        setVerifiedRecipient(null);
        setRecipientVerifyError(res.error || "User not found. Enter a valid DocVault ID or email.");
      }
    } catch (err) {
      setVerifiedRecipient(null);
      setRecipientVerifyError(err.message || "User lookup failed.");
    } finally {
      setVerifyingRecipient(false);
    }
  };

  // Direct Share Submission
  const handleCreateShareSubmit = async (e) => {
    e.preventDefault();
    if (shareForm.documentIds.length === 0) {
      alert("Please select at least one document to share.");
      return;
    }

    setSubmitting(true);
    try {
      const terms = shareForm.redactTermsText
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const redactionInstructions = {};
      if (terms.length > 0) {
        shareForm.documentIds.forEach((id) => {
          redactionInstructions[id] = { termsToRedact: terms, fieldsToMask: [] };
        });
      }

      const targetUserId = verifiedRecipient?.id || shareForm.recipientUserId || null;
      const targetEmail = verifiedRecipient?.email || (recipientInput.includes('@') ? recipientInput.trim() : shareForm.recipientEmail) || null;
      const targetDocVaultId = verifiedRecipient?.docVaultId || (!recipientInput.includes('@') && recipientInput.trim() ? recipientInput.trim() : null);

      const payload = {
        documentIds: shareForm.documentIds,
        purpose: shareForm.purpose || "Secure Document Access",
        shareType: shareForm.shareType,
        recipientUserId: targetUserId,
        recipientDocVaultId: targetDocVaultId,
        recipientEmail: targetEmail,
        expiresInHours: Number(shareForm.expiresInHours),
        permissions: shareForm.permissions,
        password: shareForm.password || null,
        otpRequired: shareForm.otpRequired,
        watermarkEnabled: shareForm.watermarkEnabled,
        watermarkCustomText: shareForm.watermarkCustomText || null,
        redactionInstructions,
      };

      const res = await apiRequest("/api/shares", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.success && res.data) {
        setCreatedShareResult(res.data);
        fetchAllData();
      } else {
        alert(res.error || res.message || "Failed to authorize share. Please check recipient details and try again.");
      }
    } catch (err) {
      alert("Failed to create share: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Immediate Revocation
  const handleRevokeShare = async (shareId) => {
    if (!window.confirm("Are you sure you want to revoke this share? All future preview, download and AI access will be blocked immediately.")) return;

    try {
      const res = await apiRequest(`/api/shares/${shareId}`, { method: "DELETE" });
      if (res.success) {
        setSentShares((prev) =>
          prev.map((s) => (s._id === shareId ? { ...s, status: "REVOKED" } : s))
        );
        fetchAllData();
      } else {
        alert(res.error || "Failed to revoke share.");
      }
    } catch (err) {
      alert("Failed to revoke share: " + err.message);
    }
  };

  // Open Edit Modal for a Share
  const handleOpenEditShare = (share) => {
    setEditingShare(share);
    setEditPermissions({
      view: share.permissions?.view !== false,
      download: Boolean(share.permissions?.download),
    });
    setEditExpiryHours("24");
  };

  // Save Edit Permissions / Expiry
  const handleSaveEditShare = async (e) => {
    e.preventDefault();
    if (!editingShare) return;

    setSavingEdit(true);
    try {
      const res = await apiRequest(`/api/shares/${editingShare._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          permissions: editPermissions,
          expiresInHours: Number(editExpiryHours),
        }),
      });

      if (res.success) {
        alert("Share permissions and expiry updated successfully!");
        setEditingShare(null);
        fetchAllData();
      } else {
        alert(res.error || "Failed to update share.");
      }
    } catch (err) {
      alert("Error updating share: " + err.message);
    } finally {
      setSavingEdit(false);
    }
  };

  // Open Document Activity History Modal
  const handleOpenDocActivity = async (docId, title) => {
    setViewingDocActivity({ docId, title });
    setDocActivityLoading(true);
    try {
      const res = await apiRequest(`/api/sharing/audit/${docId}`);
      if (res.success && res.data) {
        setDocActivityLogs(res.data);
      } else {
        setDocActivityLogs([]);
      }
    } catch (err) {
      setDocActivityLogs([]);
    } finally {
      setDocActivityLoading(false);
    }
  };

  // Pre-select a private document for direct share
  const handleDirectShareDoc = (doc) => {
    setCreatedShareResult(null);
    setShareForm((prev) => ({
      ...prev,
      purpose: `Share: ${doc.title}`,
      documentIds: [doc._id],
      permissions: { view: true, download: false },
    }));
    setShowCreateModal(true);
  };

  // Smart Pack Handlers
  const handleSmartPackSuggest = async (e) => {
    e.preventDefault();
    if (!smartPurpose.trim()) return;

    setSmartLoading(true);
    setSmartResult(null);
    try {
      const res = await apiRequest("/api/shares/suggest-pack", {
        method: "POST",
        body: JSON.stringify({ purpose: smartPurpose }),
      });
      if (res.success && res.data) {
        setSmartResult(res.data);
        setSelectedSmartDocs(res.data.suggestedDocuments.map((d) => d.documentId));
      }
    } catch (err) {
      alert("Smart Pack suggestion error: " + err.message);
    } finally {
      setSmartLoading(false);
    }
  };

  const handleProceedWithSmartPack = () => {
    if (!smartResult) return;
    setCreatedShareResult(null);
    setShareForm((prev) => ({
      ...prev,
      purpose: smartResult.suggestedTitle,
      documentIds: selectedSmartDocs,
    }));
    setShowCreateModal(true);
  };

  return (
    <div className="dv-share-center">
      <AppHeader
        title="Document Access Management"
        subtitle="Manage secure direct shares, incoming access, private vault files, and audit history."
      />

      {/* Hero Card: Prominently display User's DocVault Sharing ID */}
      <div className="dv-my-id-card">
        <div className="dv-my-id-card__left">
          <div className="dv-my-id-badge-icon">
            <ShieldCheck size={22} className="dv-shield-icon" />
          </div>
          <div className="dv-my-id-details">
            <span className="dv-my-id-label">YOUR DOCVAULT SHARING ID</span>
            <div className="dv-my-id-code-row">
              <span className="dv-my-id-code">{myDocVaultId || "Loading ID..."}</span>
              <button
                type="button"
                className="dv-copy-id-btn"
                onClick={copyMyId}
                disabled={!myDocVaultId}
                title="Copy DocVault ID to clipboard"
              >
                {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                <span>{copied ? "Copied!" : "Copy ID"}</span>
              </button>
            </div>
            <p className="dv-my-id-hint">
              Give this ID to trusted family, partners, or institutions to share end-to-end encrypted documents directly without mutual connection.
            </p>
          </div>
        </div>
        <div className="dv-my-id-card__actions">
          <Link to="/connections" className="dv-manage-conns-link">
            <Users size={16} />
            <span>Manage Connections ({userConnections.length})</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* Comprehensive Access Management Tabs */}
      <div className="dv-share-tabs">
        <div className="dv-share-tabs__list">
          <button
            type="button"
            className={`dv-share-tab-btn ${activeTab === "OVERVIEW" ? "dv-share-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("OVERVIEW")}
          >
            <Shield size={16} /> Access Overview
          </button>

          <button
            type="button"
            className={`dv-share-tab-btn ${activeTab === "SENT" ? "dv-share-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("SENT")}
          >
            <Share2 size={16} /> Shared By Me ({sentShares.length})
          </button>

          <button
            type="button"
            className={`dv-share-tab-btn ${activeTab === "RECEIVED" ? "dv-share-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("RECEIVED")}
          >
            <Users size={16} /> Shared With Me ({receivedShares.length})
          </button>

          <button
            type="button"
            className={`dv-share-tab-btn ${activeTab === "PRIVATE" ? "dv-share-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("PRIVATE")}
          >
            <Lock size={16} /> Private Documents ({privateDocs.length})
          </button>

          <button
            type="button"
            className={`dv-share-tab-btn ${activeTab === "ACTIVITY" ? "dv-share-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("ACTIVITY")}
          >
            <Activity size={16} /> Access History
          </button>

          <button
            type="button"
            className={`dv-share-tab-btn ${activeTab === "SMART_PACK" ? "dv-share-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("SMART_PACK")}
          >
            <Sparkles size={16} /> Smart Pack
          </button>
        </div>

        <div className="dv-share-tabs__action">
          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={() => {
              setCreatedShareResult(null);
              setShareForm({
                purpose: "",
                documentIds: [],
                recipientUserId: "",
                recipientEmail: "",
                shareType: "CONNECTION",
                permissions: { view: true, download: false },
                expiresInHours: 24,
                password: "",
                otpRequired: false,
                watermarkEnabled: true,
                watermarkCustomText: "",
                redactTermsText: "",
              });
              setRecipientInput("");
              setVerifiedRecipient(null);
              setShowCreateModal(true);
            }}
          >
            Share Document
          </Button>
        </div>
      </div>

      {/* =========================================================================
          TAB 1: ACCESS OVERVIEW
          ========================================================================= */}
      {activeTab === "OVERVIEW" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {loading ? (
            <div className="dv-access-overview-grid">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Card key={i} padding="md"><Skeleton height="80px" /></Card>
              ))}
            </div>
          ) : (
            <div className="dv-access-overview-grid">
              {/* Total Documents */}
              <div className="dv-stat-card">
                <div className="dv-stat-card__icon dv-stat-card__icon--blue">
                  <FileText size={24} />
                </div>
                <div className="dv-stat-card__content">
                  <span className="dv-stat-card__val">{overviewData?.totalDocuments || userDocs.length}</span>
                  <span className="dv-stat-card__label">Total Documents</span>
                  <span className="dv-stat-card__hint">Stored in encrypted vault</span>
                </div>
              </div>

              {/* Private Documents */}
              <div className="dv-stat-card" style={{ cursor: "pointer" }} onClick={() => setActiveTab("PRIVATE")}>
                <div className="dv-stat-card__icon dv-stat-card__icon--slate">
                  <Lock size={24} />
                </div>
                <div className="dv-stat-card__content">
                  <span className="dv-stat-card__val">{overviewData?.privateDocuments || privateDocs.length}</span>
                  <span className="dv-stat-card__label">Private Documents</span>
                  <span className="dv-stat-card__hint" style={{ color: "#10b981", fontWeight: 600 }}>100% Unshared & Isolated</span>
                </div>
              </div>

              {/* Shared By Me */}
              <div className="dv-stat-card" style={{ cursor: "pointer" }} onClick={() => setActiveTab("SENT")}>
                <div className="dv-stat-card__icon dv-stat-card__icon--emerald">
                  <Share2 size={24} />
                </div>
                <div className="dv-stat-card__content">
                  <span className="dv-stat-card__val">{overviewData?.sharedByMe || sentShares.length}</span>
                  <span className="dv-stat-card__label">Shared By Me</span>
                  <span className="dv-stat-card__hint">Authorized packages</span>
                </div>
              </div>

              {/* Shared With Me */}
              <div className="dv-stat-card" style={{ cursor: "pointer" }} onClick={() => setActiveTab("RECEIVED")}>
                <div className="dv-stat-card__icon dv-stat-card__icon--purple">
                  <Users size={24} />
                </div>
                <div className="dv-stat-card__content">
                  <span className="dv-stat-card__val">{overviewData?.sharedWithMe || receivedShares.length}</span>
                  <span className="dv-stat-card__label">Shared With Me</span>
                  <span className="dv-stat-card__hint">Incoming access</span>
                </div>
              </div>

              {/* Active Sharing Grants */}
              <div className="dv-stat-card">
                <div className="dv-stat-card__icon dv-stat-card__icon--emerald">
                  <ShieldCheck size={24} />
                </div>
                <div className="dv-stat-card__content">
                  <span className="dv-stat-card__val">{overviewData?.activeGrants || sentShares.filter(s => s.status === 'ACTIVE').length}</span>
                  <span className="dv-stat-card__label">Active Grants</span>
                  <span className="dv-stat-card__hint">Currently live and valid</span>
                </div>
              </div>

              {/* Expired Shares */}
              <div className="dv-stat-card">
                <div className="dv-stat-card__icon dv-stat-card__icon--amber">
                  <Clock size={24} />
                </div>
                <div className="dv-stat-card__content">
                  <span className="dv-stat-card__val">{overviewData?.expiredShares || 0}</span>
                  <span className="dv-stat-card__label">Expired Shares</span>
                  <span className="dv-stat-card__hint">Access elapsed naturally</span>
                </div>
              </div>

              {/* Revoked Shares */}
              <div className="dv-stat-card">
                <div className="dv-stat-card__icon dv-stat-card__icon--red">
                  <AlertTriangle size={24} />
                </div>
                <div className="dv-stat-card__content">
                  <span className="dv-stat-card__val">{overviewData?.revokedShares || 0}</span>
                  <span className="dv-stat-card__label">Revoked Shares</span>
                  <span className="dv-stat-card__hint">Access cut immediately</span>
                </div>
              </div>

              {/* Pending Requests */}
              <div className="dv-stat-card">
                <div className="dv-stat-card__icon dv-stat-card__icon--blue">
                  <FileCheck size={24} />
                </div>
                <div className="dv-stat-card__content">
                  <span className="dv-stat-card__val">{overviewData?.pendingRequests || 0}</span>
                  <span className="dv-stat-card__label">Pending Requests</span>
                  <span className="dv-stat-card__hint">Awaiting your approval</span>
                </div>
              </div>
            </div>
          )}

          {/* Privacy & Guardrails Guarantee Banner */}
          <div style={{ background: "rgba(1, 90, 71, 0.05)", border: "1px solid rgba(1, 90, 71, 0.2)", borderRadius: "var(--radius-lg)", padding: "16px 20px", display: "flex", alignItems: "flex-start", gap: 14 }}>
            <ShieldCheck size={24} color="var(--color-primary, #015a47)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <h4 style={{ margin: "0 0 4px 0", fontSize: "0.95rem", color: "var(--color-primary, #015a47)" }}>
                Zero-Leak Access Control Architecture
              </h4>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                Documents in your private vault remain completely invisible to other users, family connections, AI search, and RAG retrieval.
                A shared document is accessible <em>strictly</em> through a verified authorization grant with owner-defined permissions and cryptographic tokens.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: SHARED BY ME
          ========================================================================= */}
      {activeTab === "SENT" && (
        <div>
          {loading ? (
            <div className="dv-shares-grid">
              {[1, 2, 3].map((i) => (
                <Card key={i} padding="md"><Skeleton height="140px" /></Card>
              ))}
            </div>
          ) : sentShares.length === 0 ? (
            <EmptyState
              title="No document shares created yet"
              description="Share specific documents directly using DocVault ID or create expiring links with custom view/download permissions."
              actionLabel="Create First Share"
              onAction={() => setShowCreateModal(true)}
            />
          ) : (
            <div className="dv-shares-grid">
              {sentShares.map((share) => {
                const isRevoked = share.status === "REVOKED";
                const isExpired = share.status === "EXPIRED" || (share.expiresAt && new Date(share.expiresAt) <= new Date());
                const docs = share.documentIds || [];
                const firstDoc = docs[0];

                return (
                  <div key={share._id} className="dv-share-card">
                    <div className="dv-share-card-header">
                      <div>
                        <h4 className="dv-share-purpose">{share.purpose}</h4>
                        <div className="dv-share-recipient-info">
                          <span>Recipient:</span>
                          {share.recipientUserId ? (
                            <strong className="dv-party-name">
                              {share.recipientUserId.name || "User"}
                              {share.recipientUserId.docVaultId && (
                                <span className="dv-id-pill">{share.recipientUserId.docVaultId}</span>
                              )}
                            </strong>
                          ) : (
                            <span className="dv-party-link">{share.recipientEmail || "Expiring Secure Link"}</span>
                          )}
                        </div>
                      </div>
                      <Badge variant={isRevoked ? "danger" : isExpired ? "warning" : "success"} size="sm">
                        {isRevoked ? "Revoked" : isExpired ? "Expired" : "Active"}
                      </Badge>
                    </div>

                    <div className="dv-share-docs-list">
                      {docs.map((d) => (
                        <div key={d._id} className="dv-share-doc-item">
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <DocumentTypeIcon category={d.category} format={d.format} size={14} />
                            <strong>{d.title}</strong>
                          </span>
                          <span style={{ color: "var(--color-text-secondary)", fontSize: "11px" }}>{d.format || "PDF"}</span>
                        </div>
                      ))}
                    </div>

                    <div className="dv-share-security-badges">
                      {share.permissions?.download ? (
                        <span className="dv-share-badge"><Download size={11} /> View + Download</span>
                      ) : (
                        <span className="dv-share-badge"><Eye size={11} /> View Only</span>
                      )}
                      {share.watermarkEnabled && (
                        <span className="dv-share-badge"><ShieldCheck size={11} /> Watermarked</span>
                      )}
                      {share.expiresAt ? (
                        <span className="dv-share-badge"><Clock size={11} /> Exp: {new Date(share.expiresAt).toLocaleDateString()}</span>
                      ) : (
                        <span className="dv-share-badge"><Clock size={11} /> Continuous</span>
                      )}
                      {share.lastAccessedAt ? (
                        <span className="dv-share-badge" style={{ color: "#2563eb" }}>
                          Last Accessed: {new Date(share.lastAccessedAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="dv-share-badge" style={{ fontStyle: "italic" }}>
                          Not accessed yet
                        </span>
                      )}
                    </div>

                    <div className="dv-share-card-footer">
                      <div className="dv-share-card-actions">
                        <Link to={`/shares/${share._id}/view`} className="dv-action-pill-btn dv-action-pill-btn--primary">
                          <Eye size={12} /> Open Package
                        </Link>

                        {!isRevoked && (
                          <button
                            type="button"
                            className="dv-action-pill-btn"
                            onClick={() => handleOpenEditShare(share)}
                            title="Modify permissions or extend expiry"
                          >
                            <Edit3 size={12} /> Edit Permissions
                          </button>
                        )}

                        {firstDoc && (
                          <button
                            type="button"
                            className="dv-action-pill-btn"
                            onClick={() => handleOpenDocActivity(firstDoc._id, firstDoc.title)}
                            title="View access history"
                          >
                            <Activity size={12} /> Activity
                          </button>
                        )}

                        {!isRevoked && (
                          <button
                            type="button"
                            className="dv-action-pill-btn dv-action-pill-btn--danger"
                            onClick={() => handleRevokeShare(share._id)}
                            title="Revoke access immediately"
                          >
                            <Trash2 size={12} /> Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: SHARED WITH ME
          ========================================================================= */}
      {activeTab === "RECEIVED" && (
        <div>
          {loading ? (
            <div className="dv-shares-grid">
              {[1, 2].map((i) => (
                <Card key={i} padding="md"><Skeleton height="120px" /></Card>
              ))}
            </div>
          ) : receivedShares.length === 0 ? (
            <EmptyState
              title="No documents shared with you"
              description="When connections or institutions share documents directly with your DocVault ID, they will appear here."
            />
          ) : (
            <div className="dv-shares-grid">
              {receivedShares.map((share) => (
                <div key={share._id} className="dv-share-card">
                  <div className="dv-share-card-header">
                    <div>
                      <h4 className="dv-share-purpose">{share.purpose}</h4>
                      <div className="dv-share-recipient-info">
                        <span>From:</span>
                        <strong className="dv-party-name">
                          {share.ownerId?.name || "User"}
                          {share.ownerId?.docVaultId && (
                            <span className="dv-id-pill">{share.ownerId.docVaultId}</span>
                          )}
                        </strong>
                      </div>
                    </div>
                    <Badge variant="primary" size="sm">Active</Badge>
                  </div>

                  <div className="dv-share-docs-list">
                    {(share.documentIds || []).map((d) => (
                      <div key={d._id} className="dv-share-doc-item">
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <DocumentTypeIcon category={d.category} format={d.format} size={14} />
                          <strong>{d.title}</strong>
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => handleOpenQuickPreview(share, d)}
                            style={{
                              fontSize: "11px",
                              color: "var(--color-primary)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 3,
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontWeight: 600,
                              padding: "2px 6px",
                              borderRadius: "4px"
                            }}
                            title="Instant preview without leaving this page"
                          >
                            <Eye size={12} /> Quick View
                          </button>
                          <Link
                            to={`/shares/${share._id}/view?doc=${d._id}`}
                            style={{ fontSize: "11px", color: "var(--color-text-secondary)", display: "inline-flex", alignItems: "center", gap: 3, textDecoration: "none" }}
                            title="Open with AI Copilot Reader"
                          >
                            <Sparkles size={11} color="#0070F2" /> AI Reader
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="dv-share-card-footer">
                    <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                      {share.permissions?.download ? "View & Download permitted" : "View-only in controlled viewer"}
                      {share.expiresAt && ` • Exp: ${new Date(share.expiresAt).toLocaleDateString()}`}
                    </span>
                    <Link to={`/shares/${share._id}/view`} className="dv-share-link-btn" style={{ fontSize: "var(--text-xs)", color: "var(--color-primary)", textDecoration: "none" }}>
                      Open Shared Package <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 4: MY PRIVATE DOCUMENTS
          ========================================================================= */}
      {activeTab === "PRIVATE" && (
        <div>
          <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-secondary)" }}>
              These documents are strictly private. No external links, family connections, or AI search can access them.
            </p>
            <Badge variant="outline" size="sm">
              <Lock size={12} style={{ marginRight: 4 }} /> Strictly Isolated
            </Badge>
          </div>

          {loading ? (
            <div className="dv-shares-grid">
              {[1, 2, 3].map((i) => (
                <Card key={i} padding="md"><Skeleton height="140px" /></Card>
              ))}
            </div>
          ) : privateDocs.length === 0 ? (
            <EmptyState
              title="No private documents found"
              description="All documents in your vault currently have active shares, or no documents have been uploaded."
              actionLabel="Upload Document"
              onAction={() => navigate("/upload")}
            />
          ) : (
            <div className="dv-shares-grid">
              {privateDocs.map((doc) => (
                <div key={doc._id} className="dv-share-card" style={{ borderColor: "rgba(100, 116, 139, 0.25)" }}>
                  <div className="dv-share-card-header">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <DocumentTypeIcon category={doc.category} format={doc.format} size={22} />
                      <div>
                        <h4 className="dv-share-purpose" style={{ margin: 0 }}>{doc.title}</h4>
                        <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                          {doc.category || "General"} • {doc.format || "PDF"} • {doc.fileSizeFormatted || "Stored"}
                        </span>
                      </div>
                    </div>
                    <span className="dv-card-badge dv-card-badge--private">
                      <Lock size={11} /> Private
                    </span>
                  </div>

                  <p style={{ margin: "10px 0", fontSize: "11px", color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
                    {doc.summary || "Stored securely in encrypted vault. Only you have access to this document."}
                  </p>

                  <div className="dv-share-card-footer">
                    <Link to={`/documents/${doc._id}`} className="dv-action-pill-btn dv-action-pill-btn--primary">
                      <Eye size={12} /> Inspect File
                    </Link>

                    <button
                      type="button"
                      className="dv-action-pill-btn"
                      onClick={() => handleDirectShareDoc(doc)}
                      title="Share this private document directly"
                    >
                      <Share2 size={12} /> Share Privately
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 5: ACCESS & ACTIVITY HISTORY
          ========================================================================= */}
      {activeTab === "ACTIVITY" && (
        <div className="dv-activity-timeline-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 700 }}>Access & Security Timeline</h3>
              <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--color-text-secondary)" }}>
                Audited access events for documents shared by your vault.
              </p>
            </div>
            <Button size="sm" variant="outline" icon={RefreshCw} onClick={fetchAllData}>
              Refresh
            </Button>
          </div>

          {loading ? (
            <Skeleton height="200px" />
          ) : activityLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: "var(--color-text-secondary)", fontStyle: "italic", fontSize: "12px" }}>
              No access activity recorded yet. When recipients preview, download, or access shared files, the events will appear here.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="dv-activity-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Document</th>
                    <th>Recipient / Actor</th>
                    <th>Activity</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {activityLogs.map((log) => {
                    const isDenied = log.result === "DENIED" || log.action === "ACCESS_DENIED";
                    let badgeClass = "dv-action-badge--viewed";
                    if (log.action === "DOWNLOADED") badgeClass = "dv-action-badge--downloaded";
                    if (log.action === "CREATED" || log.action === "SHARED") badgeClass = "dv-action-badge--created";
                    if (log.action === "ACCESS_REVOKED") badgeClass = "dv-action-badge--revoked";
                    if (log.action === "ACCESS_DENIED") badgeClass = "dv-action-badge--denied";
                    if (log.action === "PERMISSION_CHANGED" || log.action === "EXPIRY_EXTENDED") badgeClass = "dv-action-badge--changed";

                    return (
                      <tr key={log._id}>
                        <td style={{ whiteSpace: "nowrap", color: "var(--color-text-secondary)" }}>
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td>
                          <strong>{log.documentTitle}</strong>
                        </td>
                        <td>
                          {log.recipient?.name || "Viewer"}
                          {log.recipient?.docVaultId && (
                            <span className="dv-id-pill" style={{ marginLeft: 6, fontSize: "10px", padding: "1px 5px" }}>
                              {log.recipient.docVaultId}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`dv-action-badge ${badgeClass}`}>
                            {log.action.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td>
                          <Badge variant={isDenied ? "danger" : "success"} size="sm">
                            {isDenied ? "DENIED" : "SUCCESS"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 6: SMART SHARE PACK BUILDER
          ========================================================================= */}
      {activeTab === "SMART_PACK" && (
        <div className="dv-smart-pack-card">
          <div className="dv-smart-pack-header">
            <div className="dv-smart-pack-title">
              <Sparkles size={20} color="#0070F2" />
              <span>Smart Document Bundle</span>
            </div>
            <Badge variant="primary">AI & Rule-Powered</Badge>
          </div>

          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", margin: 0 }}>
            Enter your purpose (e.g., <em>"Home Loan application"</em>, <em>"Vehicle sale"</em>, or <em>"Tax filing 2026"</em>). The engine will recommend matching documents from your vault, verify completeness, and prepare a package for your explicit approval.
          </p>

          <form onSubmit={handleSmartPackSuggest} className="dv-smart-pack-input-row">
            <Input
              placeholder="e.g. Home loan application, Vehicle transfer, or CA Tax filing"
              value={smartPurpose}
              onChange={(e) => setSmartPurpose(e.target.value)}
              required
              style={{ flex: 1 }}
            />
            <Button variant="primary" type="submit" loading={smartLoading} icon={Sparkles}>
              Suggest Pack
            </Button>
          </form>

          {smartResult && (
            <div className="dv-smart-pack-result">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: "var(--text-base)" }}>{smartResult.suggestedTitle}</h4>
                  <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                    Rule matched: <strong>{smartResult.ruleName}</strong> ({smartResult.matchConfidence}% confidence)
                  </span>
                </div>
                <Badge variant={smartResult.isComplete ? "success" : "warning"}>
                  {smartResult.isComplete ? "All Documents Ready" : "Missing Documents"}
                </Badge>
              </div>

              {/* Document Check List */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px" }}>
                {smartResult.suggestedDocuments.map((item) => (
                  <div key={item.documentId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "var(--color-surface)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={selectedSmartDocs.includes(item.documentId)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedSmartDocs((prev) => [...prev, item.documentId]);
                          } else {
                            setSelectedSmartDocs((prev) => prev.filter((id) => id !== item.documentId));
                          }
                        }}
                      />
                      <span style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>{item.title}</span>
                      <Badge size="sm" variant="outline">{item.requirementTag}</Badge>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                      {item.confidence}% Match
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
                <Button
                  variant="primary"
                  onClick={handleProceedWithSmartPack}
                  disabled={selectedSmartDocs.length === 0}
                  icon={ArrowRight}
                >
                  Proceed with ({selectedSmartDocs.length}) Documents
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          MODAL 1: DIRECT SHARE WIZARD
          ========================================================================= */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setCreatedShareResult(null);
        }}
        title={createdShareResult ? "Share Authorized Successfully!" : "Create Secure Document Share"}
      >
        {createdShareResult ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", textAlign: "center", padding: "8px 4px" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(16, 185, 129, 0.12)", color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
              <CheckCircle2 size={36} />
            </div>

            <div>
              <h3 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--color-text-primary)" }}>
                Share Authorized & Live!
              </h3>
              <p style={{ margin: "6px 0 0", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
                Your documents have been securely authorized under strict privacy guardrails.
              </p>
            </div>

            <div style={{ background: "var(--color-surface-subtle)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", padding: "14px", textAlign: "left", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                <span style={{ color: "var(--color-text-secondary)" }}>Package Name:</span>
                <strong style={{ color: "var(--color-text-primary)" }}>
                  {createdShareResult.share?.purpose || shareForm.purpose || "Shared Package"}
                </strong>
              </div>

              {(createdShareResult.recipient || shareForm.recipientDocVaultId || shareForm.recipientEmail) && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>Recipient:</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <strong>{createdShareResult.recipient?.name || createdShareResult.recipient?.email || shareForm.recipientDocVaultId || shareForm.recipientEmail}</strong>
                    {(createdShareResult.recipient?.docVaultId || shareForm.recipientDocVaultId) && (
                      <span className="dv-id-pill" style={{ fontSize: "10px", padding: "2px 6px" }}>
                        {createdShareResult.recipient?.docVaultId || shareForm.recipientDocVaultId}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                <span style={{ color: "var(--color-text-secondary)" }}>Documents:</span>
                <strong style={{ color: "var(--color-primary)" }}>
                  {shareForm.documentIds.length} document{shareForm.documentIds.length === 1 ? "" : "s"} shared
                </strong>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                <span style={{ color: "var(--color-text-secondary)" }}>Permissions:</span>
                <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                  {shareForm.permissions.download ? "View & Download" : "View Only"}
                </span>
              </div>

              {createdShareResult.share?.expiresAt && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "var(--color-text-secondary)" }}>Expires:</span>
                  <span style={{ color: "var(--color-text-secondary)" }}>
                    {new Date(createdShareResult.share.expiresAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {createdShareResult.shareUrl && (
              <div style={{ background: "var(--color-surface-subtle)", padding: "12px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-secondary)" }}>Expiring Access Link:</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}${createdShareResult.shareUrl}`);
                      alert("Share link copied to clipboard!");
                    }}
                    style={{ padding: "3px 8px", fontSize: "11px", borderRadius: "4px", background: "var(--color-primary)", color: "#fff", border: "none", cursor: "pointer" }}
                  >
                    Copy Link
                  </button>
                </div>
                <code style={{ fontSize: "11px", wordBreak: "break-all", color: "var(--color-primary)", display: "block" }}>
                  {window.location.origin}{createdShareResult.shareUrl}
                </code>
              </div>
            )}

            <Button
              variant="primary"
              onClick={() => {
                setShowCreateModal(false);
                setCreatedShareResult(null);
                setActiveTab("SENT");
              }}
              style={{ marginTop: 4, width: "100%" }}
            >
              Done & View Active Shares
            </Button>
          </div>
        ) : (
          <form onSubmit={handleCreateShareSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {/* Sender identity banner */}
            <div className="dv-modal-sharing-identity">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <ShieldCheck size={16} color="var(--color-primary)" />
                <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Sharing as:</span>
                <strong style={{ fontSize: "12px" }}>{user?.name || "DocVault User"}</strong>
              </div>
              {myDocVaultId && (
                <span className="dv-id-pill" title="Your DocVault ID">{myDocVaultId}</span>
              )}
            </div>

            <Input
              label="Purpose / Package Name"
              placeholder="e.g. Home Loan Application, CA Audit, Car Registration"
              value={shareForm.purpose}
              onChange={(e) => setShareForm((p) => ({ ...p, purpose: e.target.value }))}
              required
            />

            {/* Select Documents */}
            <div className="dv-form-group">
              <label className="dv-input-label">Select Documents ({shareForm.documentIds.length} selected)</label>
              <div style={{ maxHeight: "140px", overflowY: "auto", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "8px" }}>
                {userDocs.map((doc) => (
                  <div key={doc._id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: "var(--text-xs)" }}>
                    <input
                      type="checkbox"
                      checked={shareForm.documentIds.includes(doc._id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setShareForm((p) => ({ ...p, documentIds: [...p.documentIds, doc._id] }));
                        } else {
                          setShareForm((p) => ({ ...p, documentIds: p.documentIds.filter((id) => id !== doc._id) }));
                        }
                      }}
                    />
                    <span>{doc.title} ({doc.category})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recipient verification input */}
            <div className="dv-form-group">
              <label className="dv-input-label">Recipient DocVault ID or Email (No connection required)</label>
              <div className="dv-input-verify-row">
                <input
                  type="text"
                  className="dv-input-field"
                  placeholder="e.g. DV-ABC1-2345 or user@example.com"
                  value={recipientInput}
                  onChange={(e) => {
                    setRecipientInput(e.target.value);
                    setVerifiedRecipient(null);
                    setRecipientVerifyError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleVerifyRecipientInput();
                    }
                  }}
                />
                <button
                  type="button"
                  className="dv-btn-verify"
                  onClick={() => handleVerifyRecipientInput()}
                  disabled={verifyingRecipient || !recipientInput.trim()}
                >
                  {verifyingRecipient ? "Checking..." : "Verify"}
                </button>
              </div>

              {recipientVerifyError && (
                <span className="dv-verify-hint-error">{recipientVerifyError}</span>
              )}

              {verifiedRecipient && (
                <div className="dv-verified-badge-card">
                  <CheckCircle2 size={16} color="#10b981" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-text-primary)" }}>
                      {verifiedRecipient.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                      {verifiedRecipient.email || "Verified DocVault Account"}
                    </div>
                  </div>
                  {verifiedRecipient.docVaultId && (
                    <span className="dv-id-pill">{verifiedRecipient.docVaultId}</span>
                  )}
                </div>
              )}
            </div>

            {/* Permission Option */}
            <div className="dv-form-group">
              <label className="dv-input-label">Permission Level</label>
              <select
                className="dv-select-input"
                value={shareForm.permissions.download ? "DOWNLOAD" : "VIEW"}
                onChange={(e) =>
                  setShareForm((p) => ({
                    ...p,
                    permissions: { view: true, download: e.target.value === "DOWNLOAD" },
                  }))
                }
              >
                <option value="VIEW">View Only (Default - Controlled in-app viewer, no downloads)</option>
                <option value="DOWNLOAD">View + Download (Recipient can download original copy)</option>
              </select>
            </div>

            {/* Expiry selection */}
            <div className="dv-form-group">
              <label className="dv-input-label">Access Expiration</label>
              <select
                className="dv-select-input"
                value={shareForm.expiresInHours}
                onChange={(e) => setShareForm((p) => ({ ...p, expiresInHours: e.target.value }))}
              >
                <option value="1">1 Hour</option>
                <option value="24">24 Hours (1 Day)</option>
                <option value="168">7 Days (1 Week)</option>
                <option value="720">30 Days (1 Month)</option>
                <option value="0">No Expiry (Continuous until revoked)</option>
              </select>
            </div>

            {/* Optional Password */}
            <Input
              label="Share Password (Optional)"
              type="password"
              placeholder="Leave blank for direct access"
              value={shareForm.password}
              onChange={(e) => setShareForm((p) => ({ ...p, password: e.target.value }))}
            />

            <Button variant="primary" type="submit" loading={submitting} style={{ marginTop: "8px" }}>
              Authorize & Create Share
            </Button>
          </form>
        )}
      </Modal>

      {/* =========================================================================
          MODAL 2: EDIT PERMISSIONS & EXTEND EXPIRY
          ========================================================================= */}
      <Modal
        isOpen={Boolean(editingShare)}
        onClose={() => setEditingShare(null)}
        title="Modify Share Permissions & Expiry"
      >
        {editingShare && (
          <form onSubmit={handleSaveEditShare} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div style={{ background: "var(--color-surface-subtle)", padding: "10px", borderRadius: "var(--radius-md)", fontSize: "12px" }}>
              <div><strong>Package:</strong> {editingShare.purpose}</div>
              <div style={{ color: "var(--color-text-secondary)", marginTop: 2 }}>
                Recipient: {editingShare.recipientUserId?.name || editingShare.recipientEmail || "Expiring Link"}
              </div>
            </div>

            <div className="dv-form-group">
              <label className="dv-input-label">Permission Level</label>
              <select
                className="dv-select-input"
                value={editPermissions.download ? "DOWNLOAD" : "VIEW"}
                onChange={(e) =>
                  setEditPermissions({
                    view: true,
                    download: e.target.value === "DOWNLOAD",
                  })
                }
              >
                <option value="VIEW">View Only (No downloads allowed)</option>
                <option value="DOWNLOAD">View + Download (Allow download copy)</option>
              </select>
            </div>

            <div className="dv-form-group">
              <label className="dv-input-label">Extend / Reset Expiration</label>
              <select
                className="dv-select-input"
                value={editExpiryHours}
                onChange={(e) => setEditExpiryHours(e.target.value)}
              >
                <option value="24">Extend 24 Hours from now</option>
                <option value="168">Extend 7 Days from now</option>
                <option value="720">Extend 30 Days from now</option>
                <option value="0">No Expiry (Continuous)</option>
              </select>
            </div>

            <Button variant="primary" type="submit" loading={savingEdit} style={{ marginTop: "8px" }}>
              Save Updated Permissions
            </Button>
          </form>
        )}
      </Modal>

      {/* =========================================================================
          MODAL 3: DOCUMENT ACCESS ACTIVITY TIMELINE
          ========================================================================= */}
      <Modal
        isOpen={Boolean(viewingDocActivity)}
        onClose={() => setViewingDocActivity(null)}
        title={`Access Activity: ${viewingDocActivity?.title || "Document"}`}
      >
        {docActivityLoading ? (
          <Skeleton height="150px" />
        ) : docActivityLogs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-secondary)", fontStyle: "italic", fontSize: "12px" }}>
            No activity events recorded yet for this document.
          </div>
        ) : (
          <div style={{ maxHeight: "320px", overflowY: "auto" }}>
            <table className="dv-activity-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor / Recipient</th>
                  <th>Action</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {docActivityLogs.map((log) => (
                  <tr key={log._id}>
                    <td style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td>
                      {log.recipient?.name || "Viewer"}
                    </td>
                    <td>
                      <span className="dv-action-badge dv-action-badge--viewed">
                        {log.action.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>
                      <Badge variant={log.result === "DENIED" ? "danger" : "success"} size="sm">
                        {log.result}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* =========================================================================
          MODAL 4: INSTANT SHARED DOCUMENT PREVIEW
          ========================================================================= */}
      <Modal
        isOpen={Boolean(quickPreview)}
        onClose={() => setQuickPreview(null)}
        title={quickPreview?.doc?.title || "Shared Document Preview"}
        maxWidth="840px"
      >
        {quickPreview && (() => {
          const { share, doc } = quickPreview;
          const isPdf = (doc.format || "").toUpperCase() === "PDF" || (doc.title || "").toLowerCase().endsWith(".pdf");
          const token = localStorage.getItem("token") || localStorage.getItem("docvault_token") || "";
          const streamUrl = `${API_BASE_URL}/api/shares/${share._id}/document?documentId=${doc._id}&token=${encodeURIComponent(token)}`;
          const pdfStreamUrl = isPdf ? `${streamUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH` : streamUrl;
          const downloadUrl = `${API_BASE_URL}/api/shares/${share._id}/download?documentId=${doc._id}&token=${encodeURIComponent(token)}`;
          const canDownload = Boolean(share.permissions?.download);

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* Header Info & Controls */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                padding: "8px 12px",
                background: "var(--color-surface-secondary, #f8fafc)",
                borderRadius: "8px",
                border: "1px solid var(--color-border)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <DocumentTypeIcon category={doc.category} format={doc.format} size={20} />
                  <div>
                    <strong style={{ fontSize: "13px", color: "var(--color-text-primary)", display: "block" }}>
                      {doc.title}
                    </strong>
                    <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                      Shared by {share.ownerId?.name || "Vault Owner"} • {doc.category || "General"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Badge variant={canDownload ? "primary" : "outline"} size="sm">
                    {canDownload ? "View & Download" : "View Only"}
                  </Badge>

                  {/* Zoom Controls */}
                  <button
                    type="button"
                    className="dv-viewer-tool-btn"
                    onClick={() => setPreviewZoom((z) => Math.max(z - 25, 50))}
                    title="Zoom Out"
                    style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  >
                    <ZoomOut size={13} />
                  </button>
                  <button
                    type="button"
                    className="dv-viewer-tool-btn"
                    onClick={() => { setPreviewZoom(100); setPreviewRotation(0); }}
                    title="Reset Zoom"
                    style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)", fontSize: "11px" }}
                  >
                    {previewZoom}%
                  </button>
                  <button
                    type="button"
                    className="dv-viewer-tool-btn"
                    onClick={() => setPreviewZoom((z) => Math.min(z + 25, 250))}
                    title="Zoom In"
                    style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  >
                    <ZoomIn size={13} />
                  </button>
                  <button
                    type="button"
                    className="dv-viewer-tool-btn"
                    onClick={() => setPreviewRotation((r) => (r + 90) % 360)}
                    title="Rotate 90°"
                    style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                  >
                    <RotateCw size={13} />
                  </button>
                </div>
              </div>

              {/* Preview Body */}
              <div style={{
                position: "relative",
                height: "480px",
                width: "100%",
                background: "#0f172a",
                borderRadius: "8px",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
                {previewLoading && (
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(15, 23, 42, 0.75)",
                    zIndex: 5,
                    color: "#f8fafc",
                    gap: 10
                  }}>
                    <Loader2 size={32} className="dv-spin" color="#38bdf8" />
                    <span style={{ fontSize: "12px", fontWeight: 600 }}>Streaming preview securely...</span>
                  </div>
                )}

                {previewError ? (
                  <div style={{ textAlign: "center", color: "#f8fafc", padding: "20px" }}>
                    <AlertCircle size={36} color="#ef4444" style={{ marginBottom: 10 }} />
                    <p style={{ margin: "0 0 12px 0", fontSize: "13px" }}>Could not display preview inside modal.</p>
                    <a href={streamUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="primary" size="sm" icon={ExternalLink}>Open in Native Tab</Button>
                    </a>
                  </div>
                ) : isPdf ? (
                  <div style={{
                    width: "100%",
                    height: "100%",
                    transform: `scale(${previewZoom / 100}) rotate(${previewRotation}deg)`,
                    transformOrigin: "center center",
                    transition: "transform 0.15s ease"
                  }}>
                    <object
                      data={pdfStreamUrl}
                      type="application/pdf"
                      style={{ width: "100%", height: "100%", border: "none" }}
                      aria-label={doc.title}
                      onLoad={() => setPreviewLoading(false)}
                      onError={() => { setPreviewLoading(false); setPreviewError(true); }}
                    >
                      <iframe
                        src={pdfStreamUrl}
                        title={doc.title}
                        style={{ width: "100%", height: "100%", border: "none" }}
                        onLoad={() => setPreviewLoading(false)}
                        onError={() => { setPreviewLoading(false); setPreviewError(true); }}
                      />
                    </object>
                  </div>
                ) : (
                  <img
                    src={streamUrl}
                    alt={doc.title}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      transform: `scale(${previewZoom / 100}) rotate(${previewRotation}deg)`,
                      transformOrigin: "center center",
                      transition: "transform 0.15s ease"
                    }}
                    onLoad={() => setPreviewLoading(false)}
                    onError={() => { setPreviewLoading(false); setPreviewError(true); }}
                  />
                )}
              </div>

              {/* Bottom Actions */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "8px", borderTop: "1px solid var(--color-border)" }}>
                <Link
                  to={`/shares/${share._id}/view?doc=${doc._id}`}
                  style={{ textDecoration: "none" }}
                  onClick={() => setQuickPreview(null)}
                >
                  <Button variant="outline" size="sm" icon={Sparkles}>
                    Open in Full AI Copilot Reader
                  </Button>
                </Link>

                <div style={{ display: "flex", gap: "8px" }}>
                  <a href={streamUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm" icon={ExternalLink}>Open Tab</Button>
                  </a>
                  {canDownload && (
                    <a href={downloadUrl} download={doc.title || "document"}>
                      <Button variant="primary" size="sm" icon={Download}>Download Copy</Button>
                    </a>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setQuickPreview(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
