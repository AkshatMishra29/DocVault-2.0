import React, { useState, useEffect } from "react";
import { apiRequest, API_BASE_URL } from "../../services/api";
import {
  Upload, FileText, CheckCircle2, AlertTriangle, Search,
  Calendar, DollarSign, Download, Trash2, ArrowUpRight, ArrowDownLeft
} from "lucide-react";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import Input from "../../components/common/Input/Input";
import Skeleton from "../../components/common/Skeleton/Skeleton";

import "./BankStatementsPage.css";

export default function BankStatementsPage() {
  const [activeTab, setActiveTab] = useState("history"); // history | upload
  const [transactions, setTransactions] = useState([]);
  const [stats, setStats] = useState({ totalDebit: 0, totalCredit: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("ALL");

  // Upload & Preview state
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetchTransactions();
  }, [filterType, searchQuery]);

  async function fetchTransactions() {
    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (filterType !== "ALL") params.append("type", filterType);
      if (searchQuery) params.append("q", searchQuery);

      const res = await apiRequest(`/api/bank-statements/transactions?${params.toString()}`);
      if (res.success) {
        setTransactions(res.data || []);
        setStats({ totalDebit: res.totalDebit || 0, totalCredit: res.totalCredit || 0 });
      }
    } catch (err) {
      setError("Failed to fetch bank transactions.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewData(null);
    setError("");

    // Automatically trigger privacy-first local preview
    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/bank-statements/preview`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: formData
      }).then(r => r.json());

      if (res.success) {
        setPreviewData(res);
      } else {
        setError(res.error || "Failed to parse bank statement CSV.");
      }
    } catch (err) {
      setError("Error parsing CSV statement: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirmImport() {
    if (!previewData || !previewData.preview) return;
    setConfirming(true);
    try {
      const res = await apiRequest("/api/bank-statements/confirm", {
        method: "POST",
        body: JSON.stringify({
          importBatchId: previewData.importBatchId,
          transactions: previewData.preview
        })
      });

      if (res.success) {
        alert(res.message);
        setPreviewData(null);
        setSelectedFile(null);
        setActiveTab("history");
        fetchTransactions();
      }
    } catch (err) {
      alert("Error confirming import: " + err.message);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="dv-bank-page">
      <AppHeader
        title="Privacy-First Bank Statement Parser"
        subtitle="Extract, preview, and review bank debits and credits locally. Never sent to external AI."
      />

      <div className="dv-bank-content">
        <div className="dv-bank-tabs">
          <button
            className={`dv-bank-tab ${activeTab === "history" ? "dv-bank-tab--active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            Transaction History ({transactions.length})
          </button>
          <button
            className={`dv-bank-tab ${activeTab === "upload" ? "dv-bank-tab--active" : ""}`}
            onClick={() => setActiveTab("upload")}
          >
            <Upload size={15} /> Import CSV Statement
          </button>
        </div>

        {error && (
          <div className="dv-bank-alert" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: TRANSACTION HISTORY */}
        {activeTab === "history" && (
          <div>
            <div className="dv-bank-stats-row">
              <Card padding="md" className="dv-bank-stat-card">
                <span className="dv-stat-lbl">Total Expenses (Debits)</span>
                <span className="dv-stat-num" style={{ color: "#dc2626" }}>
                  ₹{stats.totalDebit.toLocaleString()}
                </span>
              </Card>

              <Card padding="md" className="dv-bank-stat-card">
                <span className="dv-stat-lbl">Total Credits</span>
                <span className="dv-stat-num" style={{ color: "#16a34a" }}>
                  ₹{stats.totalCredit.toLocaleString()}
                </span>
              </Card>
            </div>

            <div className="dv-bank-filter-bar">
              <Input
                type="text"
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1 }}
              />

              <div className="dv-bank-pill-group">
                {["ALL", "DEBIT", "CREDIT"].map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`dv-bank-pill ${filterType === type ? "active" : ""}`}
                    onClick={() => setFilterType(type)}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <Skeleton height="200px" />
            ) : transactions.length === 0 ? (
              <Card padding="lg" style={{ textAlign: "center", color: "#5b738b" }}>
                <p>No imported transactions found.</p>
                <Button variant="primary" size="sm" onClick={() => setActiveTab("upload")}>
                  Import First Statement
                </Button>
              </Card>
            ) : (
              <div className="dv-bank-table-wrap">
                <table className="dv-bank-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Narration / Particulars</th>
                      <th>Category</th>
                      <th>Type</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t._id}>
                        <td style={{ whiteSpace: "nowrap" }}>{t.transactionDate}</td>
                        <td><strong>{t.description}</strong></td>
                        <td><Badge variant="neutral" size="sm">{t.category}</Badge></td>
                        <td>
                          {t.type === "DEBIT" ? (
                            <span style={{ color: "#dc2626", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "2px" }}>
                              <ArrowUpRight size={14} /> Debit
                            </span>
                          ) : (
                            <span style={{ color: "#16a34a", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "2px" }}>
                              <ArrowDownLeft size={14} /> Credit
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 700 }}>
                          ₹{t.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: IMPORT & PREVIEW */}
        {activeTab === "upload" && (
          <div>
            <Card padding="lg" className="dv-upload-card">
              <div className="dv-privacy-callout">
                <CheckCircle2 size={18} color="#0070f2" />
                <span>
                  <strong>Privacy First:</strong> Bank statement CSV parsing runs completely within your private DocVault server environment. Transaction narrations are never submitted to Groq, Hugging Face, or third-party AI models.
                </span>
              </div>

              <div className="dv-dropzone">
                <input
                  type="file"
                  accept=".csv"
                  id="csvInput"
                  style={{ display: "none" }}
                  onChange={handleFileSelect}
                />
                <label htmlFor="csvInput" className="dv-dropzone-label">
                  <Upload size={36} color="#0070f2" style={{ marginBottom: "10px" }} />
                  <span style={{ fontWeight: 600, fontSize: "1rem" }}>
                    {selectedFile ? selectedFile.name : "Click to select Bank Statement CSV"}
                  </span>
                  <span style={{ fontSize: "0.85rem", color: "#5b738b", marginTop: "4px" }}>
                    Supports HDFC, ICICI, SBI, Axis, and standard bank transaction exports (.csv)
                  </span>
                </label>
              </div>

              {uploading && <p style={{ textAlign: "center", marginTop: "1rem" }}>Parsing CSV rows...</p>}
            </Card>

            {/* PREVIEW & CONFIRMATION TABLE */}
            {previewData && (
              <Card padding="lg" style={{ marginTop: "1.5rem" }}>
                <div className="dv-preview-header">
                  <div>
                    <h3 style={{ margin: "0 0 4px 0" }}>Preview Extracted Transactions</h3>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#5b738b" }}>
                      Found <strong>{previewData.totalCount}</strong> transactions ({previewData.duplicateCount} duplicate flags). Review below before confirming import.
                    </p>
                  </div>

                  <Button variant="primary" size="md" loading={confirming} onClick={handleConfirmImport}>
                    Confirm & Save to Vault
                  </Button>
                </div>

                <div className="dv-bank-table-wrap" style={{ marginTop: "1rem", maxHeight: "400px", overflowY: "auto" }}>
                  <table className="dv-bank-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Type</th>
                        <th style={{ textAlign: "right" }}>Amount</th>
                        <th>Duplicate?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.preview.map((t, idx) => (
                        <tr key={idx} style={{ background: t.isDuplicate ? "#fffbeb" : "inherit" }}>
                          <td>{t.transactionDate}</td>
                          <td>{t.description}</td>
                          <td>
                            <Badge variant={t.type === "DEBIT" ? "danger" : "success"} size="sm">
                              {t.type}
                            </Badge>
                          </td>
                          <td style={{ textAlign: "right", fontWeight: 700 }}>₹{t.amount.toLocaleString()}</td>
                          <td>
                            {t.isDuplicate ? (
                              <Badge variant="warning" size="sm">Already in Vault</Badge>
                            ) : (
                              <Badge variant="neutral" size="sm">New</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

