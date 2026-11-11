import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { apiRequest } from "../../services/api";
import {
  ShieldCheck, Lock, Download, Eye, Sparkles, Send, FileText,
  AlertCircle, ArrowLeft, Key, MessageSquare
} from "lucide-react";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Input from "../../components/common/Input/Input";
import Badge from "../../components/common/Badge/Badge";
import Skeleton from "../../components/common/Skeleton/Skeleton";

import "./ShareCenterPage.css";

export default function SharedDocumentViewerPage() {
  const { id } = useParams(); // shareId
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [share, setShare] = useState(null);
  const [selectedDocId, setSelectedDocId] = useState(searchParams.get("doc") || "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Auth Challenges State
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [enteredPassword, setEnteredPassword] = useState("");
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState("");

  // Q&A State
  const [qaInput, setQaInput] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const [qaHistory, setQaHistory] = useState([]);

  useEffect(() => {
    fetchShareDetails();
  }, [id]);

  useEffect(() => {
    if (share && share.documents && share.documents.length > 0 && !selectedDocId) {
      setSelectedDocId(share.documents[0]._id);
    }
  }, [share]);

  useEffect(() => {
    if (id && selectedDocId) {
      fetchQaHistory();
    }
  }, [id, selectedDocId]);

  async function fetchShareDetails() {
    try {
      setLoading(true);
      setError("");
      const res = await apiRequest(`/api/shares/${id}`);
      if (res.success && res.data) {
        setShare(res.data);
        if (res.data.passwordRequired) {
          setRequiresPassword(true);
        }
        if (res.data.otpRequired) {
          setRequiresOtp(true);
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
      const res = await apiRequest(`/api/shares/${id}/questions?documentId=${selectedDocId}`);
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
    try {
      const res = await apiRequest(`/api/shares/${id}/verify-password`, {
        method: "POST",
        body: JSON.stringify({ password: enteredPassword }),
      });
      if (res.success) {
        setRequiresPassword(false);
      }
    } catch (err) {
      alert("Incorrect password: " + err.message);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "var(--space-5)" }}>
        <Skeleton height="300px" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "var(--space-5)", maxWidth: "500px", margin: "40px auto", textAlign: "center" }}>
        <AlertCircle size={40} color="var(--color-danger)" style={{ marginBottom: 12 }} />
        <h3>Access Restricted</h3>
        <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>{error}</p>
        <Link to="/shares"><Button variant="secondary">Back to Share Center</Button></Link>
      </div>
    );
  }

  // Password Gate
  if (requiresPassword) {
    return (
      <div style={{ maxWidth: "400px", margin: "60px auto" }}>
        <Card padding="lg">
          <div style={{ textAlign: "center", marginBottom: "16px" }}>
            <Key size={32} color="#0070F2" />
            <h3 style={{ margin: "8px 0" }}>Password Protected Share</h3>
            <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
              The owner has protected this document package with a password.
            </p>
          </div>
          <form onSubmit={handlePasswordSubmit}>
            <Input
              type="password"
              placeholder="Enter share password"
              value={enteredPassword}
              onChange={(e) => setEnteredPassword(e.target.value)}
              required
            />
            <Button variant="primary" type="submit" style={{ width: "100%", marginTop: "12px" }}>
              Unlock Documents
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  const documentUrl = `/api/shares/${id}/document?documentId=${selectedDocId}${token ? `&token=${token}` : ""}${enteredPassword ? `&password=${encodeURIComponent(enteredPassword)}` : ""}`;
  const downloadUrl = `/api/shares/${id}/download?documentId=${selectedDocId}${token ? `&token=${token}` : ""}${enteredPassword ? `&password=${encodeURIComponent(enteredPassword)}` : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "var(--space-3)", padding: "var(--space-3)" }}>
      {/* Top Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--color-border)", paddingBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link to="/shares" style={{ color: "var(--color-text-secondary)" }}><ArrowLeft size={18} /></Link>
          <div>
            <h3 style={{ margin: 0, fontSize: "var(--text-base)" }}>{share?.purpose}</h3>
            <span style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
              Owner: {share?.owner?.name} ({share?.owner?.docVaultId})
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {share?.permissions?.download && (
            <a href={downloadUrl} download>
              <Button variant="secondary" size="sm" icon={Download}>
                Download Watermarked Copy
              </Button>
            </a>
          )}
          <Badge variant="success" size="sm"><ShieldCheck size={12} /> Controlled View</Badge>
        </div>
      </div>

      {/* Main Split Layout: Document Viewer & Q&A Assistant */}
      <div className="dv-shared-viewer-layout">
        {/* Left: Controlled Viewer */}
        <div className="dv-document-render-panel">
          {selectedDocId ? (
            <img
              src={documentUrl}
              alt="Shared Document Controlled Rendering"
              onError={(e) => {
                // If PDF preview rendering fallback
                e.target.style.display = "none";
              }}
            />
          ) : (
            <div style={{ color: "#ffffff", fontSize: "var(--text-sm)" }}>Select a document to inspect</div>
          )}
        </div>

        {/* Right: Restricted Q&A Panel */}
        <div className="dv-qa-panel">
          <div style={{ display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid var(--color-border)", paddingBottom: 8 }}>
            <Sparkles size={16} color="#0070F2" />
            <strong style={{ fontSize: "var(--text-sm)" }}>Ask About This Document</strong>
          </div>

          <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", margin: 0 }}>
            Grounding engine answers strictly using content visible in this shared file. Unshared documents and redacted values are protected.
          </p>

          <form onSubmit={handleAskQuestion} style={{ display: "flex", gap: 6 }}>
            <Input
              placeholder="e.g. What is the expiry date or total amount?"
              value={qaInput}
              onChange={(e) => setQaInput(e.target.value)}
              style={{ flex: 1 }}
            />
            <Button variant="primary" size="sm" type="submit" loading={qaLoading} icon={Send} />
          </form>

          {/* Q&A Stream */}
          <div className="dv-qa-history">
            {qaHistory.length === 0 ? (
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", fontStyle: "italic", textAlign: "center", padding: "20px 0" }}>
                No questions asked yet. Ask about policy dates, invoice amounts, or terms.
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

