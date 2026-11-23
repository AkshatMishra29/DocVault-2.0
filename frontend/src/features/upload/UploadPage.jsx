import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { apiRequest } from "../../services/api";
import { 
  UploadCloud, FileText, CheckCircle2, AlertCircle, ArrowRight, Camera, Zap,
  ShieldCheck, Sparkles, Lock, Pencil, ShieldAlert, Eye, ExternalLink
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
  const [customTitle, setCustomTitle] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [privacyMode, setPrivacyMode] = useState("PROCESSABLE"); // 'PROCESSABLE' | 'STORAGE_ONLY'
  const [uploading, setUploading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [isCameraScan, setIsCameraScan] = useState(false);
  const [progressStage, setProgressStage] = useState("");
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [duplicateDoc, setDuplicateDoc] = useState(null);
  const [uploadedDoc, setUploadedDoc] = useState(null);

  const navigate = useNavigate();
  const location = useLocation();

  // Auto-trigger camera or file selector when routed from Swipe Drawer
  useEffect(() => {
    const mode = location.state?.mode || (new URLSearchParams(location.search)).get("mode");
    if (mode === "camera") {
      const timer = setTimeout(() => {
        document.getElementById("dv-camera-input")?.click();
      }, 150);
      return () => clearTimeout(timer);
    } else if (mode === "file" || mode === "gallery") {
      const timer = setTimeout(() => {
        document.getElementById("dv-file-input")?.click();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [location.state?.mode, location.search]);

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

  // Client-side Canvas Image Optimizer (Google Files-style downscale & sharpen preparation)
  const optimizeImageForOCR = async (imageFile) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(imageFile);
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        const MAX_DIM = 2200; // Optimal resolution for high-accuracy OCR without bloat
        let { width, height } = img;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        // High quality bicubic smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const optFile = new File([blob], imageFile.name.replace(/\.[^/.]+$/, "") + "-scan.jpg", {
                type: "image/jpeg",
                lastModified: Date.now(),
              });
              resolve(optFile);
            } else {
              resolve(imageFile);
            }
          },
          "image/jpeg",
          0.85
        );
      };
      img.onerror = () => resolve(imageFile);
    });
  };

  // Client-Side Blur & Clarity Detection Guardrail (< 20ms using offscreen canvas)
  const checkImageClarity = (imageFile) => {
    return new Promise((resolve) => {
      if (!imageFile || !imageFile.type.startsWith("image/")) {
        return resolve({ isBlurry: false });
      }
      const img = new Image();
      const objectUrl = URL.createObjectURL(imageFile);
      img.src = objectUrl;
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        try {
          const canvas = document.createElement("canvas");
          const targetW = Math.min(img.width, 800);
          const targetH = Math.round((img.height * targetW) / img.width);
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return resolve({ isBlurry: false });
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const imgData = ctx.getImageData(0, 0, targetW, targetH);
          const data = imgData.data;

          const gray = new Uint8Array(targetW * targetH);
          for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
          }

          let sum = 0, sumSq = 0, count = 0;
          for (let y = 1; y < targetH - 1; y += 2) {
            const row = y * targetW;
            const prev = (y - 1) * targetW;
            const next = (y + 1) * targetW;
            for (let x = 1; x < targetW - 1; x += 2) {
              const lap = -4 * gray[row + x] + gray[row + x - 1] + gray[row + x + 1] + gray[prev + x] + gray[next + x];
              sum += lap;
              sumSq += lap * lap;
              count++;
            }
          }
          const mean = count > 0 ? sum / count : 0;
          const variance = count > 0 ? (sumSq / count) - (mean * mean) : 0;
          const stdev = Math.sqrt(Math.max(0, variance));
          // If stdev < 5.0 or variance < 25.0, image is too blurry for secure text extraction
          const isBlurry = stdev < 5.0 || variance < 25.0;
          resolve({ isBlurry, variance, stdev });
        } catch {
          resolve({ isBlurry: false });
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ isBlurry: false });
      };
    });
  };

  const handleCameraCapture = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const rawFile = e.target.files[0];
      setOptimizing(true);
      try {
        const optimized = await optimizeImageForOCR(rawFile);
        setIsCameraScan(true);
        validateAndSetFile(optimized);
      } catch (err) {
        validateAndSetFile(rawFile);
      } finally {
        setOptimizing(false);
      }
    }
  };

  const validateAndSetFile = (selectedFile) => {
    setError("");
    setSuggestion("");
    setDuplicateDoc(null);
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

    // Instant client-side blur guardrail check
    if (selectedFile.type.startsWith("image/")) {
      checkImageClarity(selectedFile).then(({ isBlurry }) => {
        if (isBlurry) {
          setError("Security Guardrail: The uploaded document image is too blurry. Text edges are unreadable.");
          setSuggestion("Please hold your camera steady, ensure clear focus on the text, and recapture with good lighting.");
        }
      });
    }
  };

  const handleUpload = async (forceDuplicate = false) => {
    if (!file) return;

    setUploading(true);
    setError("");
    setDuplicateDoc(null);
    setProgressStage("Checking file security & signatures...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("userConsent", privacyMode);
    formData.append("privacyMode", privacyMode);
    formData.append("aiPolicy", privacyMode === "STORAGE_ONLY" ? "storage_only" : "ai_enabled");
    formData.append("noticeVersion", "1.0.0");
    if (forceDuplicate) {
      formData.append("allowDuplicate", "true");
    }
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

      // Handle Duplicate Document Guardrail detection
      if (res.code === "DUPLICATE_DOCUMENT" || res.status === "DUPLICATE") {
        setDuplicateDoc(res.duplicateDocument);
        setError(res.error || "Duplicate document detected.");
        setSuggestion(res.suggestion || "This file is already secured in your vault.");
        return;
      }

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
        setSuggestion(res.suggestion || "");
      }
    } catch (err) {
      setError(err.message || "Failed to process document upload.");
      setSuggestion("");
    } finally {
      setUploading(false);
      setProgressStage("");
    }
  };

  return (
    <div className="dv-upload-page">
      <AppHeader
        title="Add a Document"
        subtitle="Upload any PDF or image — we'll read and organize it automatically."
      />

      <div className="dv-upload-content">
        {/* Apple Zen 3D Ingestion Command Hero */}
        <div className="dv-upload-hero">
          <div className="dv-upload-hero__info">
            <h2 className="dv-upload-hero__title">
              Upload a <span className="dv-upload-hero__title-accent">New Document</span>
            </h2>
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
                  disabled={uploading || optimizing}
                />
                <input
                  type="file"
                  id="dv-camera-input"
                  className="dv-file-input-hidden"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCameraCapture}
                  disabled={uploading || optimizing}
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

                    <div style={{ marginTop: "14px", display: "flex", gap: "10px", justifyContent: "center" }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          document.getElementById("dv-camera-input")?.click();
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 18px",
                          borderRadius: "9999px",
                          background: "linear-gradient(135deg, #0070F2 0%, #4F46E5 100%)",
                          color: "#FFFFFF",
                          border: "none",
                          fontSize: "13px",
                          fontWeight: "700",
                          cursor: "pointer",
                          boxShadow: "0 4px 14px rgba(0, 112, 242, 0.35)",
                          transition: "all 0.2s ease"
                        }}
                      >
                        <Camera size={16} />
                        <span>Quick Scan with Camera</span>
                      </button>
                    </div>
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
                      <span className="dv-file-selected-size" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span>{(file.size / (1024 * 1024)).toFixed(2)} MB • Ready for processing</span>
                        {isCameraScan && (
                          <span style={{ fontSize: "11px", fontWeight: "700", background: "rgba(16, 185, 129, 0.15)", color: "#10B981", padding: "2px 8px", borderRadius: "9999px" }}>
                            ⚡ Mobile Scan Optimized
                          </span>
                        )}
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

              {/* Privacy Mode Option Selector — locked during upload */}
              <div className="dv-privacy-selector-box">
                <span className="dv-privacy-selector-title">
                  Processing &amp; Privacy Preferences
                  {uploading && (
                    <span style={{ marginLeft: 10, fontSize: "11px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
                      🔒 Locked during upload
                    </span>
                  )}
                </span>
                <div
                  className="dv-privacy-options"
                  style={uploading ? { opacity: 0.55, pointerEvents: "none", userSelect: "none" } : {}}
                >
                  <label
                    className={`dv-privacy-option ${privacyMode === "PROCESSABLE" ? "dv-privacy-option--active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="privacyConsent"
                      value="PROCESSABLE"
                      checked={privacyMode === "PROCESSABLE"}
                      onChange={() => !uploading && setPrivacyMode("PROCESSABLE")}
                      disabled={uploading}
                    />
                    <div className="dv-popt-text">
                      <div className="dv-popt-header">
                        <Sparkles size={16} color="#0070F2" />
                        <strong>Smart Processing</strong>
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
                      onChange={() => !uploading && setPrivacyMode("STORAGE_ONLY")}
                      disabled={uploading}
                    />
                    <div className="dv-popt-text">
                      <div className="dv-popt-header">
                        <Lock size={16} color="#E9730C" />
                        <strong>Private Storage Only</strong>
                      </div>
                      <p>Encrypted personal storage for sensitive identity documents (Aadhaar, PAN). Excluded from automated indexing.</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Duplicate Document Guardrail Card */}
              {duplicateDoc ? (
                <div className="dv-duplicate-alert-card" role="alert">
                  <div className="dv-duplicate-alert-header">
                    <div className="dv-duplicate-alert-icon">
                      <ShieldAlert size={22} />
                    </div>
                    <div>
                      <h4 className="dv-duplicate-alert-title">Security Guardrail: Duplicate Document</h4>
                      <p className="dv-duplicate-alert-desc">
                        You have already secured this exact file as <strong>"{duplicateDoc.title}"</strong> ({duplicateDoc.date || "Active in Vault"}).
                      </p>
                    </div>
                  </div>

                  <div className="dv-duplicate-alert-actions">
                    <Link to={`/documents/${duplicateDoc.id}`} className="dv-btn-view-existing">
                      <Eye size={15} />
                      <span>View Existing Document</span>
                    </Link>
                    <button
                      type="button"
                      className="dv-btn-choose-different"
                      onClick={() => {
                        setFile(null);
                        setDuplicateDoc(null);
                        setError("");
                        setSuggestion("");
                      }}
                    >
                      Choose a Different File
                    </button>
                    <button
                      type="button"
                      className="dv-btn-force-upload"
                      onClick={() => handleUpload(true)}
                      title="Keep two identical copies in your vault"
                    >
                      Save as Duplicate Copy Anyway
                    </button>
                  </div>
                </div>
              ) : error ? (
                <div className="dv-upload-error" role="alert">
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2, color: "var(--color-danger)" }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontWeight: 600 }}>{error}</span>
                      {suggestion && (
                        <span style={{ fontSize: "var(--text-xs)", opacity: 0.9, color: "var(--color-text-secondary)" }}>
                          💡 <em>{suggestion}</em>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {uploading && (
                <div className="dv-upload-progress-box">
                  <div className="dv-upload-progress-pulse" />
                  <div className="dv-upload-progress-info">
                    <span className="dv-upload-progress-title">Processing your document...</span>
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

            {/* Right: Why DocVault */}
            <Card padding="lg" className="dv-upload-info-card">
              <h3 className="dv-pipeline-title">What happens after you upload?</h3>
              <ul className="dv-pipeline-steps" style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "16px", marginTop: "12px" }}>
                <li className="dv-pstep">
                  <span className="dv-pstep-num">1</span>
                  <div>
                    <h4>Key details extracted automatically</h4>
                    <p>Dates, renewal deadlines, policy numbers, and other important fields are identified and saved for you.</p>
                  </div>
                </li>
                <li className="dv-pstep">
                  <span className="dv-pstep-num">2</span>
                  <div>
                    <h4>Reminders set for expiry dates</h4>
                    <p>Any renewal or expiry date found is added to your Renewals tracker automatically.</p>
                  </div>
                </li>
                <li className="dv-pstep">
                  <span className="dv-pstep-num">3</span>
                  <div>
                    <h4>Searchable by AI</h4>
                    <p>Ask plain-English questions about this document anytime using the AI Assistant.</p>
                  </div>
                </li>
              </ul>
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
