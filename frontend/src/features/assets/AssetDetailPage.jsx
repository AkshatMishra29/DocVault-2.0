import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiRequest } from "../../services/api";
import {
  ArrowLeft, Car, Tv, Laptop, Home, Box, FileText, Calendar,
  DollarSign, ShieldAlert, CheckCircle2, AlertTriangle, Plus,
  Trash2, ExternalLink, Link2, Clock, Activity, FileCheck
} from "lucide-react";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import Modal from "../../components/common/Modal/Modal";
import Input from "../../components/common/Input/Input";
import ExpiryBadge from "../../components/common/ExpiryBadge/ExpiryBadge";
import Skeleton from "../../components/common/Skeleton/Skeleton";

import "./AssetDetailPage.css";

function getAssetIcon(category) {
  const c = (category || "").toLowerCase();
  if (c.includes("vehicle") || c.includes("car")) return Car;
  if (c.includes("appliance")) return Tv;
  if (c.includes("electronic") || c.includes("laptop")) return Laptop;
  if (c.includes("real estate") || c.includes("property")) return Home;
  return Box;
}

export default function AssetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("overview"); // overview | wallet | expenses | health | timeline
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modal states
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [unlinkedDocs, setUnlinkedDocs] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [linking, setLinking] = useState(false);

  // Expense form
  const [expenseForm, setExpenseForm] = useState({
    vendor: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    category: "Maintenance",
    notes: ""
  });
  const [submittingExpense, setSubmittingExpense] = useState(false);

  // Vehicle wallet state (if vehicle)
  const [vehicleWallet, setVehicleWallet] = useState(null);
  const [policyHealth, setPolicyHealth] = useState(null);

  useEffect(() => {
    loadAssetDetails();
  }, [id]);

  async function loadAssetDetails() {
    try {
      setLoading(true);
      setError("");
      const res = await apiRequest(`/api/assets/${id}`);
      if (res.success && res.data) {
        setData(res.data);
        if (res.data.asset?.category === "Vehicle") {
          loadVehicleWallet();
        }
        loadPolicyHealth();
      } else {
        setError("Asset not found or access denied.");
      }
    } catch (err) {
      setError("Failed to load asset details: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadVehicleWallet() {
    try {
      const res = await apiRequest(`/api/assets/${id}/vehicle-wallet`);
      if (res.success) setVehicleWallet(res.data);
    } catch (e) {
      console.warn("Wallet load failed:", e);
    }
  }

  async function loadPolicyHealth() {
    try {
      const res = await apiRequest(`/api/assets/${id}/policy-health`);
      if (res.success) setPolicyHealth(res.data);
    } catch (e) {
      console.warn("Policy health load failed:", e);
    }
  }

  async function openLinkDocModal() {
    try {
      const res = await apiRequest("/api/documents");
      if (res.success && res.data) {
        const linkedIds = new Set((data?.asset?.linkedDocumentIds || []).map(d => (typeof d === "object" ? d._id : d)));
        const available = res.data.filter(d => !linkedIds.has(d._id));
        setUnlinkedDocs(available);
        if (available.length > 0) setSelectedDocId(available[0]._id);
        setShowLinkModal(true);
      }
    } catch (e) {
      alert("Failed to load user documents: " + e.message);
    }
  }

  async function handleLinkDocument() {
    if (!selectedDocId) return;
    setLinking(true);
    try {
      const res = await apiRequest(`/api/assets/${id}/documents`, {
        method: "POST",
        body: JSON.stringify({ documentId: selectedDocId })
      });
      if (res.success) {
        setShowLinkModal(false);
        loadAssetDetails();
      }
    } catch (err) {
      alert("Error linking document: " + err.message);
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlinkDoc(documentId) {
    if (!window.confirm("Unlink this document from the asset?")) return;
    try {
      const res = await apiRequest(`/api/assets/${id}/documents/${documentId}`, {
        method: "DELETE"
      });
      if (res.success) loadAssetDetails();
    } catch (err) {
      alert("Error unlinking document: " + err.message);
    }
  }

  async function handleAddExpense(e) {
    e.preventDefault();
    if (!expenseForm.vendor || !expenseForm.amount) return;
    setSubmittingExpense(true);
    try {
      const res = await apiRequest("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          ...expenseForm,
          assetId: id
        })
      });
      if (res.success) {
        setShowExpenseModal(false);
        setExpenseForm({
          vendor: "",
          amount: "",
          date: new Date().toISOString().split("T")[0],
          category: "Maintenance",
          notes: ""
        });
        loadAssetDetails();
      }
    } catch (err) {
      alert("Error adding expense: " + err.message);
    } finally {
      setSubmittingExpense(false);
    }
  }

  if (loading) {
    return (
      <div className="dv-asset-detail-page">
        <Skeleton height="60px" style={{ marginBottom: "20px" }} />
        <Skeleton height="200px" style={{ marginBottom: "20px" }} />
        <Skeleton height="300px" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="dv-asset-detail-page">
        <Card padding="lg" className="dv-error-card">
          <AlertTriangle size={32} color="#DC2626" />
          <p>{error || "Asset not found."}</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/assets")}>
            Back to Registry
          </Button>
        </Card>
      </div>
    );
  }

  const { asset, deadlines, expenses, timeline, totalExpense } = data;
  const AssetIcon = getAssetIcon(asset.category);
  const isVehicle = asset.category === "Vehicle";

  return (
    <div className="dv-asset-detail-page">
      <div className="dv-asset-detail-nav">
        <Link to="/assets" className="dv-back-btn">
          <ArrowLeft size={16} /> Back to Registry
        </Link>

        <div className="dv-asset-top-actions">
          <Button variant="outline" size="sm" icon={Plus} onClick={openLinkDocModal}>
            Link Document
          </Button>
          <Button variant="primary" size="sm" icon={DollarSign} onClick={() => setShowExpenseModal(true)}>
            Log Expense
          </Button>
        </div>
      </div>

      {/* Asset Hero Header Card */}
      <Card padding="lg" className="dv-asset-hero-card">
        <div className="dv-asset-hero-top">
          <div className="dv-asset-hero-icon-box">
            <AssetIcon size={28} />
          </div>
          <div>
            <div className="dv-asset-hero-title-row">
              <h1 className="dv-asset-hero-title">{asset.name}</h1>
              <Badge variant="primary" size="md">{asset.category}</Badge>
              <Badge variant={asset.status === "Active" ? "success" : "neutral"} size="sm">
                {asset.status}
              </Badge>
            </div>
            {asset.description && <p className="dv-asset-hero-desc">{asset.description}</p>}
          </div>
        </div>

        <div className="dv-asset-stats-grid">
          <div className="dv-asset-stat-item">
            <span className="dv-stat-label">Estimated Value</span>
            <span className="dv-stat-val">{asset.estimatedValue || "—"}</span>
          </div>
          <div className="dv-asset-stat-item">
            <span className="dv-stat-label">Purchase Price</span>
            <span className="dv-stat-val">₹{asset.purchasePrice ? asset.purchasePrice.toLocaleString() : "—"}</span>
          </div>
          <div className="dv-asset-stat-item">
            <span className="dv-stat-label">Purchased On</span>
            <span className="dv-stat-val">{asset.purchaseDate || "—"}</span>
          </div>
          <div className="dv-asset-stat-item">
            <span className="dv-stat-label">Lifecycle Expenses</span>
            <span className="dv-stat-val" style={{ color: "#0070f2" }}>₹{totalExpense.toLocaleString()}</span>
          </div>
        </div>
      </Card>

      {/* Lifecycle Navigation Tabs */}
      <div className="dv-asset-tabs">
        <button
          className={`dv-asset-tab ${activeTab === "overview" ? "dv-asset-tab--active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <FileText size={16} /> Linked Documents ({asset.linkedDocumentIds?.length || 0})
        </button>

        {isVehicle && (
          <button
            className={`dv-asset-tab ${activeTab === "wallet" ? "dv-asset-tab--active" : ""}`}
            onClick={() => setActiveTab("wallet")}
          >
            <Car size={16} /> Vehicle Wallet
          </button>
        )}

        <button
          className={`dv-asset-tab ${activeTab === "expenses" ? "dv-asset-tab--active" : ""}`}
          onClick={() => setActiveTab("expenses")}
        >
          <DollarSign size={16} /> Expenses & Maintenance (₹{totalExpense.toLocaleString()})
        </button>

        <button
          className={`dv-asset-tab ${activeTab === "health" ? "dv-asset-tab--active" : ""}`}
          onClick={() => setActiveTab("health")}
        >
          <Activity size={16} /> Policy & Warranty Health
        </button>

        <button
          className={`dv-asset-tab ${activeTab === "timeline" ? "dv-asset-tab--active" : ""}`}
          onClick={() => setActiveTab("timeline")}
        >
          <Clock size={16} /> Yearly Timeline ({timeline?.length || 0})
        </button>
      </div>

      {/* TAB 1: OVERVIEW & LINKED DOCUMENTS */}
      {activeTab === "overview" && (
        <div className="dv-tab-content">
          <div className="dv-tab-header">
            <h3>Connected Vault Documents</h3>
            <Button variant="outline" size="sm" icon={Plus} onClick={openLinkDocModal}>
              Link Another Document
            </Button>
          </div>

          {!asset.linkedDocumentIds || asset.linkedDocumentIds.length === 0 ? (
            <Card padding="lg" className="dv-empty-tab-card">
              <FileText size={36} style={{ opacity: 0.3, marginBottom: "8px" }} />
              <p>No documents linked to this asset yet.</p>
              <Button variant="primary" size="sm" onClick={openLinkDocModal}>
                Attach Invoice, RC, or Warranty Card
              </Button>
            </Card>
          ) : (
            <div className="dv-linked-docs-grid">
              {asset.linkedDocumentIds.map((doc) => (
                <Card key={doc._id} padding="md" hover className="dv-linked-doc-card">
                  <div className="dv-doc-card-top">
                    <div>
                      <h4 className="dv-doc-card-title">{doc.title}</h4>
                      <span className="dv-doc-card-meta">{doc.category} • {doc.format || "PDF"}</span>
                    </div>
                    <button
                      className="dv-doc-unlink-btn"
                      onClick={() => handleUnlinkDoc(doc._id)}
                      title="Unlink Document"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {doc.expiryDate && (
                    <div style={{ marginTop: "10px" }}>
                      <ExpiryBadge expiryDate={doc.expiryDate} size="sm" />
                    </div>
                  )}
                  <Link to={`/documents/${doc._id}`} className="dv-doc-view-link">
                    View in Vault <ExternalLink size={12} />
                  </Link>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: VEHICLE WALLET (If Vehicle) */}
      {activeTab === "wallet" && isVehicle && vehicleWallet && (
        <div className="dv-tab-content">
          <div className="dv-wallet-banner">
            <h3>Vehicle Digital Compliance Wallet</h3>
            <p>Centralized view of RC, Comprehensive Insurance, PUC, and service schedules.</p>
          </div>

          {vehicleWallet.missingWarnings?.length > 0 && (
            <div className="dv-wallet-warnings">
              {vehicleWallet.missingWarnings.map((w, i) => (
                <div key={i} className="dv-wallet-warning-item">
                  <AlertTriangle size={16} />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <div className="dv-wallet-cards-grid">
            <Card padding="md" className="dv-wallet-card">
              <span className="dv-wallet-card-title">Registration Certificate (RC)</span>
              {vehicleWallet.documents?.rc ? (
                <div>
                  <div className="dv-wallet-card-file">
                    <CheckCircle2 size={16} color="#16a34a" /> {vehicleWallet.documents.rc.title}
                  </div>
                  <Link to={`/documents/${vehicleWallet.documents.rc._id}`} className="dv-wallet-link">
                    Inspect RC
                  </Link>
                </div>
              ) : (
                <span className="dv-wallet-missing">Not Attached</span>
              )}
            </Card>

            <Card padding="md" className="dv-wallet-card">
              <span className="dv-wallet-card-title">Insurance Policy</span>
              {vehicleWallet.documents?.insurance ? (
                <div>
                  <div className="dv-wallet-card-file">
                    <CheckCircle2 size={16} color="#16a34a" /> {vehicleWallet.documents.insurance.title}
                  </div>
                  <Link to={`/documents/${vehicleWallet.documents.insurance._id}`} className="dv-wallet-link">
                    Inspect Insurance
                  </Link>
                </div>
              ) : (
                <span className="dv-wallet-missing">Not Attached</span>
              )}
            </Card>

            <Card padding="md" className="dv-wallet-card">
              <span className="dv-wallet-card-title">PUC Certificate</span>
              {vehicleWallet.documents?.puc ? (
                <div>
                  <div className="dv-wallet-card-file">
                    <CheckCircle2 size={16} color="#16a34a" /> {vehicleWallet.documents.puc.title}
                  </div>
                  <Link to={`/documents/${vehicleWallet.documents.puc._id}`} className="dv-wallet-link">
                    Inspect PUC
                  </Link>
                </div>
              ) : (
                <span className="dv-wallet-missing">Not Attached</span>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* TAB 3: EXPENSES & MAINTENANCE */}
      {activeTab === "expenses" && (
        <div className="dv-tab-content">
          <div className="dv-tab-header">
            <h3>Asset Maintenance & Expense Log (Total: ₹{totalExpense.toLocaleString()})</h3>
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setShowExpenseModal(true)}>
              Add Expense
            </Button>
          </div>

          {expenses.length === 0 ? (
            <Card padding="lg" className="dv-empty-tab-card">
              <p>No expenses logged for this asset yet.</p>
              <Button variant="outline" size="sm" onClick={() => setShowExpenseModal(true)}>
                Log Fuel, Service, or Repair
              </Button>
            </Card>
          ) : (
            <div className="dv-expenses-table-wrap">
              <table className="dv-expenses-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Vendor / Workshop</th>
                    <th>Category</th>
                    <th>Notes</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e._id}>
                      <td>{e.date}</td>
                      <td><strong>{e.vendor}</strong></td>
                      <td><Badge variant="primary" size="sm">{e.category}</Badge></td>
                      <td style={{ color: "#5b738b" }}>{e.notes || "—"}</td>
                      <td style={{ textAlign: "right", fontWeight: 700 }}>₹{e.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: POLICY & WARRANTY HEALTH AUDIT */}
      {activeTab === "health" && policyHealth && (
        <div className="dv-tab-content">
          <Card padding="lg" className="dv-health-audit-card">
            <div className="dv-health-header">
              <h3>Rule-Based Insurance Policy Audit</h3>
              <Badge
                variant={policyHealth.overallStatus === "HEALTHY" ? "success" : policyHealth.overallStatus === "EXPIRED" ? "danger" : "warning"}
                size="md"
              >
                {policyHealth.overallStatus}
              </Badge>
            </div>

            <div className="dv-audit-checks-list">
              {policyHealth.auditChecks?.map((c, i) => (
                <div key={i} className="dv-audit-check-item">
                  <div className="dv-audit-check-left">
                    {c.status === "PASSED" ? (
                      <CheckCircle2 size={18} color="#16a34a" />
                    ) : c.status === "CRITICAL" ? (
                      <AlertTriangle size={18} color="#dc2626" />
                    ) : (
                      <AlertTriangle size={18} color="#d97706" />
                    )}
                    <div>
                      <strong>{c.check}</strong>
                      <p>{c.message}</p>
                    </div>
                  </div>
                  {c.action && <Badge variant="outline" size="sm">{c.action}</Badge>}
                </div>
              ))}
            </div>

            <p className="dv-health-disclaimer">{policyHealth.disclaimer}</p>
          </Card>
        </div>
      )}

      {/* TAB 5: YEARLY TIMELINE */}
      {activeTab === "timeline" && (
        <div className="dv-tab-content">
          <div className="dv-tab-header">
            <h3>Chronological Asset Lifecycle Events</h3>
          </div>

          {timeline.length === 0 ? (
            <Card padding="lg" className="dv-empty-tab-card">
              <p>No lifecycle events recorded yet.</p>
            </Card>
          ) : (
            <div className="dv-timeline-stream">
              {timeline.map((ev) => (
                <div key={ev._id} className="dv-timeline-node">
                  <div className="dv-timeline-dot" />
                  <div className="dv-timeline-box">
                    <div className="dv-timeline-date">{ev.eventDate}</div>
                    <h4 className="dv-timeline-title">{ev.title}</h4>
                    {ev.description && <p className="dv-timeline-desc">{ev.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: LINK DOCUMENT */}
      <Modal isOpen={showLinkModal} onClose={() => setShowLinkModal(false)} title="Link Document to Asset">
        <div style={{ padding: "10px 0" }}>
          <p style={{ fontSize: "0.9rem", color: "#5b738b", marginBottom: "12px" }}>
            Select an existing document from your vault to associate with <strong>{asset.name}</strong>.
          </p>

          {unlinkedDocs.length === 0 ? (
            <p>All your vault documents are already linked to this asset.</p>
          ) : (
            <select
              className="dv-select-full"
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
            >
              {unlinkedDocs.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.title} ({d.category})
                </option>
              ))}
            </select>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
            <Button variant="ghost" onClick={() => setShowLinkModal(false)}>Cancel</Button>
            <Button variant="primary" loading={linking} onClick={handleLinkDocument} disabled={unlinkedDocs.length === 0}>
              Confirm Link
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL 2: LOG EXPENSE */}
      <Modal isOpen={showExpenseModal} onClose={() => setShowExpenseModal(false)} title={`Log Expense for ${asset.name}`}>
        <form onSubmit={handleAddExpense} style={{ display: "flex", flexDirection: "column", gap: "12px", paddingTop: "10px" }}>
          <div>
            <label className="dv-form-label">Vendor / Workshop / Service Center *</label>
            <Input
              type="text"
              required
              placeholder="e.g. Authorized Service Center, Fuel Station"
              value={expenseForm.vendor}
              onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label className="dv-form-label">Amount (₹) *</label>
              <Input
                type="number"
                required
                placeholder="Amount in INR"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="dv-form-label">Date *</label>
              <Input
                type="date"
                required
                value={expenseForm.date}
                onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="dv-form-label">Expense Category</label>
            <select
              className="dv-select-full"
              value={expenseForm.category}
              onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
            >
              <option value="Maintenance">Maintenance & Servicing</option>
              <option value="Fuel">Fuel / Energy</option>
              <option value="Insurance">Insurance Premium</option>
              <option value="Service/Repair">Repair</option>
              <option value="Tax/Fee">Registration / Tax / Toll</option>
              <option value="Accessories">Accessories / Parts</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="dv-form-label">Notes (Optional)</label>
            <Input
              type="text"
              placeholder="e.g. 20,000 km general service, engine oil change"
              value={expenseForm.notes}
              onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "16px" }}>
            <Button variant="ghost" type="button" onClick={() => setShowExpenseModal(false)}>Cancel</Button>
            <Button variant="primary" type="submit" loading={submittingExpense}>Save Expense</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

