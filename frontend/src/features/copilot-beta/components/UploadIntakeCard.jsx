import React, { useState } from "react";
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Cpu,
  Cloud,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { API_BASE_URL } from "../../../services/api/apiClient";

export default function UploadIntakeCard({
  file,
  onCancel,
  onUploadComplete,
}) {
  const [title, setTitle] = useState(() =>
    file ? file.name.replace(/\.[^/.]+$/, "") : ""
  );
  const [privacyMode, setPrivacyMode] = useState("PROCESSABLE"); // 'PROCESSABLE' | 'STORAGE_ONLY'
  const [autoFlashcard, setAutoFlashcard] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [stageText, setStageText] = useState("");
  const [error, setError] = useState("");
  const [duplicateDoc, setDuplicateDoc] = useState(null);
  const [uploadedDoc, setUploadedDoc] = useState(null);

  if (!file) return null;

  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const sizeLabel =
    file.size > 1024 * 1024
      ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
      : `${Math.max(1, Math.round(file.size / 1024))} KB`;

  const executeUpload = async (allowDuplicate = false) => {
    setUploading(true);
    setError("");
    setDuplicateDoc(null);
    setStageText("Checking file security & magic bytes...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title.trim() || file.name.replace(/\.[^/.]+$/, ""));
    formData.append("userConsent", privacyMode);
    formData.append("privacyMode", privacyMode);
    formData.append(
      "aiPolicy",
      privacyMode === "STORAGE_ONLY" ? "storage_only" : "ai_enabled"
    );
    formData.append("noticeVersion", "1.0.0");
    if (allowDuplicate) {
      formData.append("allowDuplicate", "true");
    }

    const t1 = setTimeout(() => {
      setStageText(
        privacyMode === "STORAGE_ONLY"
          ? "Encrypting & securing in Cloud Vault..."
          : "Validating clarity & extracting document text..."
      );
    }, 650);

    const t2 = setTimeout(() => {
      setStageText(
        privacyMode === "STORAGE_ONLY"
          ? "Finalizing zero-AI vault backup..."
          : "Indexing content for Copilot & Flashcards..."
      );
    }, 1800);

    try {
      const token =
        localStorage.getItem("docvault_token") ||
        localStorage.getItem("token") ||
        "";

      const res = await fetch(`${API_BASE_URL}/api/documents/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const data = await res.json();

      clearTimeout(t1);
      clearTimeout(t2);

      if (res.status === 409 && data.code === "DUPLICATE_DOCUMENT") {
        setDuplicateDoc(data.duplicateDocument || { title: title });
        setError(data.error || "Duplicate document detected in your vault.");
        setUploading(false);
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || data.suggestion || "Upload failed.");
      }

      const doc = data.data || data.document || data;
      setUploadedDoc(doc);
      setStageText("Secured in DocVault!");
      if (onUploadComplete) {
        onUploadComplete(doc, {
          privacyMode,
          autoFlashcard: privacyMode === "PROCESSABLE" && autoFlashcard,
        });
      }
    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      setError(err.message || "Failed to upload document.");
    } finally {
      setUploading(false);
    }
  };

  if (uploadedDoc) {
    return (
      <div className="dv-cp-intake-card dv-cp-intake-card--done dv-anim-pop">
        <div className="dv-cp-intake-card__done-row">
          <CheckCircle2 size={18} className="dv-cp-intake-card__done-icon" />
          <div>
            <div className="dv-cp-intake-card__done-title">
              Uploaded & Secured: {uploadedDoc.title || title}
            </div>
            <div className="dv-cp-intake-card__done-sub">
              {privacyMode === "STORAGE_ONLY"
                ? "Stored in Cloud Vault (Zero AI Processing)"
                : "Processed & Indexed for Copilot Q&A and Flashcards"}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dv-cp-intake-card dv-anim-slide-up">
      <div className="dv-cp-intake-card__header">
        <div className="dv-cp-intake-card__file-pill">
          <div className="dv-cp-intake-card__file-icon">
            {isPdf ? <FileText size={16} /> : <ImageIcon size={16} />}
          </div>
          <div className="dv-cp-intake-card__file-meta">
            <span className="dv-cp-intake-card__filename" title={file.name}>
              {file.name}
            </span>
            <span className="dv-cp-intake-card__filesize">{sizeLabel}</span>
          </div>
        </div>
        {!uploading && onCancel && (
          <button
            type="button"
            className="dv-cp-action-btn"
            onClick={onCancel}
            title="Cancel upload"
            aria-label="Cancel upload"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="dv-cp-intake-card__field">
        <label className="dv-cp-intake-card__label">Document Title</label>
        <input
          type="text"
          className="dv-cp-intake-card__input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter a clear title (e.g. Electricity Bill Nov 2026)"
          disabled={uploading}
        />
      </div>

      <div className="dv-cp-intake-card__field">
        <label className="dv-cp-intake-card__label">
          How should DocVault store & process this document?
        </label>
        <div className="dv-cp-intake-modes">
          <button
            type="button"
            disabled={uploading}
            onClick={() => setPrivacyMode("PROCESSABLE")}
            className={`dv-cp-intake-mode ${
              privacyMode === "PROCESSABLE" ? "dv-cp-intake-mode--active" : ""
            }`}
          >
            <div className="dv-cp-intake-mode__top">
              <Cpu size={15} />
              <span>Process & AI Index</span>
            </div>
            <p className="dv-cp-intake-mode__desc">
              Extract text, enable Copilot Q&A & auto-fill Flashcards
            </p>
          </button>

          <button
            type="button"
            disabled={uploading}
            onClick={() => setPrivacyMode("STORAGE_ONLY")}
            className={`dv-cp-intake-mode ${
              privacyMode === "STORAGE_ONLY" ? "dv-cp-intake-mode--active" : ""
            }`}
          >
            <div className="dv-cp-intake-mode__top">
              <Cloud size={15} />
              <span>Cloud Vault Only</span>
            </div>
            <p className="dv-cp-intake-mode__desc">
              Encrypted cloud storage only. Zero AI or OCR processing
            </p>
          </button>
        </div>
      </div>

      {privacyMode === "PROCESSABLE" && (
        <label className="dv-cp-intake-toggle">
          <input
            type="checkbox"
            checked={autoFlashcard}
            onChange={(e) => setAutoFlashcard(e.target.checked)}
            disabled={uploading}
          />
          <Sparkles size={14} className="dv-cp-intake-toggle__icon" />
          <span>
            Auto-extract details & open a fillable Flashcard after upload
          </span>
        </label>
      )}

      {uploading && (
        <div className="dv-cp-intake-progress">
          <div className="dv-cp-intake-progress__bar">
            <div className="dv-cp-intake-progress__fill" />
          </div>
          <div className="dv-cp-intake-progress__text">
            <Loader2 size={13} className="dv-cp-spin" />
            <span>{stageText}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="dv-cp-intake-error">
          <AlertTriangle size={14} />
          <div className="dv-cp-intake-error__body">
            <span>{error}</span>
            {duplicateDoc && (
              <button
                type="button"
                className="dv-cp-intake-dup-btn"
                onClick={() => executeUpload(true)}
                disabled={uploading}
              >
                Upload as New Copy Anyway
              </button>
            )}
          </div>
        </div>
      )}

      <div className="dv-cp-intake-card__footer">
        <span className="dv-cp-intake-card__shield">
          <ShieldCheck size={13} /> End-to-End Vault Protected
        </span>
        <div className="dv-cp-intake-card__btns">
          {!uploading && onCancel && (
            <button
              type="button"
              className="dv-cp-btn-ghost"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            className="dv-cp-btn-primary"
            onClick={() => executeUpload(false)}
            disabled={uploading || !title.trim()}
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="dv-cp-spin" /> Securing...
              </>
            ) : (
              <>
                <UploadCloud size={14} /> Upload & Continue
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
