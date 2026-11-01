import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiRequest, API_BASE_URL } from "../../services/api";
import { 
  ArrowLeft, Download, Trash2, Calendar, FileText, CheckCircle2,
  ShieldCheck, AlertTriangle, ExternalLink, Link2, Sparkles,
  Lock, Edit3, Check, X
} from "lucide-react";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import Modal from "../../components/common/Modal/Modal";
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
          apiRequest(`/api/documents/${id}`),
          apiRequest("/api/assets"),
        ]);

        if (docRes.success && docRes.data) {
          setDoc(docRes.data);
        } else {
          setError("Document not found in vault.");
        }

        if (assetsRes.success && assetsRes.data) {
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
      }
    } catch (err) {
      console.warn("Link asset failed:", err.message);
    } finally {
      setLinking(false);
    }
  };

  const handleFieldCorrection = async (action, overrideVal = null) => {
    if (!editingField) return;
    try {
      setSavingCorrection(true);
      const res = await apiRequest('/api/extraction/correct-field', {
        method: 'POST',
        body: JSON.stringify({
          documentId: id,
          fieldName: editingField.fieldName,
          action,
          correctedValue: overrideVal !== null ? overrideVal : fieldValueInput,
        }),
      });

      if (res.success && res.document) {
        setDoc(res.document);
        setEditingField(null);
      } else {
        alert(res.error || 'Failed to update field.');
      }
    } catch (err) {
      alert(err.message || 'Error updating field.');
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
        <div className="dv-detail-top-nav">
          <Link to="/documents" className="dv-back-btn">
            <ArrowLeft size={16} /> Back to Repository
          </Link>

          {doc && (
            <div className="dv-detail-actions">
              <Link to={`/ask-ai?docId=${doc._id}`}>
                <Button variant="secondary" size="sm" icon={Sparkles}>
                  Ask Copilot About This Doc
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
          <div className="dv-docs-loading">
            <div className="dv-btn__spinner" />
            <span>Decrypting document metadata...</span>
          </div>
        ) : error || !doc ? (
          <Card padding="lg">
            <p className="dv-text-danger">{error || "Document not found."}</p>
          </Card>
        ) : (
          <div className="dv-detail-grid">
            {/* Left Column: Metadata & Extracted Key Details */}
            <div className="dv-detail-col">
              <Card padding="lg" className="dv-detail-summary-card">
                <div className="dv-detail-card-header" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <Badge variant="primary" size="md">{doc.category}</Badge>
                  {doc.privacyMode === 'STORAGE_ONLY' ? (
                    <Badge variant="danger" size="md">🔒 Storage-Only Isolated</Badge>
                  ) : doc.processingStatus === 'needs_review' ? (
                    <Badge variant="warning" size="md">⚠️ Needs Verification</Badge>
                  ) : (
                    <Badge variant="success" size="md">✓ Verified Document</Badge>
                  )}
                  <span className="dv-text-muted">{doc.format} • {doc.fileSizeFormatted}</span>
                </div>

                <h2 className="dv-detail-heading">{doc.title}</h2>
                <p className="dv-detail-summary-text">{doc.summary || "No automated summary generated."}</p>

                {doc.expiryDate && (
                  <div className="dv-detail-expiry-box">
                    <Calendar size={18} color="#D97706" />
                    <div>
                      <strong>Renewal Expiry Date: {doc.expiryDate}</strong>
                      <p>Tracked in your active deadlines calendar.</p>
                    </div>
                  </div>
                )}
              </Card>

              {/* Evidence-Based Structured Fields with Verification Provenance */}
              <Card padding="lg" className="dv-detail-entities-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <h3 className="dv-entities-title" style={{ margin: 0 }}>Evidence-Based Extracted Fields</h3>
                    <p className="dv-entities-sub" style={{ margin: '4px 0 0' }}>Calibrated extraction ladder with source grounding and confidence scoring.</p>
                  </div>
                  {doc.pipelineVersion && (
                    <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>
                      v{doc.pipelineVersion}
                    </span>
                  )}
                </div>

                {doc.extractedFields && doc.extractedFields.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {doc.extractedFields.map((field, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '12px',
                          borderRadius: '8px',
                          background: 'var(--color-surface-secondary, rgba(255,255,255,0.03))',
                          border: field.verificationStatus === 'needs_review' 
                            ? '1px solid rgba(234, 179, 8, 0.4)' 
                            : '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              {field.fieldName.replace(/_/g, ' ')}
                            </span>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '2px' }}>
                              {String(field.value)}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              background: field.verificationStatus === 'accepted' || field.verificationStatus === 'user_corrected'
                                ? 'rgba(16, 185, 129, 0.15)' 
                                : 'rgba(234, 179, 8, 0.15)',
                              color: field.verificationStatus === 'accepted' || field.verificationStatus === 'user_corrected'
                                ? '#10b981' 
                                : '#facc15',
                            }}>
                              {field.verificationStatus === 'user_corrected' 
                                ? 'User Corrected' 
                                : field.verificationStatus === 'accepted' 
                                ? 'Accepted' 
                                : 'Needs Review'}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                              {(field.confidence * 100).toFixed(0)}% conf
                            </span>
                          </div>
                        </div>

                        {field.evidence && (
                          <div style={{
                            fontSize: '11.5px',
                            color: 'var(--color-text-secondary)',
                            background: 'rgba(0,0,0,0.2)',
                            padding: '6px 10px',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            marginTop: '6px'
                          }}>
                            <span style={{ color: 'var(--color-text-muted)' }}>Source Evidence: </span>
                            "{field.evidence}"
                          </div>
                        )}

                        {field.rejectionReason && (
                          <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#f87171' }}>
                            ⚠️ {field.rejectionReason}
                          </p>
                        )}

                        {/* Review / Correction Actions */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
                          {field.verificationStatus === 'needs_review' && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingField(field);
                                handleFieldCorrection('confirmed', field.value);
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(16, 185, 129, 0.12)',
                                color: '#10b981',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                borderRadius: '4px',
                                padding: '4px 10px',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              <Check size={12} /> Confirm Value
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingField(field);
                              setFieldValueInput(String(field.value));
                            }}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: 'transparent',
                              color: 'var(--color-text-secondary)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '4px',
                              padding: '4px 10px',
                              fontSize: '11.5px',
                              cursor: 'pointer',
                            }}
                          >
                            <Edit3 size={12} /> Edit / Correct
                          </button>
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
                  <p className="dv-text-muted">No specific keyDetails detected in this document.</p>
                )}
              </Card>
            </div>

            {/* Right Column: Asset Linkage & File Verification */}
            <div className="dv-detail-col">
              <Card padding="lg" className="dv-detail-sidebar-card">
                <h3 className="dv-sidebar-section-title">Link to Household or Vehicle Asset</h3>
                <p className="dv-sidebar-section-desc">Associate this policy or invoice with an asset in your registry.</p>

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
                  >
                    Link Asset
                  </Button>
                </div>
              </Card>

              <Card padding="lg" className="dv-detail-sidebar-card">
                <h3 className="dv-sidebar-section-title">Storage & Security Audit</h3>
                <ul className="dv-detail-audit-list">
                  <li>
                    <ShieldCheck size={16} color="#059669" />
                    <span>Database-backed binary file storage</span>
                  </li>
                  <li>
                    <CheckCircle2 size={16} color="#2563EB" />
                    <span>Tenant ID bound strictly to your account</span>
                  </li>
                  <li>
                    <CheckCircle2 size={16} color="#2563EB" />
                    <span>Hugging Face dense vector embedded</span>
                  </li>
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
        title={`Review Field: ${editingField?.fieldName.replace(/_/g, ' ').toUpperCase()}`}
      >
        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
            Verify or correct this extracted value. Original extraction confidence was <strong>{editingField ? (editingField.confidence * 100).toFixed(0) : 0}%</strong>.
          </p>

          {editingField?.evidence && (
            <div style={{ fontSize: '12px', background: 'rgba(0,0,0,0.25)', padding: '8px 12px', borderRadius: '6px', marginBottom: '14px', fontFamily: 'monospace' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Evidence Quote: </span>
              "{editingField.evidence}"
            </div>
          )}

          <label style={{ fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '6px', color: 'var(--color-text-primary)' }}>
            Field Value
          </label>
          <input
            type="text"
            className="dv-select-control"
            value={fieldValueInput}
            onChange={(e) => setFieldValueInput(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        <div className="dv-confirm-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant="ghost" onClick={() => setEditingField(null)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={() => handleFieldCorrection('rejected')}>
            Reject Field
          </Button>
          <Button
            variant="primary"
            loading={savingCorrection}
            onClick={() => handleFieldCorrection('corrected')}
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
