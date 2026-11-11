import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiRequest } from "../../services/api";
import { 
  UploadCloud, FileText, CheckCircle2, AlertCircle, ArrowRight,
  ShieldCheck, Sparkles, Lock, Pencil
} from "lucide-react";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import DocumentTypeIcon from "../../components/common/DocumentTypeIcon/DocumentTypeIcon";
import ExpiryBadge from "../../components/common/ExpiryBadge/ExpiryBadge";
import VerificationStatus from "../../components/common/VerificationStatus/VerificationStatus";
import ExtractionInspector from "../../components/common/ExtractionInspector/ExtractionInspector";

import "./UploadPage.css";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [customTitle, setCustomTitle] = useState("");
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
    // Auto-populate the rename field with the base filename (strip extension)
    const baseName = selectedFile.name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
    setCustomTitle(baseName);
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError("");
    setProgressStage("Checking file security & signatures...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("userConsent", privacyMode);
    formData.append("privacyMode", privacyMode);
    formData.append("aiPolicy", privacyMode === "STORAGE_ONLY" ? "storage_only" : "ai_enabled");
    formData.append("noticeVersion", "1.0.0");
    // Append custom title so backend saves it under the user's chosen name
    const finalTitle = customTitle.trim() || file.name.replace(/\.[^/.]+$/, "");
    formData.append("title", finalTitle);

    try {
      const stageTimer1 = setTimeout(() => {
        setProgressStage(
          privacyMode === "STORAGE_ONLY"
            ? "Securing document in your private vault..."
            : "Validating document quality & structure..."
        );
      }, 700);

      const stageTimer2 = setTimeout(() => {
        if (privacyMode !== "STORAGE_ONLY") {
          setProgressStage("Verifying content and extracting key details...");
        }
      }, 1800);

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
          setProgressStage("Finalizing document details and reminders...");
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
        title="Document Ingestion"
        subtitle="Add policies, warranties, invoices, and certificates to your secure personal vault."
      />

      <div className="dv-upload-content">
        {/* Apple Zen 3D Ingestion Command Hero */}
        <div className="dv-upload-hero">
          <div className="dv-upload-hero__info">
            <div className="dv-upload-hero__kicker">
              <span className="dv-upload-hero__kicker-dot" />
              <span>Zero-Knowledge Ingestion Active</span>
            </div>
            <h2 className="dv-upload-hero__title">
              Secure Document <span className="dv-upload-hero__title-accent">Ingestion Engine</span>
            </h2>
            <p className="dv-upload-hero__desc">
              Upload contracts, identity proofs, invoices, or policies. Files are enhanced with Sharp, parsed with hybrid OCR, and indexed into your private encrypted vault.
            </p>
          </div>

          <div className="dv-upload-hero__badge">
            <div className="dv-upload-hero__badge-num">25 MB</div>
            <div className="dv-upload-hero__badge-label">Max Limit • PDF, JPG, PNG, WEBP</div>
          </div>
        </div>

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
                      <UploadCloud size={34} />
                    </div>
                    <h3 className="dv-dropzone-title">Click to browse or drag and drop files</h3>
                    <p className="dv-dropzone-sub">
                      Drag any document scan or photo directly onto this surface
                    </p>
                    <div className="dv-dropzone-formats">
                      <span className="dv-format-pill">PDF (Digital & Scanned)</span>
                      <span className="dv-format-pill">PNG</span>
                      <span className="dv-format-pill">JPG / JPEG</span>
                      <span className="dv-format-pill">WEBP</span>
                    </div>
                  </label>
                ) : (
                  <div className="dv-file-selected-box">
                    <div className="dv-file-selected-icon">
                      <FileText size={32} />
                    </div>
                    <div className="dv-file-selected-meta">
                      <span className="dv-file-selected-name">{file.name}</span>
                      <span className="dv-file-selected-size">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB • Ready for processing
                      </span>
                    </div>
                    {!uploading && (
                      <Button variant="outline" size="sm" onClick={() => { setFile(null); setCustomTitle(""); }}>
                        Change
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Document Rename Field — shown only after a file is chosen */}
              {file && (
                <div className="dv-rename-box">
                  <label className="dv-rename-label" htmlFor="dv-custom-title">
                    <Pencil size={14} />
                    <span>Document Title <span className="dv-rename-hint">(rename before saving)</span></span>
                  </label>
                  <input
                    id="dv-custom-title"
                    type="text"
                    className="dv-rename-input"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="Enter a readable title for this document…"
                    maxLength={120}
                    disabled={uploading}
                  />
                  <p className="dv-rename-tip">
                    This name will be shown in your vault and search results.
                  </p>
                </div>
              )}

              {/* Privacy Mode Option Selector */}
              <div className="dv-privacy-selector-box">
                <span className="dv-privacy-selector-title">Processing & Privacy Preferences</span>
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
                        <Sparkles size={16} color="#0070F2" />
                        <strong>Standard Intelligent Processing</strong>
                      </div>
                      <p>Automatically organizes dates, renewal deadlines, key policy terms, and enables Copilot questions.</p>
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
                        <Lock size={16} color="#E9730C" />
                        <strong>Secure Vault Storage Only</strong>
                      </div>
                      <p>Encrypted personal storage for sensitive identity documents (Aadhaar, PAN). Excluded from automated indexing.</p>
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
                  <div className="dv-upload-progress-pulse" />
                  <div className="dv-upload-progress-info">
                    <span className="dv-upload-progress-title">Pipeline Ingestion Active</span>
                    <span className="dv-upload-progress-text">{progressStage}</span>
                  </div>
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
                {privacyMode === "STORAGE_ONLY" ? "Save to Secure Vault" : "Upload & Process Document"}
              </Button>
            </Card>

            {/* Right: Pipeline Transparency Card */}
            <Card padding="lg" className="dv-upload-info-card">
              <div className="dv-upload-info-badge">
                <ShieldCheck size={16} />
                <span>Zero-Trust Architecture</span>
              </div>
              <h3 className="dv-pipeline-title">How DocVault Ingests & Protects</h3>
              <p className="dv-pipeline-sub">
                Every document added to your vault is processed securely with zero external model training and air-tight tenant boundaries.
              </p>

              <div className="dv-pipeline-steps">
                <div className="dv-pstep">
                  <span className="dv-pstep-num">1</span>
                  <div>
                    <h4>Sharp Image Conditioning</h4>
                    <p>Applies grayscale normalization and contrast edge sharpening to ensure crystal-clear character boundaries.</p>
                  </div>
                </div>

                <div className="dv-pstep">
                  <span className="dv-pstep-num">2</span>
                  <div>
                    <h4>Hybrid OCR & Vision Cascade</h4>
                    <p>Extracts text with Tesseract.js WASM; automatically cascades to Groq Vision VLM for tilted/blurred phone photos.</p>
                  </div>
                </div>

                <div className="dv-pstep">
                  <span className="dv-pstep-num">3</span>
                  <div>
                    <h4>Entity Structuring & Deadlines</h4>
                    <p>Identifies policy numbers, coverage limits, and renewal cutoffs, scheduling RFC-5545 calendar reminders.</p>
                  </div>
                </div>

                <div className="dv-pstep">
                  <span className="dv-pstep-num">4</span>
                  <div>
                    <h4>Air-Tight Bounded RAG</h4>
                    <p>Generates dense vector embeddings for conversational retrieval strictly isolated to your personal vault.</p>
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
                  ? "Document Safely Stored" 
                  : "Document Successfully Added"}
              </h2>
              <p className="dv-success-sub">
                {uploadedDoc.privacyMode === "STORAGE_ONLY"
                  ? "Document stored in encrypted personal isolation. Excluded from AI processing."
                  : "Key details organized, verified, and ready for search and Copilot assistance."}
              </p>
            </div>

            <div className="dv-success-meta-box">
              <div className="dv-success-meta-row">
                <span className="dv-smeta-label">Storage Mode:</span>
                <span className="dv-smeta-val">
                  {uploadedDoc.privacyMode === "STORAGE_ONLY" ? (
                    <Badge variant="warning" size="sm">🔒 Secure Storage Only</Badge>
                  ) : (
                    <Badge variant="success" size="sm">✓ Intelligent Vault</Badge>
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
                  <span className="dv-smeta-label">Identified Details:</span>
                  <span className="dv-smeta-val">
                    <strong>{uploadedDoc.extractedFields.length} key fields</strong>
                  </span>
                </div>
              )}
              {uploadedDoc.expiryDate && (
                <div className="dv-success-meta-row">
                  <span className="dv-smeta-label">Renewal Due:</span>
                  <span className="dv-smeta-val dv-text-warning">
                    <ExpiryBadge expiryDate={uploadedDoc.expiryDate} size="sm" />
                    <span style={{ marginLeft: "8px" }}>{uploadedDoc.expiryDate} (Added to Deadlines)</span>
                  </span>
                </div>
              )}
              {uploadedDoc.summary && (
                <div className="dv-success-meta-row">
                  <span className="dv-smeta-label">Summary:</span>
                  <span className="dv-smeta-val">{uploadedDoc.summary}</span>
                </div>
              )}
            </div>

            {/* Live Testing Extraction Diagnostics Inspector */}
            <ExtractionInspector doc={uploadedDoc} defaultExpanded={true} />

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
                View Document
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
