import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../services/api";
import { 
  FileText, Search, Plus, Filter, ArrowUpDown, Calendar,
  LayoutGrid, List, ChevronRight, Download, Star, ShieldCheck,
  AlertCircle, X, Users, Share2, CheckSquare, CheckCircle2, ArrowRight
} from "lucide-react";
import { sharingService } from "../../services/sharing.service";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import Input from "../../components/common/Input/Input";
import Modal from "../../components/common/Modal/Modal";
import EmptyState from "../../components/common/EmptyState/EmptyState";
import Skeleton from "../../components/common/Skeleton/Skeleton";
import DocumentTypeIcon from "../../components/common/DocumentTypeIcon/DocumentTypeIcon";
import ExpiryBadge from "../../components/common/ExpiryBadge/ExpiryBadge";
import VerificationStatus from "../../components/common/VerificationStatus/VerificationStatus";

import "./DocumentsPage.css";

const CATEGORIES = ["All", "Tax Invoice", "Purchase Receipt", "Insurance", "Identity", "Appliances", "Medical", "Other"];

// Pre-built Life Event Checklist Templates (Part C)
const CHECKLIST_TEMPLATES = [
  {
    id: "home_loan",
    title: "Home Loan Application Pack",
    icon: "🏠",
    desc: "Complete document pack required by major lenders (SBI, HDFC, ICICI).",
    items: [
      { name: "PAN Card", keywords: ["pan", "identity"], category: "Identity", required: true },
      { name: "Aadhaar Card", keywords: ["aadhaar", "uidai"], category: "Identity", required: true },
      { name: "Salary Slips (Last 3 Months)", keywords: ["salary", "payslip", "pay slip"], category: "Financial", required: true },
      { name: "Bank Statements (Last 6 Months)", keywords: ["bank", "statement"], category: "Financial", required: true },
      { name: "Form 16 / ITR Filing", keywords: ["form 16", "itr", "tax"], category: "Financial", required: true },
      { name: "Property Deed / Allotment Letter", keywords: ["property", "deed", "sale", "allotment"], category: "Other", required: false }
    ]
  },
  {
    id: "passport_renewal",
    title: "Passport Application / Renewal",
    icon: "🛂",
    desc: "Standard checklist for Passport Seva Kendra submission.",
    items: [
      { name: "Existing Passport Copy", keywords: ["passport"], category: "Identity", required: true },
      { name: "Aadhaar Card (Address Proof)", keywords: ["aadhaar", "uidai"], category: "Identity", required: true },
      { name: "Proof of Date of Birth (Birth Cert / 10th)", keywords: ["birth", "marksheet", "matriculation"], category: "Identity", required: true },
      { name: "Recent Utility Bill (Electricity/Water)", keywords: ["electricity", "utility", "bill"], category: "Other", required: false }
    ]
  },
  {
    id: "vehicle_purchase",
    title: "Vehicle Registration & Motoring Pack",
    icon: "🚗",
    desc: "Essential documents for vehicle ownership, insurance claims, and RTO.",
    items: [
      { name: "Driving License", keywords: ["driving", "license", "dl"], category: "Identity", required: true },
      { name: "Aadhaar Card", keywords: ["aadhaar", "uidai"], category: "Identity", required: true },
      { name: "PAN Card", keywords: ["pan"], category: "Identity", required: true },
      { name: "Motor Insurance Policy", keywords: ["insurance", "policy", "motor"], category: "Insurance", required: true },
      { name: "Pollution Certificate (PUC)", keywords: ["puc", "pollution"], category: "Other", required: false }
    ]
  },
  {
    id: "visa_travel",
    title: "International Travel / Visa Pack",
    icon: "✈️",
    desc: "Standard requirements for tourist and business visa applications.",
    items: [
      { name: "Valid Passport (>6 months validity)", keywords: ["passport"], category: "Identity", required: true },
      { name: "Travel Insurance Policy", keywords: ["travel", "insurance"], category: "Insurance", required: true },
      { name: "Bank Account Statement", keywords: ["bank", "statement"], category: "Financial", required: true },
      { name: "Income Tax Returns (ITR / Form 16)", keywords: ["itr", "form 16", "tax"], category: "Financial", required: true }
    ]
  }
];

function matchChecklistItem(item, docs) {
  return docs.find(doc => {
    const title = (doc.title || "").toLowerCase();
    const cat = (doc.category || "").toLowerCase();
    const orig = (doc.originalName || "").toLowerCase();
    return item.keywords.some(k => title.includes(k) || cat.includes(k) || orig.includes(k));
  });
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [sharedDocs, setSharedDocs] = useState([]);
  const [activeTab, setActiveTab] = useState("my_vault"); // 'my_vault' | 'shared_with_me'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'table'
  const [sortBy, setSortBy] = useState("newest");   // 'newest' | 'oldest' | 'title' | 'expiry'
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [selectedChecklistId, setSelectedChecklistId] = useState("home_loan");
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const selectedCategory = searchParams.get("category") || "All";
  const searchQuery = searchParams.get("q") || "";

  useEffect(() => {
    if (activeTab === "my_vault") {
      fetchDocuments(true);
    } else {
      fetchSharedDocuments(true);
    }

    // Live Sync: Background sync every 4 seconds without flicker
    const interval = setInterval(() => {
      if (activeTab === "my_vault") {
        fetchDocuments(false);
      } else {
        fetchSharedDocuments(false);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [selectedCategory, searchQuery, activeTab]);

  async function fetchSharedDocuments(showLoading = true) {
    try {
      if (showLoading) setLoading(true);
      setError("");
      const res = await sharingService.getReceivedDocuments();
      if (res.success && res.data) {
        setSharedDocs(res.data);
      } else {
        setSharedDocs([]);
      }
    } catch (err) {
      if (showLoading) setError("Failed to fetch shared documents.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  async function fetchDocuments(showLoading = true) {
    try {
      if (showLoading) setLoading(true);
      setError("");

      const params = new URLSearchParams();
      if (selectedCategory && selectedCategory !== "All") params.append("category", selectedCategory);
      if (searchQuery) params.append("q", searchQuery);

      const endpoint = `/api/documents${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await apiRequest(endpoint);

      if (res.success && res.data) {
        setDocuments(res.data);
      } else {
        setDocuments([]);
      }
    } catch (err) {
      if (showLoading) setError("Failed to fetch documents. Please refresh the page.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  const handleCategorySelect = (cat) => {
    const next = new URLSearchParams(searchParams);
    if (cat === "All") next.delete("category");
    else next.set("category", cat);
    setSearchParams(next);
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    const next = new URLSearchParams(searchParams);
    if (val) next.set("q", val);
    else next.delete("q");
    setSearchParams(next);
  };

  const handleClearFilters = () => {
    setSearchParams({});
  };

  // Client-side sort on retrieved dataset
  const sortedDocuments = [...documents].sort((a, b) => {
    if (sortBy === "title") {
      return (a.title || "").localeCompare(b.title || "");
    }
    if (sortBy === "oldest") {
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    }
    if (sortBy === "expiry") {
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return new Date(a.expiryDate) - new Date(b.expiryDate);
    }
    // Default newest
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  return (
    <div className="dv-docs-page">
      <AppHeader
        title="My Documents"
        subtitle="Manage, search, and inspect your structured personal policies, certificates, and proofs."
      />

      <div className="dv-docs-content">
        {/* Vault vs Shared with Me Switcher */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <button
            type="button"
            className={`dv-cat-pill ${activeTab === 'my_vault' ? 'active' : ''}`}
            onClick={() => setActiveTab('my_vault')}
          >
            My Vault ({documents.length})
          </button>
          <button
            type="button"
            className={`dv-cat-pill ${activeTab === 'shared_with_me' ? 'active' : ''}`}
            onClick={() => setActiveTab('shared_with_me')}
          >
            <Users size={14} style={{ display: 'inline', marginRight: '6px' }} />
            Shared With Me ({sharedDocs.length})
          </button>
        </div>

        {/* Controls Toolbar */}
        <div className="dv-docs-toolbar">
          <div className="dv-docs-search-wrap">
            <Input
              type="text"
              icon={Search}
              placeholder="Search by title, policy number, or tag..."
              value={searchQuery}
              onChange={handleSearchChange}
            />
            {searchQuery && (
              <button 
                type="button" 
                className="dv-search-clear-btn" 
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete("q");
                  setSearchParams(next);
                }}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="dv-docs-actions">
            {/* Sort Selector */}
            <div className="dv-sort-wrapper">
              <ArrowUpDown size={15} className="dv-sort-icon" />
              <select
                className="dv-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                aria-label="Sort documents"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="title">Title (A-Z)</option>
                <option value="expiry">Renewal Date</option>
              </select>
            </div>

            {/* View Mode Toggle */}
            <div className="dv-view-toggle">
              <button
                type="button"
                className={`dv-view-btn ${viewMode === "grid" ? "dv-view-btn--active" : ""}`}
                onClick={() => setViewMode("grid")}
                title="Grid View"
                aria-label="Grid View"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                className={`dv-view-btn ${viewMode === "table" ? "dv-view-btn--active" : ""}`}
                onClick={() => setViewMode("table")}
                title="Table View"
                aria-label="Table View"
              >
                <List size={16} />
              </button>
            </div>

            {/* Life Event Checklist Trigger (Part C) */}
            <Button
              variant="outline"
              size="md"
              icon={CheckSquare}
              onClick={() => setShowChecklistModal(true)}
              title="Verify required documents for major life events"
            >
              Life Event Checklists
            </Button>

            {/* Upload Button */}
            <Link to="/upload">
              <Button variant="primary" size="md" icon={Plus}>
                Upload Document
              </Button>
            </Link>
          </div>
        </div>

        {/* Category Pills Bar */}
        <div className="dv-category-bar">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              className={`dv-cat-pill ${selectedCategory === cat ? "dv-cat-pill--active" : ""}`}
              onClick={() => handleCategorySelect(cat)}
            >
              {cat}
              {cat === "All" && documents.length > 0 && (
                <span className="dv-cat-count">{documents.length}</span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div className="dv-docs-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Content Body */}
        {activeTab === "shared_with_me" ? (
          sharedDocs.length === 0 ? (
            <EmptyState
              title="No shared documents yet"
              description="Documents shared with you by your mutual connections will appear here with owner badges and access permissions."
              actionLabel="View Connections"
              onAction={() => navigate("/connections")}
            />
          ) : (
            <div className="dv-docs-grid">
              {sharedDocs.map((item) => (
                <Card
                  key={item.grantId}
                  hover
                  padding="md"
                  className="dv-doc-card"
                  onClick={() => navigate(`/documents/${item.documentId}`)}
                >
                  <div className="dv-doc-card__top">
                    <DocumentTypeIcon category={item.category} format={item.format} />
                    <div className="dv-doc-card__badges">
                      <span className="badge-count" style={{ background: '#0070f2' }}>
                        By {item.owner.name}
                      </span>
                    </div>
                  </div>

                  <div className="dv-doc-card__body">
                    <h3 className="dv-doc-card__title" title={item.title}>
                      {item.title}
                    </h3>
                    <p className="dv-doc-card__summary">
                      Owner: <strong>{item.owner.name}</strong> ({item.owner.docVaultId})
                    </p>
                  </div>

                  <div className="dv-doc-card__footer">
                    <span className="dv-doc-card__meta-tag">
                      {item.permissions?.download ? 'View + Download' : 'View Only'}
                    </span>
                    <span className="dv-doc-card__filesize">
                      {item.expiresAt ? `Expires ${new Date(item.expiresAt).toLocaleDateString()}` : 'Continuous'}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          )
        ) : loading ? (
          viewMode === "grid" ? (
            <div className="dv-docs-grid">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} padding="md" className="dv-doc-card">
                  <Skeleton height="36px" width="36px" variant="circle" />
                  <Skeleton height="20px" width="80%" style={{ marginTop: "12px" }} />
                  <Skeleton height="14px" width="100%" style={{ marginTop: "8px" }} />
                  <Skeleton height="14px" width="60%" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="dv-skeleton-list">
              <Skeleton height="50px" />
              <Skeleton height="50px" />
              <Skeleton height="50px" />
            </div>
          )
        ) : sortedDocuments.length === 0 ? (
          searchQuery || selectedCategory !== "All" ? (
            <EmptyState
              title="No documents matched your filter"
              description={`No documents found matching "${searchQuery || selectedCategory}". Try adjusting your keywords or clearing the filter.`}
              actionLabel="Clear Filters"
              onAction={handleClearFilters}
            />
          ) : (
            <EmptyState
              title="Your document repository is empty"
              description="Upload your vehicle insurance, health policies, passport copies, or appliance invoices to start tracking."
              actionLabel="Upload First Document"
              onAction={() => navigate("/upload")}
            />
          )
        ) : viewMode === "grid" ? (
          <div className="dv-docs-grid">
            {sortedDocuments.map((doc) => (
              <Card 
                key={doc._id} 
                hover 
                padding="md" 
                className="dv-doc-card"
                onClick={() => navigate(`/documents/${doc._id}`)}
              >
                <div className="dv-doc-card__top">
                  <DocumentTypeIcon 
                    category={doc.category} 
                    format={doc.format} 
                    isStorageOnly={doc.privacyMode === "STORAGE_ONLY"} 
                  />
                  <div className="dv-doc-card__badges">
                    <VerificationStatus 
                      status={
                        doc.privacyMode === "STORAGE_ONLY" 
                          ? "storage_only" 
                          : doc.processingStatus === "needs_review" 
                          ? "needs_review" 
                          : "accepted"
                      } 
                      size="sm" 
                    />
                  </div>
                </div>

                <div className="dv-doc-card__body">
                  <h3 className="dv-doc-card__title" title={doc.title}>
                    {doc.title}
                  </h3>
                  <p className="dv-doc-card__summary">
                    {doc.summary || "Structured metadata extracted and indexed in vault."}
                  </p>
                </div>

                {doc.expiryDate && (
                  <div className="dv-doc-card__expiry-row">
                    <ExpiryBadge expiryDate={doc.expiryDate} size="sm" />
                    <span className="dv-doc-card__expiry-date">Exp: {doc.expiryDate}</span>
                  </div>
                )}

                <div className="dv-doc-card__footer">
                  <span className="dv-doc-card__meta-tag">
                    {doc.category || "General"} • {doc.format || "PDF"}
                  </span>
                  <span className="dv-doc-card__filesize">
                    {doc.fileSizeFormatted || "Stored"}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          /* Table View */
          <div className="dv-docs-table-container">
            <table className="dv-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Category</th>
                  <th>Format</th>
                  <th>Verification</th>
                  <th>Renewal Status</th>
                  <th>Date Added</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedDocuments.map((doc) => (
                  <tr 
                    key={doc._id}
                    onClick={() => navigate(`/documents/${doc._id}`)}
                    className="dv-table-row"
                  >
                    <td>
                      <div className="dv-table-doc-cell">
                        <DocumentTypeIcon 
                          category={doc.category} 
                          format={doc.format} 
                          size={16} 
                          isStorageOnly={doc.privacyMode === "STORAGE_ONLY"} 
                        />
                        <div className="dv-table-doc-text">
                          <span className="dv-table-doc-title">{doc.title}</span>
                          <span className="dv-table-doc-original">{doc.originalName || "Uploaded file"}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge variant="default" size="sm">{doc.category || "General"}</Badge>
                    </td>
                    <td>
                      <span className="dv-table-mono">{doc.format || "PDF"}</span>
                    </td>
                    <td>
                      <VerificationStatus 
                        status={
                          doc.privacyMode === "STORAGE_ONLY" 
                            ? "storage_only" 
                            : doc.processingStatus === "needs_review" 
                            ? "needs_review" 
                            : "accepted"
                        } 
                        size="sm" 
                      />
                    </td>
                    <td>
                      {doc.expiryDate ? (
                        <ExpiryBadge expiryDate={doc.expiryDate} size="sm" />
                      ) : (
                        <span className="dv-text-muted" style={{ fontSize: "12px" }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className="dv-table-date">
                        {new Date(doc.createdAt || Date.now()).toLocaleDateString()}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link 
                        to={`/documents/${doc._id}`} 
                        onClick={(e) => e.stopPropagation()}
                        className="dv-table-inspect-link"
                      >
                        Inspect <ChevronRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Life Event Checklists Modal (Part C) */}
      <Modal
        isOpen={showChecklistModal}
        onClose={() => setShowChecklistModal(false)}
        title="📋 Document Checklist Templates"
        maxWidth="680px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Template Selector Tabs */}
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {CHECKLIST_TEMPLATES.map(tmpl => (
              <button
                key={tmpl.id}
                type="button"
                className={`dv-cat-pill ${selectedChecklistId === tmpl.id ? "dv-cat-pill--active" : ""}`}
                onClick={() => setSelectedChecklistId(tmpl.id)}
              >
                <span>{tmpl.icon}</span> {tmpl.title}
              </button>
            ))}
          </div>

          {(() => {
            const currentTmpl = CHECKLIST_TEMPLATES.find(t => t.id === selectedChecklistId) || CHECKLIST_TEMPLATES[0];
            const evaluations = currentTmpl.items.map(item => ({
              ...item,
              matchedDoc: matchChecklistItem(item, documents)
            }));
            const foundCount = evaluations.filter(e => !!e.matchedDoc).length;
            const totalCount = evaluations.length;
            const percentage = Math.round((foundCount / totalCount) * 100);

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {/* Progress Header */}
                <div style={{
                  padding: "14px 16px",
                  background: percentage === 100 ? "rgba(34, 197, 94, 0.08)" : "rgba(59, 130, 246, 0.08)",
                  border: `1px solid ${percentage === 100 ? "rgba(34, 197, 94, 0.3)" : "rgba(59, 130, 246, 0.25)"}`,
                  borderRadius: "12px"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <strong style={{ fontSize: "14px", color: "var(--color-text-primary)" }}>
                      {currentTmpl.icon} {currentTmpl.title} Readiness
                    </strong>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: percentage === 100 ? "#22C55E" : "var(--color-primary)" }}>
                      {foundCount} of {totalCount} Ready ({percentage}%)
                    </span>
                  </div>
                  <p style={{ margin: "0 0 8px", fontSize: "12px", color: "var(--color-text-secondary)" }}>
                    {currentTmpl.desc}
                  </p>
                  {/* Progress Bar */}
                  <div style={{ width: "100%", height: "6px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "9999px", overflow: "hidden" }}>
                    <div style={{
                      width: `${percentage}%`,
                      height: "100%",
                      background: percentage === 100 ? "#22C55E" : "var(--color-primary)",
                      transition: "width 0.3s ease"
                    }} />
                  </div>
                </div>

                {/* Items List */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {evaluations.map((evalItem, idx) => {
                    const isFound = !!evalItem.matchedDoc;
                    return (
                      <div
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 14px",
                          borderRadius: "10px",
                          background: isFound ? "rgba(34, 197, 94, 0.04)" : "var(--color-surface-secondary)",
                          border: `1px solid ${isFound ? "rgba(34, 197, 94, 0.25)" : "var(--color-border)"}`,
                          gap: "10px"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                          {isFound ? (
                            <CheckCircle2 size={18} color="#22C55E" style={{ flexShrink: 0 }} />
                          ) : (
                            <div style={{
                              width: "18px",
                              height: "18px",
                              borderRadius: "50%",
                              border: "2px solid var(--color-text-muted)",
                              flexShrink: 0
                            }} />
                          )}
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ fontSize: "13px", color: "var(--color-text-primary)", display: "block" }}>
                              {evalItem.name}
                            </strong>
                            <span style={{ fontSize: "11px", color: isFound ? "#22C55E" : "var(--color-text-secondary)" }}>
                              {isFound ? `Found in vault: "${evalItem.matchedDoc.title}"` : evalItem.required ? "Required — Missing from vault" : "Optional — Missing"}
                            </span>
                          </div>
                        </div>

                        <div>
                          {isFound ? (
                            <Link
                              to={`/documents/${evalItem.matchedDoc._id}`}
                              style={{ textDecoration: "none" }}
                              onClick={() => setShowChecklistModal(false)}
                            >
                              <Button variant="ghost" size="sm">
                                View
                              </Button>
                            </Link>
                          ) : (
                            <Link
                              to={`/upload?category=${encodeURIComponent(evalItem.category)}`}
                              style={{ textDecoration: "none" }}
                              onClick={() => setShowChecklistModal(false)}
                            >
                              <Button variant="primary" size="sm" icon={Plus}>
                                Upload
                              </Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      </Modal>
    </div>
  );
}
