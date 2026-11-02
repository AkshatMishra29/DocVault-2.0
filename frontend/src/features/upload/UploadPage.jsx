import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiRequest } from "../../services/api";
import { 
  UploadCloud, FileText, CheckCircle2, AlertCircle, ArrowRight,
  ShieldCheck, Sparkles, Layers, Lock, Shield, EyeOff, FileCheck
} from "lucide-react";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import DocumentTypeIcon from "../../components/common/DocumentTypeIcon/DocumentTypeIcon";
import ExpiryBadge from "../../components/common/ExpiryBadge/ExpiryBadge";
import VerificationStatus from "../../components/common/VerificationStatus/VerificationStatus";

import "./UploadPage.css";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [privacyMode, setPrivacyMode] = useState("PROCESSABLE"); // 'PROCESSABLE' | 'STORAGE_ONLY'
  const [uploading, setUploading] = useState(false);
  const [progressStage, setProgressStage] = useState("");
  const [error, setError] = useState("");
  const [uploadedDoc, setUploadedDoc] = useState(null);

  const navigate = useNavigate();

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    setError("");
    const validTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!validTypes.includes(selectedFile.type)) {
      setError("Supported file formats are PDF, PNG, JPG, and WEBP.");
      return;
    }
    if (selectedFile.size > 25 * 1024 * 1024) {
      setError("File exceeds the maximum allowable limit of 25 MB.");
      return;
    }
    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError("");
    setProgressStage("Validating magic bytes and privacy guardrails...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("userConsent", privacyMode);
    formData.append("privacyMode", privacyMode);
    formData.append("aiPolicy", privacyMode === "STORAGE_ONLY" ? "storage_only" : "ai_enabled");
    formData.append("noticeVersion", "1.0.0");

    try {
      const stageTimer1 = setTimeout(() => {
        setProgressStage(
          privacyMode === "STORAGE_ONLY"
            ? "Encrypting and isolating in zero-AI storage..."
            : "Extracting text layer and running deterministic rule engine..."
        );
      }, 1200);

      const stageTimer2 = setTimeout(() => {
        if (privacyMode !== "STORAGE_ONLY") {
          setProgressStage("Executing verification gates (grounding & confidence scoring)...");
        }
      }, 2400);

      const res = await apiRequest("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);

      if (res.success && res.data) {
        let finalDoc = res.data;

        // If background processing is active, poll until completed or max 5 seconds
        if (finalDoc.status === "queued" || finalDoc.status === "processing") {
          setProgressStage("Finalizing extraction and structuring verified fields...");
          for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            try {
              const pollRes = await apiRequest(`/api/documents/${finalDoc._id}`);
              if (pollRes.success && pollRes.data) {
                finalDoc = pollRes.data;
                if (finalDoc.status === "completed" || finalDoc.status === "needs_review") {
                  break;
                }
              }
            } catch {
              // Ignore polling network glitches
            }
          }
        }

        setUploadedDoc(finalDoc);
      } else {
        setError(res.error || "Document upload failed.");
      }
    } catch (err) {
      setError(err.message || "Failed to process document upload.");
    } finally {
      setUploading(false);
      setProgressStage("");
    }
  };

  return (
    <div className="dv-upload-page">
      <AppHeader
        title="Document Ingestion & OCR"
        subtitle="Multi-tier text extraction, automated policy classification, and renewal schedule derivation."
      />

      <div className="dv-upload-content">
        {!uploadedDoc ? (
          <div className="dv-upload-grid">
            {/* Left: Interactive Dropzone & Controls */}
            <Card padding="lg" className="dv-dropzone-card">
              <div
                className={`dv-dropzone ${dragActive ? "dv-dropzone--active" : ""} ${file ? "dv-dropzone--has-file" : ""}`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  id="dv-file-input"
                  className="dv-file-input-hidden"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={handleFileChange}
                  disabled={uploading}
                />

                {!file ? (
                  <label htmlFor="dv-file-input" className="dv-dropzone-label">
                    <div className="dv-dropzone-icon-box">
                      <UploadCloud size={36} color="#015A47" />
                    </div>
                    <h3 className="dv-dropzone-title">Click to upload or drag and drop</h3>
                    <p className="dv-dropzone-sub">
                      PDF, Scanned PDFs, PNG, JPG, WEBP (Max 25 MB)
                    </p>
                  </label>
                ) : (
                  <div className="dv-file-selected-box">
                    <FileText size={36} color="#015A47" />
                    <div className="dv-file-selected-meta">
                      <span className="dv-file-selected-name">{file.name}</span>
                      <span className="dv-file-selected-size">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                    {!uploading && (
                      <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                        Change File
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Privacy Mode Option Selector */}
              <div className="dv-privacy-selector-box">
                <span className="dv-privacy-selector-title">Select Privacy Ingestion Mode</span>
                <div className="dv-privacy-options">
                  <label 
                    className={`dv-privacy-option ${privacyMode === "PROCESSABLE" ? "dv-privacy-option--active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="privacyConsent"
                      value="PROCESSABLE"
                      checked={privacyMode === "PROCESSABLE"}
                      onChange={() => setPrivacyMode("PROCESSABLE")}
                    />
                    <div className="dv-popt-text">
                      <div className="dv-popt-header">
                        <Sparkles size={16} color="#015A47" />
                        <strong>Standard Ingestion (OCR & Verification)</strong>
                      </div>
                      <p>Full text extraction, automated metadata structuring, deadline derivation, and Copilot Q&A.</p>
                    </div>
                  </label>

                  <label 
                    className={`dv-privacy-option ${privacyMode === "STORAGE_ONLY" ? "dv-privacy-option--active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="privacyConsent"
                      value="STORAGE_ONLY"
                      checked={privacyMode === "STORAGE_ONLY"}
                      onChange={() => setPrivacyMode("STORAGE_ONLY")}
                    />
                    <div className="dv-popt-text">
                      <div className="dv-popt-header">
                        <Lock size={16} color="#D97706" />
                        <strong>Storage-Only Mode (Zero-AI Isolation)</strong>
                      </div>
                      <p>Strictly encrypted storage for sensitive identity documents (Aadhaar, PAN). Excluded from OCR and external LLMs.</p>
                    </div>
                  </label>
                </div>
              </div>

              {error && (
                <div className="dv-upload-error" role="alert">
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}

              {uploading && (
                <div className="dv-upload-progress-box">
                  <div className="dv-btn__spinner" />
                  <span className="dv-upload-progress-text">{progressStage}</span>
                </div>
              )}

              <Button
                variant="primary"
                size="lg"
                disabled={!file || uploading}
                loading={uploading}
                icon={ArrowRight}
                iconPosition="right"
                onClick={handleUpload}
                className="dv-upload-submit-btn"
              >
                {privacyMode === "STORAGE_ONLY" ? "Secure in Storage-Only Vault" : "Execute Document Pipeline"}
              </Button>
            </Card>

            {/* Right: Pipeline Transparency Showcase */}
            <Card padding="lg" className="dv-upload-info-card">
              <div className="dv-upload-info-badge">
                <ShieldCheck size={16} />
                <span>DocVault Architecture</span>
              </div>
              <h3 className="dv-pipeline-title">4-Tier Grounded Extraction Flow</h3>
              <p className="dv-pipeline-sub">
                Every uploaded document flows through deterministic rules and multi-gate verification before entering your vault.
              </p>

              <div className="dv-pipeline-steps">
                <div className="dv-pstep">
                  <span className="dv-pstep-num">1</span>
                  <div>
                    <h4>Privacy Gate & Magic Bytes</h4>
                    <p>Enforces magic byte verification, casual photo filtering, and routes sensitive IDs to storage-only isolation.</p>
                  </div>
                </div>

                <div className="dv-pstep">
                  <span className="dv-pstep-num">2</span>
                  <div>
                    <h4>Hybrid Text Extraction</h4>
                    <p>Native PDF text layer extraction prioritized, falling back to local OCR for private on-device processing.</p>
                  </div>
                </div>

                <div className="dv-pstep">
                  <span className="dv-pstep-num">3</span>
                  <div>
                    <h4>Tier 1 Deterministic Rules Engine</h4>
                    <p>Regex matching for GSTIN, dates, invoice/policy numbers, stopping early before cloud inference.</p>
                  </div>
                </div>

                <div className="dv-pstep">
                  <span className="dv-pstep-num">4</span>
                  <div>
                    <h4>Independent Verification Gates</h4>
                    <p>5-gate verification (Grounding, Format, Logic) flags low-confidence data into your Review Queue.</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          /* Post-Upload Success Summary Receipt */
          <Card padding="lg" className="dv-upload-success-card">
            <div className="dv-success-header">
              <div className="dv-success-badge-icon">
                {uploadedDoc.privacyMode === "STORAGE_ONLY" ? (
                  <Lock size={32} color="#D97706" />
                ) : (
                  <CheckCircle2 size={32} color="#059669" />
                )}
              </div>
              <h2 className="dv-success-title">
                {uploadedDoc.privacyMode === "STORAGE_ONLY" 
                  ? "Document Isolated & Securely Stored" 
                  : "Document Analyzed & Saved to Vault"}
              </h2>
              <p className="dv-success-sub">
                {uploadedDoc.privacyMode === "STORAGE_ONLY"
                  ? "Zero-AI Storage-Only Mode active. Document content is protected from OCR or external AI models."
                  : "Metadata extracted, verified against source evidence, and indexed for Copilot retrieval."}
              </p>
            </div>

            <div className="dv-success-meta-box">
              <div className="dv-success-meta-row">
                <span className="dv-smeta-label">Privacy Policy Mode:</span>
                <span className="dv-smeta-val">
                  {uploadedDoc.privacyMode === "STORAGE_ONLY" ? (
                    <Badge variant="warning" size="sm">🔒 Storage Only (Zero AI)</Badge>
                  ) : (
                    <Badge variant="success" size="sm">✓ Processable Pipeline</Badge>
                  )}
                </span>
              </div>
              <div className="dv-success-meta-row">
                <span className="dv-smeta-label">Document Title:</span>
                <span className="dv-smeta-val"><strong>{uploadedDoc.title}</strong></span>
              </div>
              <div className="dv-success-meta-row">
                <span className="dv-smeta-label">Category:</span>
                <span className="dv-smeta-val">{uploadedDoc.category}</span>
              </div>
              {uploadedDoc.extractedFields && uploadedDoc.extractedFields.length > 0 && (
                <div className="dv-success-meta-row">
                  <span className="dv-smeta-label">Extracted Fields:</span>
                  <span className="dv-smeta-val">
                    <strong>{uploadedDoc.extractedFields.length} entities</strong> (Status: <code>{uploadedDoc.reviewStatus || 'accepted'}</code>)
                  </span>
                </div>
              )}
              {uploadedDoc.expiryDate && (
                <div className="dv-success-meta-row">
                  <span className="dv-smeta-label">Detected Expiry:</span>
                  <span className="dv-smeta-val dv-text-warning">
                    <ExpiryBadge expiryDate={uploadedDoc.expiryDate} size="sm" />
                    <span style={{ marginLeft: "8px" }}>{uploadedDoc.expiryDate} (Added to Deadlines)</span>
                  </span>
                </div>
              )}
              {uploadedDoc.summary && (
                <div className="dv-success-meta-row">
                  <span className="dv-smeta-label">Automated Abstract:</span>
                  <span className="dv-smeta-val">{uploadedDoc.summary}</span>
                </div>
              )}
            </div>

            <div className="dv-success-actions">
              <Button
                variant="outline"
                size="md"
                onClick={() => { setUploadedDoc(null); setFile(null); }}
              >
                Upload Another Document
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => navigate(`/documents/${uploadedDoc._id}`)}
              >
                Inspect Extracted Details
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
