import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiRequest, API_BASE_URL } from "../../services/api";
import { 
  ArrowLeft, Download, Trash2, Calendar, FileText, CheckCircle2,
  ShieldCheck, AlertTriangle, ExternalLink, Link2, Sparkles,
  Lock, Edit3, Check, X, Shield, Cpu, Tag
} from "lucide-react";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import Modal from "../../components/common/Modal/Modal";
import Skeleton from "../../components/common/Skeleton/Skeleton";
import DocumentTypeIcon from "../../components/common/DocumentTypeIcon/DocumentTypeIcon";
import ExpiryBadge from "../../components/common/ExpiryBadge/ExpiryBadge";
import VerificationStatus from "../../components/common/VerificationStatus/VerificationStatus";
import ExtractionConfidence from "../../components/common/ExtractionConfidence/ExtractionConfidence";

import "./DocumentDetailPage.css";

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [doc, setDoc] = useState(null);
  const [assets, setAssets] = useState([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [error, setError] = useState("");

  // User Field Correction State
  const [editingField, setEditingField] = useState(null);
  const [fieldValueInput, setFieldValueInput] = useState("");
  const [savingCorrection, setSavingCorrection] = useState(false);

  useEffect(() => {
    async function loadDocAndAssets() {
      try {
        setLoading(true);
        const [docRes, assetsRes] = await Promise.all([
          apiRequest(`/api/documents/${id}`).catch(() => ({ success: false })),
          apiRequest("/api/assets").catch(() => ({ data: [] })),
        ]);

        if (docRes?.success && docRes.data) {
          setDoc(docRes.data);
          if (docRes.data.assetId) {
            setSelectedAssetId(docRes.data.assetId);
          }
        } else {
          setError("Document not found in vault.");
        }

        if (assetsRes?.success && assetsRes.data) {
          setAssets(assetsRes.data);
        }
      } catch (err) {
        setError("Failed to retrieve document details.");
      } finally {
        setLoading(false);
      }
    }
    loadDocAndAssets();
  }, [id]);

  const handleDelete = async () => {
    try {
      setDeleting(true);
      const res = await apiRequest(`/api/documents/${id}`, { method: "DELETE" });
      if (res.success) {
        navigate("/documents");
      } else {
        alert(res.error || "Failed to delete document.");
      }
    } catch (err) {
      alert("Error deleting document.");
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleLinkAsset = async () => {
    if (!selectedAssetId) return;
    try {
      setLinking(true);
      const res = await apiRequest(`/api/documents/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ assetId: selectedAssetId }),
      });
      if (res.success && res.data) {
        setDoc(res.data);
        alert("Document successfully linked to selected asset.");
      }
    } catch (err) {
      alert("Failed to link asset: " + err.message);
    } finally {
      setLinking(false);
    }
  };

  // Fixed field correction: accepts field target directly to prevent async state race condition
  const handleFieldCorrection = async (action, targetField = null, overrideVal = null) => {
    const activeField = targetField || editingField;
    if (!activeField) return;

    try {
      setSavingCorrection(true);
      const res = await apiRequest("/api/extraction/correct-field", {
        method: "POST",
        body: JSON.stringify({
          documentId: id,
          fieldName: activeField.fieldName,
          action,
          correctedValue: overrideVal !== null ? overrideVal : fieldValueInput,
        }),
      });

      if (res.success) {
        // Refresh document from server
        const updatedRes = await apiRequest(`/api/documents/${id}`);
        if (updatedRes.success && updatedRes.data) {
          setDoc(updatedRes.data);
        }
        setEditingField(null);
      } else {
        alert(res.error || "Failed to update field.");
      }
    } catch (err) {
      alert(err.message || "Error updating field.");
    } finally {
      setSavingCorrection(false);
    }
  };

  const token = localStorage.getItem("token");
  const downloadUrl = `${API_BASE_URL}/api/documents/${id}/download?token=${token}`;

  return (
    <div className="dv-doc-detail-page">
      <AppHeader
        title={doc ? doc.title : "Document Inspection"}
        subtitle="Verified metadata, structured key-value entities, and direct download stream."
      />

      <div className="dv-doc-detail-content">
        {/* Navigation Toolbar */}
        <div className="dv-detail-top-nav">
          <Link to="/documents" className="dv-back-btn">
            <ArrowLeft size={16} /> Back to Documents
          </Link>

          {doc && (
            <div className="dv-detail-actions">
              <Link to={`/ask-ai?docId=${doc._id}`}>
                <Button variant="outline" size="sm" icon={Sparkles}>
                  Ask Copilot
                </Button>
              </Link>
              <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="primary" size="sm" icon={Download}>
                  Download Original
                </Button>
              </a>
              <Button
                variant="danger"
                size="sm"
                icon={Trash2}
                onClick={() => setShowDeleteModal(true)}
              >
                Delete
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="dv-detail-loading">
            <Skeleton height="180px" />
            <Skeleton height="320px" />
          </div>
        ) : error || !doc ? (
          <Card padding="lg" className="dv-detail-error-card">
            <AlertTriangle size={32} color="#DC2626" />
            <p className="dv-text-danger">{error || "Document not found in vault."}</p>
            <Link to="/documents">
              <Button variant="outline" size="sm">Return to Documents</Button>
            </Link>
          </Card>
        ) : (
          <div className="dv-detail-grid">
            {/* Left Column: Metadata, Summary & Extracted Fields */}
            <div className="dv-detail-main-col">
              {/* Document Overview Card */}
              <Card padding="lg" className="dv-detail-summary-card">
                <div className="dv-detail-summary-top">
                  <div className="dv-detail-type-wrap">
                    <DocumentTypeIcon 
                      category={doc.category} 
                      format={doc.format} 
                      size={24} 
                      isStorageOnly={doc.privacyMode === "STORAGE_ONLY"} 
                    />
                    <div>
                      <h2 className="dv-detail-heading">{doc.title}</h2>
                      <span className="dv-detail-original-filename">
                        Original File: <code>{doc.originalName || doc.title}</code>
                      </span>
                    </div>
                  </div>

                  <div className="dv-detail-status-group">
                    <Badge variant="primary" size="md">{doc.category || "General"}</Badge>
                    <VerificationStatus 
                      status={
                        doc.privacyMode === "STORAGE_ONLY" 
                          ? "storage_only" 
                          : doc.processingStatus === "needs_review" 
                          ? "needs_review" 
                          : "accepted"
                      } 
                      size="md" 
                    />
                  </div>
                </div>

                {doc.summary && (
                  <div className="dv-detail-summary-block">
                    <span className="dv-detail-block-label">Automated Abstract</span>
                    <p className="dv-detail-summary-text">{doc.summary}</p>
                  </div>
                )}

                {/* Expiry Banner if present */}
                {doc.expiryDate && (
                  <div className="dv-detail-expiry-box">
                    <div className="dv-detail-expiry-box__left">
                      <Calendar size={20} color="#D97706" />
                      <div>
                        <strong>Renewal Expiry Date: {doc.expiryDate}</strong>
                        <p>Tracked automatically in your active deadlines calendar.</p>
                      </div>
                    </div>
                    <ExpiryBadge expiryDate={doc.expiryDate} size="md" />
                  </div>
                )}

                {/* File Metadata Badges */}
                <div className="dv-detail-meta-row">
                  <div className="dv-meta-item">
                    <span className="dv-meta-item__label">Format</span>
                    <span className="dv-meta-item__val">{doc.format || "PDF"}</span>
                  </div>
                  <div className="dv-meta-item">
                    <span className="dv-meta-item__label">File Size</span>
                    <span className="dv-meta-item__val">{doc.fileSizeFormatted || "Stored"}</span>
                  </div>
                  <div className="dv-meta-item">
                    <span className="dv-meta-item__label">Storage Location</span>
                    <span className="dv-meta-item__val">MongoDB Internal Binary</span>
                  </div>
                  <div className="dv-meta-item">
                    <span className="dv-meta-item__label">Uploaded On</span>
                    <span className="dv-meta-item__val">{new Date(doc.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </Card>

              {/* Evidence-Based Structured Fields Ladder */}
              <Card padding="lg" className="dv-detail-entities-card">
                <div className="dv-entities-header">
                  <div>
                    <h3 className="dv-entities-title">Evidence-Based Extracted Fields</h3>
                    <p className="dv-entities-sub">
                      Calibrated extraction ladder with source grounding and human verification.
                    </p>
                  </div>
                  {doc.pipelineVersion && (
                    <span className="dv-pipeline-tag">Ladder v{doc.pipelineVersion}</span>
                  )}
                </div>

                {doc.extractedFields && doc.extractedFields.length > 0 ? (
                  <div className="dv-fields-ladder">
                    {doc.extractedFields.map((field, idx) => (
                      <div
                        key={idx}
                        className={`dv-field-item ${
                          field.verificationStatus === "needs_review" ? "dv-field-item--needs-review" : ""
                        }`}
                      >
                        <div className="dv-field-item__top">
                          <div>
                            <span className="dv-field-item__name">
                              {field.fieldName.replace(/_/g, " ")}
                            </span>
                            <div className="dv-field-item__value">
                              {String(field.value)}
                            </div>
                          </div>

                          <div className="dv-field-item__badges">
                            <VerificationStatus status={field.verificationStatus} size="sm" />
                            <ExtractionConfidence confidence={field.confidence} />
                          </div>
                        </div>

                        {field.evidence && (
                          <div className="dv-field-item__evidence">
                            <span className="dv-evidence-label">Source Evidence: </span>
                            "{field.evidence}"
                          </div>
                        )}

                        {field.rejectionReason && (
                          <div className="dv-field-item__rejection">
                            ⚠️ {field.rejectionReason}
                          </div>
                        )}

                        {/* Verification Controls */}
                        <div className="dv-field-item__actions">
                          {field.verificationStatus === "needs_review" && (
                            <button
                              type="button"
                              className="dv-field-action-btn dv-field-action-btn--confirm"
                              onClick={() => handleFieldCorrection("confirmed", field, field.value)}
                              disabled={savingCorrection}
                            >
                              <Check size={13} /> Confirm Value
                            </button>
                          )}
                          <button
                            type="button"
                            className="dv-field-action-btn dv-field-action-btn--edit"
                            onClick={() => {
                              setEditingField(field);
                              setFieldValueInput(String(field.value));
                            }}
                          >
                            <Edit3 size={13} /> Correct Value
                          </button>
                          {field.verificationStatus !== "rejected" && (
                            <button
                              type="button"
                              className="dv-field-action-btn dv-field-action-btn--reject"
                              onClick={() => handleFieldCorrection("rejected", field)}
                              disabled={savingCorrection}
                            >
                              <X size={13} /> Reject
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : doc.keyDetails && Object.keys(doc.keyDetails).length > 0 ? (
                  <div className="dv-entity-table">
                    {Object.entries(doc.keyDetails).map(([key, val]) => (
                      <div key={key} className="dv-entity-row">
                        <span className="dv-entity-key">{key.replace(/_/g, " ")}</span>
                        <span className="dv-entity-val">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="dv-text-muted">No structured keyDetails extracted from this document.</p>
                )}
              </Card>
            </div>

            {/* Right Column: Asset Linkage & Storage Security Audit */}
            <div className="dv-detail-sidebar-col">
              {/* Asset Linkage Card */}
              <Card padding="lg" className="dv-detail-sidebar-card">
                <h3 className="dv-sidebar-section-title">Link to Tracked Asset</h3>
                <p className="dv-sidebar-section-desc">
                  Associate this policy or invoice with an existing vehicle, appliance, or property.
                </p>

                <div className="dv-link-asset-box">
                  <select
                    className="dv-select-control"
                    value={selectedAssetId}
                    onChange={(e) => setSelectedAssetId(e.target.value)}
                  >
                    <option value="">Select an Asset...</option>
                    {assets.map((a) => (
                      <option key={a._id} value={a._id}>{a.name} ({a.category})</option>
                    ))}
                  </select>

                  <Button
                    variant="secondary"
                    size="md"
                    icon={Link2}
                    loading={linking}
                    disabled={!selectedAssetId}
                    onClick={handleLinkAsset}
                    style={{ width: "100%" }}
                  >
                    Link to Asset
                  </Button>
                </div>
              </Card>

              {/* Storage & Privacy Audit Card */}
              <Card padding="lg" className="dv-detail-sidebar-card">
                <h3 className="dv-sidebar-section-title">Storage & Security Audit</h3>
                <ul className="dv-detail-audit-list">
                  <li>
                    <ShieldCheck size={16} color="#059669" />
                    <span>Database-backed binary storage</span>
                  </li>
                  <li>
                    <CheckCircle2 size={16} color="#2563EB" />
                    <span>User-scoped tenant access constraint</span>
                  </li>
                  <li>
                    <CheckCircle2 size={16} color="#2563EB" />
                    <span>Hugging Face dense vector embedding</span>
                  </li>
                  {doc.privacyMode === "STORAGE_ONLY" && (
                    <li>
                      <Lock size={16} color="#D97706" />
                      <span>Isolated from external OCR/AI pipeline</span>
                    </li>
                  )}
                </ul>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* User Field Review & Correction Dialog */}
      <Modal
        isOpen={Boolean(editingField)}
        onClose={() => setEditingField(null)}
        title={`Edit Field: ${editingField?.fieldName.replace(/_/g, " ").toUpperCase()}`}
      >
        <div style={{ marginBottom: "16px" }}>
          <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
            Verify or correct this extracted value. Original extraction confidence was{" "}
            <strong>{editingField ? (editingField.confidence * 100).toFixed(0) : 0}%</strong>.
          </p>

          {editingField?.evidence && (
            <div className="dv-field-modal-evidence">
              <span style={{ color: "var(--color-text-muted)" }}>Evidence Quote: </span>
              "{editingField.evidence}"
            </div>
          )}

          <label className="dv-field-modal-label">
            Field Value
          </label>
          <input
            type="text"
            className="dv-field-modal-input"
            value={fieldValueInput}
            onChange={(e) => setFieldValueInput(e.target.value)}
          />
        </div>

        <div className="dv-confirm-actions">
          <Button variant="ghost" onClick={() => setEditingField(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={savingCorrection}
            onClick={() => handleFieldCorrection("corrected")}
          >
            Save Correction
          </Button>
        </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Document"
      >
        <p className="dv-confirm-text">
          Are you sure you want to permanently delete <strong>{doc?.title}</strong>? All associated deadline reminders and vector embeddings will also be removed.
        </p>
        <div className="dv-confirm-actions">
          <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={deleting} onClick={handleDelete}>
            Yes, Permanently Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
