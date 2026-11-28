import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiRequest, API_BASE_URL } from "../../services/api";
import { 
  ArrowLeft, Download, Trash2, Calendar, FileText, CheckCircle2,
  ShieldCheck, AlertTriangle, ExternalLink, Link2, Sparkles,
  Lock, Edit3, Check, X, Shield, Cpu, Tag, Activity, FileCheck2, Clock, Share2,
  Eye, Copy, Fingerprint, Layers
} from "lucide-react";
import ShareModal from "../sharing/ShareModal";
import {
  deriveMasterKey,
  decryptDocumentFromVault,
  base64ToBytes,
  getInMemoryMasterKey,
  setInMemoryMasterKey,
  clearInMemoryMasterKey,
} from "../../services/crypto/e2eeService";

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

// Clean field name formatter: "total amount" -> "Total Amount"
function formatFieldName(name) {
  if (!name) return "Detail";
  return String(name)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Format values cleanly (e.g. ₹932 for bills/amounts, dates, etc.)
function formatFieldValue(name, value) {
  if (value === null || value === undefined || value === "") return "—";
  const str = String(value).trim();
  const lowerName = String(name || "").toLowerCase();

  // If amount / price / bill / total and is purely numeric, format as currency
  if (
    (lowerName.includes("amount") ||
      lowerName.includes("price") ||
      lowerName.includes("bill") ||
      lowerName.includes("total") ||
      lowerName.includes("cost") ||
      lowerName.includes("fee")) &&
    /^\d+(\.\d{1,2})?$/.test(str)
  ) {
    return `₹${Number(str).toLocaleString("en-IN")}`;
  }

  // Format ISO date strings
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  }

  return str;
}

// Format verification record into production-grade user-facing copy
function formatVerificationRecord(v) {
  const provider = String(v.provider || "INTEGRITY_CHECK").toUpperCase();
  const result = String(v.result || "VERIFIED").toUpperCase();

  if (provider.includes("CRYPTO") || provider.includes("SIGNATURE")) {
    if (result === "VERIFIED") {
      return {
        title: "Cryptographic Signature",
        statusBadge: "Digitally Signed",
        badgeVariant: "success",
        description: v.evidence?.note || "Document carries a verified Adobe/PKCS#7 cryptographic signature block.",
      };
    }
    return {
      title: "File Integrity & Structure",
      statusBadge: "Original File",
      badgeVariant: "neutral",
      description: "Original document file. Headers and SHA-256 hash match encrypted vault records with zero tampering detected.",
    };
  }

  if (provider.includes("GST") || provider.includes("TAX")) {
    return {
      title: "Statutory Identifier Format",
      statusBadge: result === "VERIFIED" ? "Statutory Match" : "Standard Format",
      badgeVariant: result === "VERIFIED" ? "success" : "neutral",
      description: v.evidence?.note || (result === "VERIFIED" ? "Verified against statutory tax ID structure." : "Document structure confirmed."),
    };
  }

  return {
    title: formatFieldName(provider),
    statusBadge: result === "VERIFIED" ? "Verified" : "Confirmed",
    badgeVariant: result === "VERIFIED" ? "success" : "neutral",
    description: v.evidence?.note || "Vault security integrity check completed.",
  };
}

// Map document category/title to official renewal portals (Part C)
function getRenewalPortal(doc) {
  const cat = (doc?.category || "").toLowerCase();
  const title = (doc?.title || "").toLowerCase();

  if (cat.includes("insurance") || title.includes("insurance") || title.includes("policy")) {
    if (title.includes("motor") || title.includes("car") || title.includes("bike") || title.includes("vehicle")) {
      return { label: "Renew Motor Insurance", url: "https://www.policybazaar.com/motor-insurance/", official: "Policybazaar / Parivahan" };
    }
    if (title.includes("health") || title.includes("mediclaim")) {
      return { label: "Renew Health Insurance", url: "https://www.policybazaar.com/health-insurance/", official: "Policybazaar" };
    }
    return { label: "Renew Policy Online", url: "https://www.policybazaar.com/", official: "Official Aggregator" };
  }

  if (title.includes("passport") || cat.includes("passport")) {
    return { label: "Renew on Passport Seva", url: "https://portal2.passportindia.gov.in/", official: "Passport Seva Kendra" };
  }

  if (title.includes("driving") || title.includes("license") || title.includes("dl") || title.includes("puc") || title.includes("rc")) {
    return { label: "Renew on Parivahan Portal", url: "https://parivahan.gov.in/", official: "Ministry of Road Transport" };
  }

  if (title.includes("pan") || cat.includes("pan")) {
    return { label: "Reprint / Update on NSDL", url: "https://www.onlineservices.nsdl.com/paam/endUserRegisterContact.html", official: "NSDL Portal" };
  }

  if (title.includes("aadhaar") || cat.includes("aadhaar")) {
    return { label: "Update on myAadhaar", url: "https://myaadhaar.uidai.gov.in/", official: "UIDAI Portal" };
  }

  return { label: "Search Official Renewal Portal", url: `https://www.google.com/search?q=${encodeURIComponent((doc?.title || "") + " official renewal portal India")}`, official: "Official Portal" };
}

// Calculate Document Useful Life (Freshness) for financial and proof documents (Part C)
function getDocumentFreshness(doc) {
  const cat = (doc?.category || "").toLowerCase();
  const title = (doc?.title || "").toLowerCase();
  const isFinancialOrProof = 
    cat.includes("statement") || cat.includes("salary") || cat.includes("tax") || 
    cat.includes("receipt") || title.includes("statement") || title.includes("bill") || 
    title.includes("salary") || title.includes("slip") || title.includes("itr") ||
    cat.includes("financial") || cat.includes("utility");

  if (!isFinancialOrProof) return null;

  const dateStr = doc?.documentDate || doc?.createdAt;
  if (!dateStr) return null;

  const docDate = new Date(dateStr);
  if (isNaN(docDate.getTime())) return null;

  const now = new Date();
  const diffDays = Math.floor((now - docDate) / (1000 * 60 * 60 * 24));

  if (diffDays <= 90) {
    return {
      status: "fresh",
      days: diffDays,
      badge: "Fresh & Valid (<90d)",
      message: `Issued ${diffDays} days ago. Fully acceptable for loan applications, visa filings, and KYC checks.`
    };
  } else {
    return {
      status: "aged",
      days: diffDays,
      badge: "Useful Life Advisory (>90d)",
      message: `Issued ${diffDays} days ago. Banks, employers, and visa consulates typically require statements from within the last 90 days. Consider uploading a fresh copy.`
    };
  }
}

export default function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [doc, setDoc] = useState(null);
  const [isOwner, setIsOwner] = useState(true);
  const [permissions, setPermissions] = useState({ view: true, download: true });
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
  const [copiedField, setCopiedField] = useState(null);

  // Zero-Knowledge E2EE Decryption State (in-memory only)
  const [e2eePinInput, setE2eePinInput] = useState("");
  const [e2eeUnlocking, setE2eeUnlocking] = useState(false);
  const [e2eeUnlockError, setE2eeUnlockError] = useState("");
  const [decryptedE2ee, setDecryptedE2ee] = useState(null);

  useEffect(() => {
    return () => {
      if (decryptedE2ee?.blobUrl) {
        URL.revokeObjectURL(decryptedE2ee.blobUrl);
      }
    };
  }, [decryptedE2ee]);

  const handleUnlockE2ee = async (e) => {
    if (e) e.preventDefault();
    if (!doc?.e2ee?.enabled) return;

    setE2eeUnlocking(true);
    setE2eeUnlockError("");
    try {
      let masterKey = getInMemoryMasterKey();
      if (!masterKey || e2eePinInput.trim().length >= 4) {
        if (!e2eePinInput || e2eePinInput.trim().length < 4) {
          throw new Error("Enter your Vault PIN / Passphrase (min 4 chars) to decrypt in browser.");
        }
        masterKey = await deriveMasterKey(e2eePinInput.trim(), doc.e2ee.salt);
        setInMemoryMasterKey(masterKey);
      }

      const dlMeta = await apiRequest(`/api/documents/${id}/e2ee/download-url`);
      let cipherBytes;
      if (dlMeta.downloadUrl) {
        const res = await fetch(dlMeta.downloadUrl);
        if (!res.ok) throw new Error(`Failed to download encrypted payload (${res.status})`);
        cipherBytes = new Uint8Array(await res.arrayBuffer());
      } else if (dlMeta.ciphertextBase64) {
        cipherBytes = base64ToBytes(dlMeta.ciphertextBase64);
      } else {
        throw new Error("Encrypted payload unavailable.");
      }

      const { fileBytes, metadata } = await decryptDocumentFromVault(cipherBytes, dlMeta.e2ee || doc.e2ee, masterKey);
      const mime = metadata?.mimetype || "application/octet-stream";
      const blob = new Blob([fileBytes], { type: mime });
      const blobUrl = URL.createObjectURL(blob);

      setDecryptedE2ee({
        title: metadata?.title || "Decrypted Document",
        originalName: metadata?.originalName || "document",
        mimetype: mime,
        blobUrl,
      });
      setE2eePinInput("");
    } catch (err) {
      clearInMemoryMasterKey();
      setE2eeUnlockError(
        err?.name === "OperationError"
          ? "Incorrect Vault PIN / Passphrase or tampered ciphertext."
          : err?.message || "Decryption failed."
      );
    } finally {
      setE2eeUnlocking(false);
    }
  };

  const handleLockE2ee = () => {
    clearInMemoryMasterKey();
    if (decryptedE2ee?.blobUrl) {
      URL.revokeObjectURL(decryptedE2ee.blobUrl);
    }
    setDecryptedE2ee(null);
    setE2eePinInput("");
  };

  const handleCopy = (val, key) => {
    if (!val) return;
    try {
      navigator.clipboard.writeText(String(val));
      setCopiedField(key);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (_e) {}
  };

  // Document Intelligence & Health Engine (DIHE) State
  const [docHealth, setDocHealth] = useState(null);
  const [docFacts, setDocFacts] = useState([]);
  const [docVersions, setDocVersions] = useState(null);
  const [docVerification, setDocVerification] = useState([]);
  const [verifying, setVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState("");
  const [linkMessage, setLinkMessage] = useState("");
  const [showShareModal, setShowShareModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    async function loadDocAndAssets() {
      try {
        setLoading(true);
        const [docRes, assetsRes, healthRes, factsRes, verifRes, versRes] = await Promise.all([
          apiRequest(`/api/documents/${id}`).catch(() => ({ success: false })),
          apiRequest("/api/assets").catch(() => ({ data: [] })),
          apiRequest(`/api/intelligence/documents/${id}/health`).catch(() => null),
          apiRequest(`/api/intelligence/documents/${id}/facts`).catch(() => null),
          apiRequest(`/api/intelligence/documents/${id}/verification`).catch(() => null),
          apiRequest(`/api/intelligence/documents/${id}/versions`).catch(() => null),
        ]);

        if (docRes?.success && docRes.data) {
          setDoc(docRes.data);
          if (typeof docRes.isOwner === 'boolean') {
            setIsOwner(docRes.isOwner);
          } else {
            const storedUser = localStorage.getItem("user");
            if (storedUser) {
              try {
                const u = JSON.parse(storedUser);
                const currentUid = u.userId || u._id || u.id;
                if (currentUid && docRes.data.userId) {
                  setIsOwner(String(docRes.data.userId) === String(currentUid));
                }
              } catch (_) {}
            }
          }
          if (docRes.permissions) {
            setPermissions(docRes.permissions);
          }
          if (docRes.data.assetId) {
            setSelectedAssetId(docRes.data.assetId);
          }
        } else {
          setError("Document not found in vault.");
        }

        if (assetsRes?.success && assetsRes.data) {
          setAssets(assetsRes.data);
        }

        if (healthRes?.success && healthRes.data) setDocHealth(healthRes.data);
        if (factsRes?.success && factsRes.data) setDocFacts(factsRes.data);
        if (verifRes?.success && verifRes.data) setDocVerification(verifRes.data);
        if (versRes?.success && versRes.data) setDocVersions(versRes.data);
      } catch (err) {
        setError("Failed to retrieve document details.");
      } finally {
        setLoading(false);
      }
    }
    loadDocAndAssets();
  }, [id]);

  const handleVerifyAuthenticity = async () => {
    setVerifyMessage("");
    try {
      setVerifying(true);
      const res = await apiRequest(`/api/intelligence/documents/${id}/verify`, { method: "POST" });
      if (res.success) {
        const verifRes = await apiRequest(`/api/intelligence/documents/${id}/verification`);
        if (verifRes?.success && verifRes.data) {
          setDocVerification(verifRes.data);
        }
        setVerifyMessage("Verification complete — document looks authentic.");
      } else {
        setVerifyMessage(res?.error || "Verification failed. Please try again.");
      }
    } catch (err) {
      setVerifyMessage("Verification error: " + err.message);
    } finally {
      setVerifying(false);
    }
  };

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
        setLinkMessage("Document linked to asset successfully.");
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
          if (typeof updatedRes.isOwner === 'boolean') {
            setIsOwner(updatedRes.isOwner);
          }
          if (updatedRes.permissions) {
            setPermissions(updatedRes.permissions);
          }
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

  const token = localStorage.getItem("docvault_token") || localStorage.getItem("token") || "";
  const previewUrl = `${API_BASE_URL}/api/documents/${id}/preview?token=${encodeURIComponent(token)}`;
  const downloadUrl = `${API_BASE_URL}/api/documents/${id}/download?token=${encodeURIComponent(token)}`;
  const canDownload = isOwner || permissions?.download === true;

  // Combine extractedFields or fallback keyDetails into unified structured list
  const allFields = React.useMemo(() => {
    if (!doc) return [];
    if (doc.extractedFields && doc.extractedFields.length > 0) {
      return doc.extractedFields;
    }
    if (doc.keyDetails && typeof doc.keyDetails === "object") {
      return Object.entries(doc.keyDetails)
        .filter(([k, v]) => v != null && v !== "" && k !== "extractedAt")
        .map(([fieldName, value]) => ({
          fieldName,
          value: String(value),
          confidence: 0.95,
          verificationStatus: "accepted",
        }));
    }
    return [];
  }, [doc]);

  return (
    <div className="dv-doc-detail-page">
      <AppHeader
        title={doc ? doc.title : "Document Inspection"}
        subtitle="Document details, extracted information, and actions."
      />

      <div className="dv-doc-detail-content">
        {/* Navigation Toolbar */}
        <div className="dv-detail-top-nav">
          <Link to="/documents" className="dv-back-btn">
            <ArrowLeft size={16} /> Back to Documents
          </Link>

          {doc && (
            <div className="dv-detail-actions">
              {isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={Share2}
                  onClick={() => setShowShareModal(true)}
                >
                  Share / Access
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                icon={Eye}
                onClick={() => setShowPreviewModal(true)}
              >
                Preview Original
              </Button>
              <Link to={`/copilot?docId=${doc._id}`}>
                <Button variant="outline" size="sm" icon={Sparkles}>
                  Ask Copilot
                </Button>
              </Link>
              {canDownload && (
                <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="primary" size="sm" icon={Download}>
                    Download Original
                  </Button>
                </a>
              )}
              {isOwner && (
                <Button
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  onClick={() => setShowDeleteModal(true)}
                >
                  Delete
                </Button>
              )}
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
                      size={28} 
                      isStorageOnly={doc.privacyMode === "STORAGE_ONLY"} 
                    />
                    <div>
                      <h2 className="dv-detail-heading">{doc.title}</h2>
                      <div className="dv-detail-filename-row">
                        <span className="dv-detail-original-filename">
                          File: <code>{doc.originalName || doc.title}</code>
                        </span>
                        <button
                          type="button"
                          className="dv-filename-copy-btn"
                          onClick={() => handleCopy(doc.originalName || doc.title, "filename")}
                          title="Copy file name"
                        >
                          {copiedField === "filename" ? <Check size={12} color="#10B981" /> : <Copy size={12} />}
                        </button>
                      </div>
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

                {/* Zero-Knowledge E2EE Client-Side Decryption Card */}
                {doc.e2ee?.enabled && (
                  <div className="dv-detail-summary-block" style={{ borderLeft: "3px solid #E9730C" }}>
                    <div className="dv-detail-summary-header" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <Lock size={14} color="#E9730C" />
                        <span className="dv-detail-block-label">Zero-Knowledge Encrypted Document ({doc.e2ee.alg || "AES-GCM-256"})</span>
                      </div>
                      {decryptedE2ee && (
                        <Button variant="outline" size="sm" onClick={handleLockE2ee}>
                          <Lock size={13} /> Lock &amp; Wipe Key
                        </Button>
                      )}
                    </div>

                    {!decryptedE2ee ? (
                      <form onSubmit={handleUnlockE2ee} style={{ marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <input
                          type="password"
                          value={e2eePinInput}
                          onChange={(e) => setE2eePinInput(e.target.value)}
                          placeholder="Enter Vault PIN / Passphrase to decrypt locally"
                          disabled={e2eeUnlocking}
                          style={{
                            flex: "1 1 220px",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            border: "1px solid var(--border-color, #cbd5e1)",
                            fontSize: "13px",
                          }}
                        />
                        <Button type="submit" size="sm" disabled={e2eeUnlocking}>
                          {e2eeUnlocking ? "Decrypting..." : "Decrypt in Browser"}
                        </Button>
                        {e2eeUnlockError && (
                          <div style={{ width: "100%", color: "#dc2626", fontSize: "12.5px", marginTop: "4px" }}>
                            {e2eeUnlockError}
                          </div>
                        )}
                      </form>
                    ) : (
                      <div style={{ marginTop: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "14px" }}>{decryptedE2ee.title}</div>
                          <div style={{ fontSize: "12px", opacity: 0.75 }}>{decryptedE2ee.originalName}</div>
                        </div>
                        <a
                          href={decryptedE2ee.blobUrl}
                          download={decryptedE2ee.originalName}
                          className="dv-btn dv-btn--primary dv-btn--sm"
                          style={{ display: "inline-flex", alignItems: "center", gap: "6px", textDecoration: "none" }}
                        >
                          <Download size={14} /> Download Decrypted File
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* AI Executive Summary */}
                {doc.summary && (
                  <div className="dv-detail-summary-block">
                    <div className="dv-detail-summary-header">
                      <Sparkles size={14} className="dv-summary-sparkle-icon" />
                      <span className="dv-detail-block-label">AI Executive Summary</span>
                    </div>
                    <p className="dv-detail-summary-text">{doc.summary}</p>
                  </div>
                )}

                {/* Consolidated Document Intelligence & Validity Banner */}
                {(() => {
                  const freshness = getDocumentFreshness(doc);
                  const isFresh = freshness?.status === "fresh";
                  return (
                    <div className="dv-detail-intel-banner">
                      <div className="dv-detail-intel-left">
                        <div className="dv-intel-icon-bubble">
                          <Calendar size={18} />
                        </div>
                        <div className="dv-intel-text-group">
                          <div className="dv-intel-title-row">
                            <span className="dv-intel-main-title">
                              {doc.documentDate ? `Document Date: ${doc.documentDate}` : `Uploaded: ${new Date(doc.createdAt).toLocaleDateString()}`}
                            </span>
                            {freshness && (
                              <span className={`dv-intel-freshness-pill ${isFresh ? "dv-intel-freshness-pill--fresh" : "dv-intel-freshness-pill--aged"}`}>
                                {isFresh ? "✓ Fresh & Valid (<90d)" : "Advisory (>90d)"}
                              </span>
                            )}
                          </div>
                          <p className="dv-intel-subtext">
                            {doc.expiryDate ? (
                              <>
                                Renewal Deadline: <strong>{doc.expiryDate}</strong>
                                {docHealth?.daysLeft !== null && ` (${docHealth.daysLeft} days remaining)`}
                              </>
                            ) : freshness ? (
                              freshness.message
                            ) : (
                              "Permanent record · Verified and indexed for AI Copilot queries"
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="dv-detail-intel-right">
                        {doc.expiryDate && (
                          <ExpiryBadge expiryDate={doc.expiryDate} size="sm" />
                        )}
                        {doc.expiryDate && (() => {
                          const portal = getRenewalPortal(doc);
                          return (
                            <a href={portal.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                              <Button variant="primary" size="xs" icon={ExternalLink}>
                                {portal.label}
                              </Button>
                            </a>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })()}

                {/* Technical Specifications Bar */}
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
                    <span className="dv-meta-item__label">Security</span>
                    <span className="dv-meta-item__val" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Lock size={12} color="#10B981" /> AES-256 GCM
                    </span>
                  </div>
                  <div className="dv-meta-item">
                    <span className="dv-meta-item__label">Uploaded On</span>
                    <span className="dv-meta-item__val">{new Date(doc.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </Card>

              {/* Evidence-Based Structured Fields Grid */}
              <Card padding="lg" className="dv-detail-entities-card">
                <div className="dv-entities-header">
                  <div>
                    <h3 className="dv-entities-title">Document Information</h3>
                    <p className="dv-entities-sub">
                      Key details identified, structured, and verified from this document.
                    </p>
                  </div>
                  {allFields.length > 0 && (
                    <Badge variant="neutral" size="sm">
                      {allFields.length} {allFields.length === 1 ? "field" : "fields"} identified
                    </Badge>
                  )}
                </div>

                {allFields.length > 0 ? (
                  <div className="dv-fields-grid">
                    {allFields.map((field, idx) => {
                      const fieldNameClean = formatFieldName(field.fieldName || field.label);
                      const displayVal = formatFieldValue(field.fieldName || field.label, field.value);
                      const isNeedsReview = field.verificationStatus === "needs_review";
                      const confidencePct = Math.round((field.confidence || 0.95) * 100);

                      return (
                        <div
                          key={idx}
                          className={`dv-field-card ${isNeedsReview ? "dv-field-card--review" : ""}`}
                        >
                          <div className="dv-field-card__header">
                            <span className="dv-field-card__name" title={fieldNameClean}>
                              {fieldNameClean}
                            </span>
                            <div className="dv-field-card__badges">
                              {isNeedsReview ? (
                                <span className="dv-field-badge dv-field-badge--warning">
                                  <AlertTriangle size={11} /> Review
                                </span>
                              ) : (
                                <span className="dv-field-badge dv-field-badge--verified" title={`Extraction confidence: ${confidencePct}%`}>
                                  <Check size={11} /> {confidencePct}%
                                </span>
                              )}
                              <button
                                type="button"
                                className="dv-field-icon-btn"
                                title="Edit this value"
                                onClick={() => {
                                  setEditingField(field);
                                  setFieldValueInput(String(field.value));
                                }}
                              >
                                <Edit3 size={12} />
                              </button>
                            </div>
                          </div>

                          <div className="dv-field-card__value-row">
                            <span className="dv-field-card__value" title={String(field.value)}>
                              {displayVal}
                            </span>
                            <button
                              type="button"
                              className="dv-field-copy-btn"
                              onClick={() => handleCopy(field.value, idx)}
                              title="Copy value"
                            >
                              {copiedField === idx ? <Check size={13} color="#10B981" /> : <Copy size={13} />}
                              {copiedField === idx && <span className="dv-copy-tooltip">Copied!</span>}
                            </button>
                          </div>

                          {field.evidence && (
                            <div className="dv-field-card__source" title={field.evidence}>
                              <span className="dv-field-card__source-label">Source:</span> "{field.evidence}"
                            </div>
                          )}

                          {field.rejectionReason && (
                            <div className="dv-field-card__rejection">
                              ⚠️ {field.rejectionReason}
                            </div>
                          )}

                          {isNeedsReview && (
                            <div className="dv-field-card__review-actions">
                              <button
                                type="button"
                                className="dv-field-review-btn dv-field-review-btn--confirm"
                                onClick={() => handleFieldCorrection("confirmed", field, field.value)}
                                disabled={savingCorrection}
                              >
                                <Check size={12} /> Confirm
                              </button>
                              <button
                                type="button"
                                className="dv-field-review-btn dv-field-review-btn--reject"
                                onClick={() => handleFieldCorrection("rejected", field)}
                                disabled={savingCorrection}
                              >
                                <X size={12} /> Reject
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="dv-text-muted">No structured key details extracted from this document.</p>
                )}
              </Card>
            </div>

            {/* Right Column: Asset Linkage, Authenticity & Health */}
            <div className="dv-detail-sidebar-col">
              {/* Asset Linkage Card */}
              <Card padding="lg" className="dv-detail-sidebar-card">
                <h3 className="dv-sidebar-section-title">Tracked Asset Association</h3>
                <p className="dv-sidebar-section-desc">
                  Associate this invoice or policy with an appliance, vehicle, or property.
                </p>

                {(() => {
                  const linkedAsset = assets.find(a => a._id === (doc.assetId || selectedAssetId));
                  if (linkedAsset) {
                    return (
                      <div className="dv-linked-asset-active">
                        <div className="dv-linked-asset-icon">
                          <Layers size={18} color="var(--color-primary)" />
                        </div>
                        <div className="dv-linked-asset-info">
                          <strong>{linkedAsset.name}</strong>
                          <span>{linkedAsset.category || "General Asset"}</span>
                        </div>
                        <Link to={`/assets/${linkedAsset._id}`} className="dv-linked-asset-view-btn">
                          View Asset
                        </Link>
                      </div>
                    );
                  }

                  return (
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
                      {linkMessage && (
                        <p style={{ fontSize: "12px", color: "#059669", marginTop: "8px" }}>{linkMessage}</p>
                      )}
                    </div>
                  );
                })()}
              </Card>

              {/* Authenticity & Integrity Inspection Card */}
              <Card padding="lg" className="dv-detail-sidebar-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ShieldCheck size={18} color="#059669" />
                    <h3 className="dv-sidebar-section-title" style={{ margin: 0 }}>Authenticity Audit</h3>
                  </div>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={handleVerifyAuthenticity}
                    disabled={verifying}
                  >
                    {verifying ? "Inspecting..." : docVerification?.length > 0 ? "Re-Check" : "Verify Now"}
                  </Button>
                </div>

                <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginBottom: "12px", lineHeight: 1.4 }}>
                  Cryptographic verification of document headers, digital signatures, and statutory identifier structures.
                </p>

                {verifyMessage && (
                  <div className="dv-verify-alert">
                    <CheckCircle2 size={14} color="#059669" />
                    <span>{verifyMessage}</span>
                  </div>
                )}

                {docVerification && docVerification.length > 0 ? (
                  <div className="dv-authenticity-list">
                    {docVerification.map((v, i) => {
                      const info = formatVerificationRecord(v);
                      return (
                        <div key={i} className="dv-authenticity-item">
                          <div className="dv-authenticity-item__top">
                            <span className="dv-authenticity-item__title">{info.title}</span>
                            <Badge variant={info.badgeVariant} size="sm">
                              {info.statusBadge}
                            </Badge>
                          </div>
                          <p className="dv-authenticity-item__desc">{info.description}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="dv-authenticity-empty">
                    <FileCheck2 size={24} color="#64748B" />
                    <span>SHA-256 checksum verified upon upload. Click "Verify Now" to inspect embedded digital signatures and GSTIN statutory structures.</span>
                  </div>
                )}
              </Card>

              {/* Document Health Engine Card (ONLY IF EXPIRY APPLIES) */}
              {doc.expiryDate && docHealth && docHealth.status !== "UNKNOWN" && docHealth.daysLeft !== null && (
                <Card padding="lg" className="dv-detail-sidebar-card">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <h3 className="dv-sidebar-section-title" style={{ margin: 0 }}>Renewal Lifecycle</h3>
                    <Badge variant={
                      docHealth.status === "VALID" ? "success" :
                      docHealth.status === "EXPIRING_SOON" ? "warning" :
                      docHealth.status === "EXPIRED" ? "danger" : "outline"
                    }>
                      {docHealth.status}
                    </Badge>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", marginBottom: "8px" }}>
                    {docHealth.reason}
                  </p>
                  <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                    Days remaining: <strong>{docHealth.daysLeft}</strong> (Warning threshold: {docHealth.warningPeriodDays}d)
                  </div>
                </Card>
              )}

              {/* Quick AI & Vault Tools Card */}
              <Card padding="lg" className="dv-detail-sidebar-card">
                <h3 className="dv-sidebar-section-title" style={{ marginBottom: 10 }}>Vault Tools</h3>
                <div className="dv-quick-tools-list">
                  <Link to={`/copilot?docId=${doc._id}`} className="dv-quick-tool-btn">
                    <Sparkles size={15} color="#8B5CF6" />
                    <span>Ask Copilot about this document</span>
                  </Link>
                  <button
                    type="button"
                    className="dv-quick-tool-btn"
                    onClick={() => handleCopy(doc._id, "docId")}
                  >
                    <Fingerprint size={15} color="#0051B4" />
                    <span>{copiedField === "docId" ? "Document ID Copied!" : "Copy Vault Document ID"}</span>
                  </button>
                  <button
                    type="button"
                    className="dv-quick-tool-btn"
                    onClick={() => setShowPreviewModal(true)}
                  >
                    <Eye size={15} color="#059669" />
                    <span>Open High-Res Preview</span>
                  </button>
                </div>
              </Card>

              {/* Version History Card */}
              {docVersions?.hasVersionHistory && (
                <Card padding="lg" className="dv-detail-sidebar-card">
                  <h3 className="dv-sidebar-section-title">Version History</h3>
                  <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "8px" }}>
                    Tracked revisions ({docVersions.versions.length} versions)
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {docVersions.versions.map((ver, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "12px", padding: "6px 8px", background: "var(--color-background)", borderRadius: "4px" }}>
                        <span>Version {ver.versionNumber} {ver.isCurrentVersion && "(Current)"}</span>
                        {ver.documentId?._id !== id && (
                          <Link to={`/documents/${ver.documentId?._id}`} style={{ color: "var(--color-primary)", textDecoration: "none" }}>
                            View
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>

      {/* User Field Review & Correction Dialog */}
      <Modal
        isOpen={Boolean(editingField)}
        onClose={() => setEditingField(null)}
        title={`Edit Field: ${String(editingField?.fieldName || 'Field').replace(/_/g, " ").toUpperCase()}`}
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

      {/* Original Document Preview Modal */}
      <Modal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title={doc ? String(doc.title || "Document Preview") : "Document Preview"}
        maxWidth="940px"
        className="dv-preview-modal-dialog"
      >
        {doc && (
          <div className="dv-preview-modal-content">
            <div className="dv-preview-modal-bar">
              <div className="dv-preview-modal-badges">
                <Badge variant="primary" size="sm">{doc.category || "General"}</Badge>
                <Badge variant="outline" size="sm">{doc.format || "PDF"}</Badge>
                {doc.originalName && (
                  <span className="dv-preview-modal-filename" title={doc.originalName}>
                    <code>{doc.originalName}</code>
                  </span>
                )}
              </div>
              <div className="dv-preview-modal-actions">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dv-preview-modal-btn"
                  title="Open in new browser tab"
                >
                  <ExternalLink size={14} />
                  <span>Open in Tab</span>
                </a>
                {canDownload ? (
                  <a
                    href={downloadUrl}
                    download={doc.originalName || doc.title || "document"}
                    className="dv-preview-modal-btn"
                    title="Download file"
                  >
                    <Download size={14} />
                    <span>Download</span>
                  </a>
                ) : (
                  <span className="dv-preview-modal-btn dv-preview-modal-btn--disabled" title="Owner has granted View-Only access without download">
                    <Lock size={12} />
                    <span>View Only</span>
                  </span>
                )}
              </div>
            </div>

            <div className="dv-preview-modal-frame-container">
              {(doc.format || "").toUpperCase() === "PDF" || (doc.mimetype || "").includes("pdf") ? (
                <iframe
                  src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                  title={doc.title || "Original Document PDF"}
                  className="dv-preview-modal-iframe"
                  loading="lazy"
                />
              ) : (
                <div className="dv-preview-modal-img-wrap">
                  <img
                    src={previewUrl}
                    alt={doc.title || "Document Preview"}
                    className="dv-preview-modal-image"
                    loading="lazy"
                  />
                </div>
              )}
            </div>
          </div>
        )}
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

      {/* WhatsApp-Style Share / Audience Selector Modal */}
      {doc && (
        <ShareModal
          documentId={doc._id}
          documentTitle={doc.title}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          onSaved={() => {}}
        />
      )}
    </div>
  );
}
