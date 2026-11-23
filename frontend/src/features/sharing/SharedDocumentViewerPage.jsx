import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { apiRequest, API_BASE_URL } from "../../services/api";
import {
  ShieldCheck, Lock, Download, Eye, Sparkles, Send, FileText,
  AlertCircle, ArrowLeft, Key, ExternalLink, Calendar, HardDrive, CheckCircle2, Copy, Check,
  ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2, RefreshCw, Loader2
} from "lucide-react";

import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Input from "../../components/common/Input/Input";
import Badge from "../../components/common/Badge/Badge";
import Skeleton from "../../components/common/Skeleton/Skeleton";
import DocumentTypeIcon from "../../components/common/DocumentTypeIcon/DocumentTypeIcon";

import "./ShareCenterPage.css";

export default function SharedDocumentViewerPage() {
  const { id, token: routeToken } = useParams(); // shareId or access token
  const [searchParams] = useSearchParams();
  const queryToken = searchParams.get("token") || "";
  const shareIdentifier = routeToken || id || queryToken;

  const [share, setShare] = useState(null);
  const [selectedDocId, setSelectedDocId] = useState(searchParams.get("doc") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copiedLink, setCopiedLink] = useState(false);

  // Viewer Controls State
  const [zoomLevel, setZoomLevel] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [docLoading, setDocLoading] = useState(true);
  const [docError, setDocError] = useState(false);

  // Auth Challenges State
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [enteredPassword, setEnteredPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Q&A State
  const [qaInput, setQaInput] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const [qaHistory, setQaHistory] = useState([]);

  useEffect(() => {
    fetchShareDetails();
  }, [shareIdentifier]);

  useEffect(() => {
    if (share && share.documents && share.documents.length > 0 && !selectedDocId) {
      setSelectedDocId(share.documents[0]._id);
    }
  }, [share]);

  useEffect(() => {
    if (selectedDocId) {
      setDocLoading(true);
      setDocError(false);
      setZoomLevel(100);
      setRotation(0);
    }
  }, [selectedDocId]);

  useEffect(() => {
    if (shareIdentifier && selectedDocId) {
      fetchQaHistory();
    }
  }, [shareIdentifier, selectedDocId]);

  async function fetchShareDetails() {
    try {
      setLoading(true);
      setError("");
      const effectiveToken = routeToken || queryToken || (id && id.length > 24 ? id : "");
      const tokenParam = effectiveToken ? `?token=${encodeURIComponent(effectiveToken)}` : "";
      const res = await apiRequest(`/api/shares/${shareIdentifier}${tokenParam}`);
      if (res.success && res.data) {
        setShare(res.data);
        if (res.data.passwordRequired) {
          setRequiresPassword(true);
        }
      } else {
        setError(res.error || "Unable to load share details.");
      }
    } catch (err) {
      setError(err.message || "Failed to access shared document.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchQaHistory() {
    try {
      const effectiveId = share?._id || shareIdentifier;
      const res = await apiRequest(`/api/shares/${effectiveId}/questions?documentId=${selectedDocId}`);
      if (res.success && res.data) {
        setQaHistory(res.data);
      }
    } catch (e) {}
  }

  const handleAskQuestion = async (e) => {
    e.preventDefault();
    if (!qaInput.trim() || !selectedDocId) return;

    setQaLoading(true);
    try {
      const res = await apiRequest(`/api/shares/${id}/questions`, {
        method: "POST",
        body: JSON.stringify({
          documentId: selectedDocId,
          question: qaInput.trim(),
        }),
      });

      if (res.success && res.data) {
        setQaHistory((prev) => [res.data, ...prev]);
        setQaInput("");
      }
    } catch (err) {
      alert("Q&A Error: " + err.message);
    } finally {
      setQaLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError("");
    try {
      const res = await apiRequest(`/api/shares/${id}/verify-password`, {
        method: "POST",
        body: JSON.stringify({ password: enteredPassword }),
      });
      if (res.success) {
        setRequiresPassword(false);
      } else {
        setPasswordError(res.error || "Incorrect share password.");
      }
    } catch (err) {
      setPasswordError(err.message || "Incorrect share password.");
    }
  };

  const copyShareLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleZoomIn = () => setZoomLevel((z) => Math.min(z + 25, 250));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(z - 25, 50));
  const handleResetZoom = () => {
    setZoomLevel(100);
    setRotation(0);
  };
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const toggleFullscreen = () => setIsFullscreen((f) => !f);

  if (loading) {
    return (
      <div style={{ padding: "var(--space-5)", maxWidth: "800px", margin: "40px auto" }}>
        <Skeleton height="350px" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "var(--space-5)", maxWidth: "520px", margin: "60px auto", textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(239, 68, 68, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px auto" }}>
          <AlertCircle size={36} color="var(--color-danger, #ef4444)" />
        </div>
        <h3 style={{ margin: "0 0 8px 0" }}>Access Unavailable</h3>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)", marginBottom: "20px" }}>{error}</p>
        <Link to="/shares">
          <Button variant="secondary" icon={ArrowLeft}>Back to Share Center</Button>
        </Link>
      </div>
    );
  }

  // Password Gate
  if (requiresPassword) {
    return (
      <div style={{ maxWidth: "420px", margin: "80px auto", padding: "0 16px" }}>
        <Card padding="lg">
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(0, 112, 242, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px auto" }}>
              <Key size={28} color="#0070F2" />
            </div>
            <h3 style={{ margin: "0 0 6px 0", fontSize: "1.1rem" }}>Password Protected Share</h3>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", margin: 0 }}>
              The owner has protected this document package with a password. Enter password to inspect.
            </p>
          </div>
          {passwordError && (
            <div style={{ background: "rgba(239, 68, 68, 0.1)", color: "#b91c1c", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", marginBottom: "12px" }}>
              {passwordError}
            </div>
          )}
          <form onSubmit={handlePasswordSubmit}>
            <Input
              type="password"
              placeholder="Enter share password"
              value={enteredPassword}
              onChange={(e) => setEnteredPassword(e.target.value)}
              required
              autoFocus
            />
            <Button variant="primary" type="submit" style={{ width: "100%", marginTop: "12px" }}>
              Unlock Document
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  const activeDoc = (share?.documents || []).find((d) => d._id === selectedDocId) || share?.documents?.[0];
  const isPdf = (activeDoc?.format || "").toUpperCase() === "PDF" || (activeDoc?.title || "").toLowerCase().endsWith(".pdf");

  const authToken = queryToken || routeToken || (id && id.length > 24 ? id : "") || localStorage.getItem("token") || localStorage.getItem("docvault_token") || "";
  const authQuery = `${authToken ? `&token=${encodeURIComponent(authToken)}` : ""}${enteredPassword ? `&password=${encodeURIComponent(enteredPassword)}` : ""}`;
  const effectiveShareId = share?._id || shareIdentifier;
  const baseDocumentUrl = selectedDocId ? `${API_BASE_URL}/api/shares/${effectiveShareId}/document?documentId=${selectedDocId}${authQuery}` : "";
  // Append PDF viewer hash for instant fit-to-width and page controls in browser PDF engine
  const pdfViewerUrl = isPdf && baseDocumentUrl ? `${baseDocumentUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH` : baseDocumentUrl;
  const downloadUrl = selectedDocId ? `${API_BASE_URL}/api/shares/${effectiveShareId}/download?documentId=${selectedDocId}${authQuery}` : "";
  const canDownload = Boolean(share?.permissions?.download);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: isFullscreen ? "100vh" : "100%",
      position: isFullscreen ? "fixed" : "relative",
      top: isFullscreen ? 0 : "auto",
      left: isFullscreen ? 0 : "auto",
      right: isFullscreen ? 0 : "auto",
      bottom: isFullscreen ? 0 : "auto",
      zIndex: isFullscreen ? 9999 : 1,
      background: "var(--color-background, #0f172a)",
      gap: "var(--space-3)",
      padding: isFullscreen ? "12px" : "var(--space-3)",
      boxSizing: "border-box"
    }}>
      {/* Top Header Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--color-border)", paddingBottom: "10px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link to="/shares" style={{ color: "var(--color-text-secondary)", display: "flex", alignItems: "center" }} title="Back to Shares">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: "var(--text-base)", fontWeight: 700 }}>
                {activeDoc?.title || share?.purpose || "Shared Document"}
              </h3>
              <Badge variant={canDownload ? "primary" : "outline"} size="sm">
                {canDownload ? "View & Download" : "View Only"}
              </Badge>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "11px", color: "var(--color-text-secondary)", marginTop: 2 }}>
              <span>Owner: <strong>{share?.owner?.name || "DocVault User"}</strong></span>
              {share?.owner?.docVaultId && (
                <span className="dv-id-pill" style={{ fontSize: "10px", padding: "1px 5px" }}>{share.owner.docVaultId}</span>
              )}
              {share?.expiresAt && (
                <span>• Expires: {new Date(share.expiresAt).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="dv-card-btn"
            onClick={copyShareLink}
            title="Copy share link"
          >
            {copiedLink ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
            <span>{copiedLink ? "Copied" : "Copy Link"}</span>
          </button>

          <a
            href={baseDocumentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="dv-card-btn"
            title="Open original in new browser tab"
          >
            <ExternalLink size={13} />
            <span>Open in Tab</span>
          </a>

          {canDownload && (
            <a href={downloadUrl} download={activeDoc?.title || "document"}>
              <Button variant="primary" size="sm" icon={Download}>
                Download Copy
              </Button>
            </a>
          )}
        </div>
      </div>

      {/* Multi-document package selector (if package has >1 doc) */}
      {share?.documents && share.documents.length > 1 && (
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
          {share.documents.map((d) => (
            <button
              key={d._id}
              type="button"
              onClick={() => setSelectedDocId(d._id)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: "var(--radius-md)",
                border: selectedDocId === d._id ? "1px solid var(--color-primary)" : "1px solid var(--color-border)",
                background: selectedDocId === d._id ? "rgba(1, 90, 71, 0.08)" : "var(--color-surface)",
                color: selectedDocId === d._id ? "var(--color-primary)" : "var(--color-text-primary)",
                fontWeight: selectedDocId === d._id ? 700 : 500,
                fontSize: "12px",
                cursor: "pointer",
              }}
            >
              <FileText size={14} />
              <span>{d.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Split Layout: Document Viewer & Q&A Assistant */}
      <div className="dv-shared-viewer-layout" style={{ flex: 1, minHeight: 0 }}>
        {/* Left: Controlled Viewer with Floating Toolbar */}
        <div className="dv-document-render-panel" style={{ position: "relative", display: "flex", flexDirection: "column" }}>
          {/* Top Viewer Toolbar */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: "8px 14px",
            background: "rgba(15, 23, 42, 0.85)",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            boxSizing: "border-box",
            zIndex: 10
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#f8fafc", fontSize: "12px" }}>
              <DocumentTypeIcon category={activeDoc?.category} format={activeDoc?.format} size={16} />
              <strong style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {activeDoc?.title || "Document"}
              </strong>
              <span style={{ fontSize: "11px", color: "#94a3b8" }}>({activeDoc?.format || "PDF"})</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <button
                type="button"
                className="dv-viewer-tool-btn"
                onClick={handleZoomOut}
                title="Zoom Out"
                disabled={zoomLevel <= 50}
              >
                <ZoomOut size={14} />
              </button>
              <button
                type="button"
                className="dv-viewer-tool-btn"
                onClick={handleResetZoom}
                title="Reset Zoom & Rotation"
                style={{ fontSize: "11px", minWidth: "44px" }}
              >
                {zoomLevel}%
              </button>
              <button
                type="button"
                className="dv-viewer-tool-btn"
                onClick={handleZoomIn}
                title="Zoom In"
                disabled={zoomLevel >= 250}
              >
                <ZoomIn size={14} />
              </button>
              <button
                type="button"
                className="dv-viewer-tool-btn"
                onClick={handleRotate}
                title="Rotate 90 degrees"
              >
                <RotateCw size={14} />
              </button>
              <button
                type="button"
                className="dv-viewer-tool-btn"
                onClick={toggleFullscreen}
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Preview"}
              >
                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
          </div>

          {/* Document Content Box */}
          <div style={{
            position: "relative",
            flex: 1,
            width: "100%",
            height: "100%",
            minHeight: 0,
            overflow: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0b1120"
          }}>
            {/* Loading Indicator */}
            {docLoading && (
              <div style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(11, 17, 32, 0.75)",
                zIndex: 5,
                color: "#e2e8f0",
                gap: 12
              }}>
                <Loader2 size={36} className="dv-spin" color="#38bdf8" />
                <span style={{ fontSize: "13px", fontWeight: 600 }}>Streaming high-performance preview...</span>
              </div>
            )}

            {/* Error Fallback */}
            {docError && (
              <div style={{
                padding: "32px",
                textAlign: "center",
                color: "#f8fafc",
                maxWidth: "380px"
              }}>
                <AlertCircle size={44} color="#ef4444" style={{ marginBottom: 12 }} />
                <h4 style={{ margin: "0 0 6px 0" }}>Preview Load Issue</h4>
                <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 16px 0" }}>
                  The browser embedded viewer encountered an issue rendering this file stream.
                </p>
                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                  <a href={baseDocumentUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="primary" size="sm" icon={ExternalLink}>Open in Native Tab</Button>
                  </a>
                  <button
                    type="button"
                    className="dv-card-btn"
                    onClick={() => {
                      setDocError(false);
                      setDocLoading(true);
                    }}
                  >
                    <RefreshCw size={13} /> Retry
                  </button>
                </div>
              </div>
            )}

            {/* Main Document Stream */}
            {selectedDocId && baseDocumentUrl && !docError ? (
              isPdf ? (
                <div style={{
                  width: "100%",
                  height: "100%",
                  transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                  transformOrigin: "center center",
                  transition: "transform 0.15s ease"
                }}>
                  <object
                    data={pdfViewerUrl}
                    type="application/pdf"
                    className="dv-preview-object"
                    style={{ width: "100%", height: "100%", border: "none" }}
                    aria-label={activeDoc?.title || "Shared Document PDF"}
                    onLoad={() => setDocLoading(false)}
                    onError={() => {
                      setDocLoading(false);
                      setDocError(true);
                    }}
                  >
                    <iframe
                      src={pdfViewerUrl}
                      title={activeDoc?.title || "Shared Document Frame"}
                      style={{ width: "100%", height: "100%", border: "none" }}
                      onLoad={() => setDocLoading(false)}
                      onError={() => {
                        setDocLoading(false);
                        setDocError(true);
                      }}
                    >
                      <div style={{ color: "#ffffff", padding: "40px", textAlign: "center" }}>
                        <FileText size={48} color="#94a3b8" style={{ marginBottom: 12 }} />
                        <p style={{ margin: "0 0 16px 0", fontSize: "14px" }}>Embedded PDF preview not directly supported by browser.</p>
                        <a href={baseDocumentUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="primary" size="sm" icon={ExternalLink}>Open PDF in New Tab</Button>
                        </a>
                      </div>
                    </iframe>
                  </object>
                </div>
              ) : (
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "100%",
                  height: "100%",
                  padding: 16,
                  overflow: "auto"
                }}>
                  <img
                    src={baseDocumentUrl}
                    alt={activeDoc?.title || "Shared Document Controlled Rendering"}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      borderRadius: "8px",
                      transform: `scale(${zoomLevel / 100}) rotate(${rotation}deg)`,
                      transformOrigin: "center center",
                      transition: "transform 0.15s ease"
                    }}
                    onLoad={() => setDocLoading(false)}
                    onError={() => {
                      setDocLoading(false);
                      setDocError(true);
                    }}
                  />
                </div>
              )
            ) : !selectedDocId ? (
              <div style={{ color: "#94a3b8", fontSize: "var(--text-sm)" }}>Select a document to inspect</div>
            ) : null}
          </div>
        </div>

        {/* Right: Restricted Q&A Panel */}
        <div className="dv-qa-panel">
          <div style={{ display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--color-border)", paddingBottom: 8 }}>
            <Sparkles size={16} color="#0070F2" />
            <strong style={{ fontSize: "var(--text-sm)" }}>DocVault AI Document Reader</strong>
          </div>

          <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: 0 }}>
            Grounding engine answers complex queries strictly using content present in this verified shared file.
          </p>

          <form onSubmit={handleAskQuestion} style={{ display: "flex", gap: 6 }}>
            <Input
              placeholder="e.g. List certificates, policy end dates, or totals"
              value={qaInput}
              onChange={(e) => setQaInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button variant="primary" size="sm" type="submit" loading={qaLoading} icon={Send} />
          </form>

          {/* Q&A Stream */}
          <div className="dv-qa-history">
            {qaHistory.length === 0 ? (
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", fontStyle: "italic", textAlign: "center", padding: "24px 8px" }}>
                No questions asked yet. Ask any questions about policy dates, certifications, coverage, or invoice totals.
              </div>
            ) : (
              qaHistory.map((item) => (
                <div key={item._id} className="dv-qa-item">
                  <span className="dv-qa-question">Q: {item.question}</span>
                  <span className="dv-qa-answer">{item.answer}</span>
                  {item.evidence && <span className="dv-qa-evidence">{item.evidence}</span>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
