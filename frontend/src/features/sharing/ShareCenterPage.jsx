import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../services/api";
import {
  Share2, ShieldCheck, Lock, Clock, Eye, Download, Sparkles, Plus,
  Trash2, AlertTriangle, Key, ExternalLink, MessageSquare, Check, X,
  FileText, Users, ArrowRight, RefreshCw, Send, CheckCircle2
} from "lucide-react";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import Input from "../../components/common/Input/Input";
import Modal from "../../components/common/Modal/Modal";
import EmptyState from "../../components/common/EmptyState/EmptyState";
import Skeleton from "../../components/common/Skeleton/Skeleton";

import "./ShareCenterPage.css";

export default function ShareCenterPage() {
  const [activeTab, setActiveTab] = useState("SENT"); // 'SENT' | 'RECEIVED' | 'SMART_PACK'
  const [sentShares, setSentShares] = useState([]);
  const [receivedShares, setReceivedShares] = useState([]);
  const [loading, setLoading] = useState(true);

  // Smart Pack State
  const [smartPurpose, setSmartPurpose] = useState("");
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartResult, setSmartResult] = useState(null);
  const [selectedSmartDocs, setSelectedSmartDocs] = useState([]);

  // Create Share Wizard Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [userDocs, setUserDocs] = useState([]);
  const [userConnections, setUserConnections] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Form State
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

  const [createdShareResult, setCreatedShareResult] = useState(null);

  useEffect(() => {
    fetchShares();
  }, []);

  async function fetchShares() {
    try {
      setLoading(true);
      const [sentRes, recvRes, docsRes, connRes] = await Promise.all([
        apiRequest("/api/shares/sent").catch(() => ({ data: [] })),
        apiRequest("/api/shares/received").catch(() => ({ data: [] })),
        apiRequest("/api/documents").catch(() => ({ data: [] })),
        apiRequest("/api/connections").catch(() => ({ data: [] })),
      ]);

      setSentShares(sentRes.data || []);
      setReceivedShares(recvRes.data || []);
      setUserDocs(docsRes.data || []);
      setUserConnections(connRes.data || []);
    } catch (err) {
      console.warn("Failed to load sharing inventory:", err.message);
    } finally {
      setLoading(false);
    }
  }

  // Handle Smart Share Pack Suggestion
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

  // Convert Smart Pack into a Create Share Wizard
  const handleProceedWithSmartPack = () => {
    if (!smartResult) return;
    setShareForm((prev) => ({
      ...prev,
      purpose: smartResult.suggestedTitle,
      documentIds: selectedSmartDocs,
    }));
    setShowCreateModal(true);
  };

  // Create New Share
  const handleCreateShareSubmit = async (e) => {
    e.preventDefault();
    if (shareForm.documentIds.length === 0) {
      alert("Please select at least one document to share.");
      return;
    }

    setSubmitting(true);
    try {
      // Parse redaction terms
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

      const payload = {
        documentIds: shareForm.documentIds,
        purpose: shareForm.purpose || "Secure Document Access",
        shareType: shareForm.shareType,
        recipientUserId: shareForm.recipientUserId || null,
        recipientEmail: shareForm.recipientEmail || null,
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
        fetchShares();
      }
    } catch (err) {
      alert("Failed to create share: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Immediate Revocation
  const handleRevokeShare = async (shareId) => {
    if (!window.confirm("Are you sure you want to revoke this share? All future access will be blocked immediately.")) return;

    try {
      const res = await apiRequest(`/api/shares/${shareId}`, { method: "DELETE" });
      if (res.success) {
        setSentShares((prev) =>
          prev.map((s) => (s._id === shareId ? { ...s, status: "REVOKED" } : s))
        );
      }
    } catch (err) {
      alert("Failed to revoke share: " + err.message);
    }
  };

  return (
    <div className="dv-share-center">
      <AppHeader
        title="Share Documents"
        subtitle="Share documents with trusted contacts and expiring links."
      />

      {/* Tabs */}
      <div className="dv-share-tabs">
        <button
          type="button"
          className={`dv-share-tab-btn ${activeTab === "SENT" ? "dv-share-tab-btn--active" : ""}`}
          onClick={() => setActiveTab("SENT")}
        >
          <Share2 size={16} /> Sent Shares ({sentShares.length})
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
          className={`dv-share-tab-btn ${activeTab === "SMART_PACK" ? "dv-share-tab-btn--active" : ""}`}
          onClick={() => setActiveTab("SMART_PACK")}
        >
          <Sparkles size={16} /> Smart Share Pack
        </button>

        <div style={{ marginLeft: "auto" }}>
          <Button
            variant="primary"
            size="md"
            icon={Plus}
            onClick={() => {
              setCreatedShareResult(null);
              setShowCreateModal(true);
            }}
          >
            Create Secure Share
          </Button>
        </div>
      </div>

      {/* TAB 1: SMART SHARE PACK BUILDER */}
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
            />
            <Button variant="primary" type="submit" loading={smartLoading} icon={Sparkles}>
              Suggest Pack
            </Button>
          </form>

          {smartResult && (
            <div style={{ marginTop: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>
                  {smartResult.suggestedTitle} ({smartResult.totalSuggested} recommended)
                </strong>
                <Button variant="secondary" size="sm" onClick={handleProceedWithSmartPack}>
                  Review & Share Selected ({selectedSmartDocs.length}) <ArrowRight size={14} />
                </Button>
              </div>

              {smartResult.missingItems.length > 0 && (
                <div style={{ padding: "8px 12px", background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "var(--radius-md)", fontSize: "11px", color: "var(--color-warning)" }}>
                  <AlertTriangle size={13} style={{ display: "inline", marginRight: 4 }} />
                  Checklist gaps: {smartResult.missingItems.join(", ")}
                </div>
              )}

              <div className="dv-smart-pack-suggestions">
                {smartResult.suggestedDocuments.map((doc) => {
                  const isChecked = selectedSmartDocs.includes(doc.documentId);
                  return (
                    <div key={doc.documentId} className="dv-smart-doc-pill">
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSmartDocs((prev) => [...prev, doc.documentId]);
                              } else {
                                setSelectedSmartDocs((prev) => prev.filter((id) => id !== doc.documentId));
                              }
                            }}
                          />
                          <span style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>{doc.title}</span>
                        </div>
                        <div className="dv-smart-doc-reasons">
                          {doc.reasons[0]}
                        </div>
                      </div>
                      <Badge size="sm">{doc.category}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SENT SHARES */}
      {activeTab === "SENT" && (
        <div>
          {loading ? (
            <div className="dv-shares-grid">
              {[1, 2, 3].map((i) => (
                <Card key={i} padding="md"><Skeleton height="120px" /></Card>
              ))}
            </div>
          ) : sentShares.length === 0 ? (
            <EmptyState
              title="No document shares created yet"
              description="Create an expiring share, set view/download permissions, or share a Smart Share Pack."
              actionLabel="Create First Share"
              onAction={() => setShowCreateModal(true)}
            />
          ) : (
            <div className="dv-shares-grid">
              {sentShares.map((share) => {
                const isRevoked = share.status === "REVOKED";
                const isExpired = share.status === "EXPIRED" || (share.expiresAt && new Date(share.expiresAt) <= new Date());
                const docs = share.documentIds || [];

                return (
                  <div key={share._id} className="dv-share-card">
                    <div className="dv-share-card-header">
                      <div>
                        <h4 className="dv-share-purpose">{share.purpose}</h4>
                        <span className="dv-share-recipient-info">
                          To: {share.recipientUserId?.name || share.recipientEmail || "Expiring Link"}
                        </span>
                      </div>
                      <Badge variant={isRevoked ? "danger" : isExpired ? "warning" : "success"} size="sm">
                        {isRevoked ? "Revoked" : isExpired ? "Expired" : "Active"}
                      </Badge>
                    </div>

                    <div className="dv-share-docs-list">
                      {docs.map((d) => (
                        <div key={d._id} className="dv-share-doc-item">
                          <span><FileText size={12} style={{ marginRight: 4 }} /> {d.title}</span>
                          <span style={{ color: "var(--color-text-secondary)" }}>{d.format}</span>
                        </div>
                      ))}
                    </div>

                    <div className="dv-share-security-badges">
                      {share.permissions?.download ? (
                        <span className="dv-share-badge"><Download size={11} /> Download Allowed</span>
                      ) : (
                        <span className="dv-share-badge"><Eye size={11} /> View Only</span>
                      )}
                      {share.watermarkEnabled && (
                        <span className="dv-share-badge"><ShieldCheck size={11} /> Watermarked</span>
                      )}
                      {share.passwordRequired && (
                        <span className="dv-share-badge"><Key size={11} /> Password</span>
                      )}
                      {share.otpRequired && (
                        <span className="dv-share-badge"><Lock size={11} /> OTP Protected</span>
                      )}
                      {share.expiresAt && (
                        <span className="dv-share-badge"><Clock size={11} /> Exp: {new Date(share.expiresAt).toLocaleDateString()}</span>
                      )}
                    </div>

                    <div className="dv-share-card-footer">
                      <Link to={`/shares/${share._id}/view`} style={{ fontSize: "var(--text-xs)", color: "var(--color-primary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
                        Open Viewer <ExternalLink size={12} />
                      </Link>

                      {!isRevoked && (
                        <button
                          type="button"
                          onClick={() => handleRevokeShare(share._id)}
                          style={{ border: "none", background: "transparent", color: "var(--color-danger)", cursor: "pointer", fontSize: "11px", fontWeight: 600 }}
                        >
                          Revoke Access
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SHARED WITH ME */}
      {activeTab === "RECEIVED" && (
        <div>
          {loading ? (
            <div className="dv-shares-grid">
              {[1, 2].map((i) => (
                <Card key={i} padding="md"><Skeleton height="100px" /></Card>
              ))}
            </div>
          ) : receivedShares.length === 0 ? (
            <EmptyState
              title="No documents shared with you"
              description="When connections share documents with your DocVault ID, they will appear here."
            />
          ) : (
            <div className="dv-shares-grid">
              {receivedShares.map((share) => (
                <div key={share._id} className="dv-share-card">
                  <div className="dv-share-card-header">
                    <div>
                      <h4 className="dv-share-purpose">{share.purpose}</h4>
                      <span className="dv-share-recipient-info">
                        From: {share.ownerId?.name || "User"} ({share.ownerId?.docVaultId})
                      </span>
                    </div>
                    <Badge variant="primary" size="sm">Active</Badge>
                  </div>

                  <div className="dv-share-docs-list">
                    {(share.documentIds || []).map((d) => (
                      <div key={d._id} className="dv-share-doc-item">
                        <span><FileText size={12} style={{ marginRight: 4 }} /> {d.title}</span>
                        <Link to={`/shares/${share._id}/view?doc=${d._id}`} style={{ fontSize: "11px", color: "var(--color-primary)" }}>
                          View <Eye size={10} />
                        </Link>
                      </div>
                    ))}
                  </div>

                  <div className="dv-share-card-footer">
                    <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                      {share.permissions?.download ? "View & Download permitted" : "View-only in controlled viewer"}
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

      {/* CREATE SHARE WIZARD MODAL */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={createdShareResult ? "Share Created Successfully!" : "Create Secure Document Share"}
      >
        {createdShareResult ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-success)" }}>
              <CheckCircle2 size={24} />
              <strong>Secure Share is Live</strong>
            </div>

            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
              Your documents have been authorized under strict privacy guardrails.
            </p>

            {createdShareResult.shareUrl && (
              <div style={{ background: "var(--color-surface-subtle)", padding: "10px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }}>
                <span style={{ fontSize: "11px", color: "var(--color-text-secondary)", display: "block" }}>Expiring Link (One-time copy):</span>
                <code style={{ fontSize: "12px", wordBreak: "break-all", color: "var(--color-primary)" }}>
                  {window.location.origin}{createdShareResult.shareUrl}
                </code>
              </div>
            )}

            <Button variant="primary" onClick={() => setShowCreateModal(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleCreateShareSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
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

            {/* Recipient */}
            <div className="dv-form-group">
              <label className="dv-input-label">Share Destination</label>
              <select
                className="dv-select-control"
                value={shareForm.shareType}
                onChange={(e) => setShareForm((p) => ({ ...p, shareType: e.target.value }))}
              >
                <option value="CONNECTION">Mutual DocVault Connection</option>
                <option value="LINK">Expiring Cryptographic Link</option>
              </select>
            </div>

            {shareForm.shareType === "CONNECTION" && (
              <div className="dv-form-group">
                <label className="dv-input-label">Select Mutual Connection</label>
                <select
                  className="dv-select-control"
                  value={shareForm.recipientUserId}
                  onChange={(e) => setShareForm((p) => ({ ...p, recipientUserId: e.target.value }))}
                >
                  <option value="">-- Choose Connection --</option>
                  {userConnections.map((c) => (
                    <option key={c.otherUser?._id} value={c.otherUser?._id}>
                      {c.otherUser?.name} ({c.otherUser?.docVaultId})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Permissions & Expiry */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
              <div className="dv-form-group">
                <label className="dv-input-label">Permission</label>
                <select
                  className="dv-select-control"
                  value={shareForm.permissions.download ? "DOWNLOAD" : "VIEW"}
                  onChange={(e) =>
                    setShareForm((p) => ({
                      ...p,
                      permissions: { view: true, download: e.target.value === "DOWNLOAD" },
                    }))
                  }
                >
                  <option value="VIEW">View Only (No Download)</option>
                  <option value="DOWNLOAD">View & Download</option>
                </select>
              </div>

              <div className="dv-form-group">
                <label className="dv-input-label">Expiry Duration</label>
                <select
                  className="dv-select-control"
                  value={shareForm.expiresInHours}
                  onChange={(e) => setShareForm((p) => ({ ...p, expiresInHours: e.target.value }))}
                >
                  <option value={1}>1 Hour</option>
                  <option value={24}>24 Hours</option>
                  <option value={168}>7 Days</option>
                  <option value={720}>30 Days</option>
                </select>
              </div>
            </div>

            {/* Optional Password & OTP */}
            <Input
              label="Share Password (Optional)"
              type="password"
              placeholder="Leave blank for no password"
              value={shareForm.password}
              onChange={(e) => setShareForm((p) => ({ ...p, password: e.target.value }))}
            />

            {/* Redaction Terms */}
            <Input
              label="Permanent Redaction Terms (Optional, comma-separated)"
              placeholder="e.g. 98192831, salary, confidential"
              value={shareForm.redactTermsText}
              onChange={(e) => setShareForm((p) => ({ ...p, redactTermsText: e.target.value }))}
            />

            <div className="dv-modal-form-actions">
              <Button variant="ghost" type="button" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={submitting}>
                Authorize & Create Share
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

