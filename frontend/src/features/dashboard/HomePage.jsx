import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/context/AuthContext";
import { apiRequest } from "../../services/api";
import { 
  FileText, UploadCloud, Calendar, Sparkles, Layers, ArrowRight,
  AlertTriangle, Clock, ChevronRight, Search, Lock, Share2,
  CheckCircle2, Eye, ShieldCheck, X
} from "lucide-react";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import EmptyState from "../../components/common/EmptyState/EmptyState";
import Skeleton from "../../components/common/Skeleton/Skeleton";
import DocumentTypeIcon from "../../components/common/DocumentTypeIcon/DocumentTypeIcon";
import ExpiryBadge from "../../components/common/ExpiryBadge/ExpiryBadge";
import VerificationStatus from "../../components/common/VerificationStatus/VerificationStatus";
import ExtractionConfidence from "../../components/common/ExtractionConfidence/ExtractionConfidence";

import "./HomePage.css";

const SUGGESTED_COPILOT_QUESTIONS = [
  "When does my motor insurance expire?",
  "Find my latest electricity bill",
  "Which appliances still have active warranties?",
  "What is my passport number?"
];

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState("");
  const [documents, setDocuments] = useState(() => {
    try {
      const cached = sessionStorage.getItem("dv_cached_docs");
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [deadlines, setDeadlines] = useState(() => {
    try {
      const cached = sessionStorage.getItem("dv_cached_deadlines");
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [assets, setAssets] = useState(() => {
    try {
      const cached = sessionStorage.getItem("dv_cached_assets");
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [reviewQueue, setReviewQueue] = useState([]);
  const [loading, setLoading] = useState(() => {
    return !sessionStorage.getItem("dv_cached_docs");
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        if (!sessionStorage.getItem("dv_cached_docs")) {
          setLoading(true);
        }
        setError(null);

        const [docsRes, deadRes, assetsRes, reviewRes] = await Promise.all([
          apiRequest("/api/documents").catch(() => ({ data: [] })),
          apiRequest("/api/deadlines").catch(() => ({ data: [] })),
          apiRequest("/api/assets").catch(() => ({ data: [] })),
          apiRequest("/api/extraction/review-queue").catch(() => ({ data: [] })),
        ]);

        if (docsRes?.data) {
          setDocuments(docsRes.data);
          try { sessionStorage.setItem("dv_cached_docs", JSON.stringify(docsRes.data)); } catch {}
        }
        if (deadRes?.data) {
          setDeadlines(deadRes.data);
          try { sessionStorage.setItem("dv_cached_deadlines", JSON.stringify(deadRes.data)); } catch {}
        }
        if (assetsRes?.data) {
          setAssets(assetsRes.data);
          try { sessionStorage.setItem("dv_cached_assets", JSON.stringify(assetsRes.data)); } catch {}
        }
        if (reviewRes?.data) setReviewQueue(reviewRes.data);
      } catch (err) {
        console.warn("[Dashboard] Error loading data:", err.message);
        setError("Unable to sync vault overview. Please refresh or check connection.");
      } finally {
        setLoading(false);
      }
    }
    fetchDashboardData();
  }, []);

  const safeDeadlines = Array.isArray(deadlines) ? deadlines : [];
  const safeDocs = Array.isArray(documents) ? documents : [];
  const safeReviewQueue = Array.isArray(reviewQueue) ? reviewQueue : [];

  const urgentDeadlines = safeDeadlines.filter(
    (d) => d.severity === "urgent" || (d.daysLeft !== undefined && d.daysLeft <= 15)
  );

  const sharedDocsCount = safeDocs.filter(
    (d) => d.isShared || (Array.isArray(d.sharedWith) && d.sharedWith.length > 0)
  ).length;
  const privateDocsCount = Math.max(0, safeDocs.length - sharedDocsCount);

  const recentDocs = safeDocs.slice(0, 5);
  const pendingReviewDocs = safeReviewQueue.slice(0, 3);

  const userName = user?.name ? user.name.split(" ")[0] : "Vault Custodian";

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/ask-ai?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate("/ask-ai");
    }
  };

  const handleChipClick = (question) => {
    navigate(`/ask-ai?q=${encodeURIComponent(question)}`);
  };

  return (
    <div className="dv-dashboard">
      <AppHeader
        title={`Welcome back, ${userName}`}
        subtitle="Privacy-First Document Manager • Secure by design"
      />

      <div className="dv-dashboard__content">
        {/* Error Notice if API fails */}
        {error && (
          <div className="dv-alert-banner dv-alert-banner--danger" role="alert">
            <AlertTriangle size={20} />
            <div className="dv-alert-banner__text">
              <h4>Connection Warning</h4>
              <p>{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        )}

        {/* Section 1: Compact Welcome Header & Quick Actions */}
        <section className="dv-welcome-section" aria-label="Quick Actions">
          <div className="dv-welcome-content">
            <h2 className="dv-welcome-title">
              Manage your personal & family vault
            </h2>
            <p className="dv-welcome-desc">
              Search policies, track warranties, monitor renewal deadlines, and keep records private.
            </p>
          </div>
          <div className="dv-welcome-actions">
            <Link to="/upload">
              <Button variant="primary" size="md" icon={UploadCloud}>
                Upload Document
              </Button>
            </Link>
            <Link to="/ask-ai">
              <Button variant="outline" size="md" icon={Sparkles}>
                Ask Copilot
              </Button>
            </Link>
          </div>
        </section>

        {/* Section 2: Prominent Natural Language Search Bar */}
        <section className="dv-search-hero" aria-label="AI Search">
          <form className="dv-search-box" onSubmit={handleSearchSubmit}>
            <div className="dv-search-box__icon">
              <Sparkles size={18} className="dv-search-sparkle-icon" />
            </div>
            <input
              type="text"
              className="dv-search-box__input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ask anything about your documents, e.g. What is my passport expiry date?"
              aria-label="Ask questions about your documents"
            />
            <button type="submit" className="dv-search-box__submit" aria-label="Search">
              <span>Ask Copilot</span>
              <ArrowRight size={16} />
            </button>
          </form>

          <div className="dv-search-suggestions">
            <span className="dv-search-suggestions__label">Try asking:</span>
            <div className="dv-search-chips">
              {SUGGESTED_COPILOT_QUESTIONS.map((question, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="dv-search-chip"
                  onClick={() => handleChipClick(question)}
                >
                  <Search size={12} className="dv-search-chip__icon" />
                  <span>{question}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3: Important Reminders / Needs Attention */}
        {urgentDeadlines.length > 0 && (
          <section className="dv-alert-banner dv-alert-banner--warning" aria-label="Urgent Reminders">
            <div className="dv-alert-banner__icon-box">
              <AlertTriangle size={20} />
            </div>
            <div className="dv-alert-banner__text">
              <h4>Renewal Attention Required</h4>
              <p>
                You have {urgentDeadlines.length} critical policy deadline(s) expiring within 15 days.
              </p>
            </div>
            <Link to="/deadlines">
              <Button variant="danger" size="sm" icon={Calendar}>
                Review Deadlines
              </Button>
            </Link>
          </section>
        )}

        {/* Section 4: Vault Overview Statistics */}
        <section className="dv-stats-grid" aria-label="Vault Overview Statistics">
          <Card padding="md" className="dv-stat-card">
            <div className="dv-stat-card__icon-box dv-stat-card__icon-box--primary">
              <FileText size={20} />
            </div>
            <div className="dv-stat-card__meta">
              <span className="dv-stat-card__label">Total Documents</span>
              <span className="dv-stat-card__value">
                {loading ? <Skeleton width="48px" height="28px" /> : documents.length}
              </span>
              <span className="dv-stat-card__sub">Stored & Indexed</span>
            </div>
          </Card>

          <Card padding="md" className="dv-stat-card">
            <div className="dv-stat-card__icon-box dv-stat-card__icon-box--success">
              <Lock size={20} />
            </div>
            <div className="dv-stat-card__meta">
              <span className="dv-stat-card__label">Private Documents</span>
              <span className="dv-stat-card__value">
                {loading ? <Skeleton width="48px" height="28px" /> : privateDocsCount}
              </span>
              <span className="dv-stat-card__sub">Zero External Access</span>
            </div>
          </Card>

          <Card padding="md" className="dv-stat-card">
            <div className="dv-stat-card__icon-box dv-stat-card__icon-box--info">
              <Share2 size={20} />
            </div>
            <div className="dv-stat-card__meta">
              <span className="dv-stat-card__label">Shared Documents</span>
              <span className="dv-stat-card__value">
                {loading ? <Skeleton width="48px" height="28px" /> : sharedDocsCount}
              </span>
              <span className="dv-stat-card__sub">With Authorized Members</span>
            </div>
          </Card>

          <Card padding="md" className="dv-stat-card">
            <div className="dv-stat-card__icon-box dv-stat-card__icon-box--warning">
              <Calendar size={20} />
            </div>
            <div className="dv-stat-card__meta">
              <span className="dv-stat-card__label">Upcoming Deadlines</span>
              <span className="dv-stat-card__value">
                {loading ? <Skeleton width="48px" height="28px" /> : deadlines.length}
              </span>
              <span className="dv-stat-card__sub">
                {urgentDeadlines.length > 0 ? `${urgentDeadlines.length} urgent action(s)` : "Monitored on schedule"}
              </span>
            </div>
          </Card>
        </section>

        {/* Section: Extraction Review Queue if flagged */}
        {reviewQueue.length > 0 && (
          <section className="dv-review-queue-section" aria-label="Review Queue">
            <div className="dv-section-header">
              <div className="dv-section-header__title-wrap">
                <span className="dv-badge dv-badge--warning">Action Needed</span>
                <h3 className="dv-section-header__title">Fields Requiring Confirmation</h3>
                <p className="dv-section-header__subtitle">
                  AI extracted these values with lower confidence. Confirm or correct them in one tap.
                </p>
              </div>
              <Link to="/documents" className="dv-section-header__action">
                View All <ChevronRight size={16} />
              </Link>
            </div>

            <div className="dv-review-grid">
              {pendingReviewDocs.map((doc) => {
                const unverifiedFields = (doc.extractedFields || []).filter(
                  (f) => f.verificationStatus === "needs_review"
                );
                const sampleField = unverifiedFields[0];

                return (
                  <Card key={doc._id} padding="md" hover className="dv-review-card">
                    <div className="dv-review-card__header">
                      <div className="dv-review-card__doc-info">
                        <DocumentTypeIcon category={doc.category} format={doc.format} size={16} />
                        <div>
                          <h4 className="dv-review-card__doc-title">{doc.title}</h4>
                          <span className="dv-review-card__category">{doc.category || "General"}</span>
                        </div>
                      </div>
                      <Badge variant="warning" size="sm">Review</Badge>
                    </div>

                    {sampleField ? (
                      <div className="dv-review-card__field-box">
                        <div className="dv-review-field-meta">
                          <span className="dv-review-field-label">
                            {String(sampleField.fieldName || sampleField.field_name || "Field").replace(/_/g, " ")}:
                          </span>
                          <ExtractionConfidence confidence={sampleField.confidence} />
                        </div>
                        <div className="dv-review-field-val">
                          {String(sampleField.value || "Detected in document")}
                        </div>
                        {sampleField.evidence && (
                          <div className="dv-review-field-evidence">
                            "{sampleField.evidence.slice(0, 80)}..."
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="dv-text-muted" style={{ fontSize: "12px", margin: "8px 0" }}>
                        Document flags require visual inspection.
                      </p>
                    )}

                    <div className="dv-review-card__footer">
                      <Link to={`/documents/${doc._id}`} style={{ width: "100%" }}>
                        <Button variant="outline" size="sm" style={{ width: "100%" }}>
                          Review Document
                        </Button>
                      </Link>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* Section 5: Recent Documents & Upcoming Expirations */}
        <div className="dv-dash-dual-grid">
          {/* Left Column: Recent Documents */}
          <section className="dv-dash-pane" aria-label="Recent Documents">
            <div className="dv-section-header">
              <div>
                <h3 className="dv-section-header__title">Recent Documents</h3>
                <p className="dv-section-header__subtitle">Recently added to your vault</p>
              </div>
              <Link to="/documents" className="dv-section-header__action">
                View All <ChevronRight size={16} />
              </Link>
            </div>

            {loading ? (
              <div className="dv-skeleton-list">
                <Skeleton height="60px" />
                <Skeleton height="60px" />
                <Skeleton height="60px" />
              </div>
            ) : recentDocs.length === 0 ? (
              <EmptyState
                title="Your vault is empty"
                description="Upload your personal documents, insurance policies, or IDs to get started."
                actionLabel="Upload First Document"
                onAction={() => navigate("/upload")}
              />
            ) : (
              <div className="dv-doc-table-card">
                {recentDocs.map((doc) => (
                  <div 
                    key={doc._id} 
                    className="dv-doc-row"
                    onClick={() => navigate(`/documents/${doc._id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") navigate(`/documents/${doc._id}`);
                    }}
                  >
                    <DocumentTypeIcon 
                      category={doc.category} 
                      format={doc.format} 
                      isStorageOnly={doc.privacyMode === "STORAGE_ONLY"} 
                    />
                    <div className="dv-doc-row__details">
                      <span className="dv-doc-row__title">{doc.title}</span>
                      <span className="dv-doc-row__meta">
                        {doc.category || "General"} • {doc.format || "PDF"} • {doc.fileSizeFormatted || "Stored"}
                      </span>
                    </div>

                    <div className="dv-doc-row__badges">
                      {doc.expiryDate && (
                        <ExpiryBadge expiryDate={doc.expiryDate} size="sm" />
                      )}
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

                    <ChevronRight size={16} className="dv-doc-row__arrow" />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Right Column: Renewal Attention (Deadlines) */}
          <section className="dv-dash-pane" aria-label="Upcoming Expirations">
            <div className="dv-section-header">
              <div>
                <h3 className="dv-section-header__title">Upcoming Expirations</h3>
                <p className="dv-section-header__subtitle">Monitored policy and warranty dates</p>
              </div>
              <Link to="/deadlines" className="dv-section-header__action">
                View Calendar <ChevronRight size={16} />
              </Link>
            </div>

            {loading ? (
              <div className="dv-skeleton-list">
                <Skeleton height="60px" />
                <Skeleton height="60px" />
                <Skeleton height="60px" />
              </div>
            ) : deadlines.length === 0 ? (
              <Card padding="lg" className="dv-empty-card">
                <Clock size={32} className="dv-empty-card__icon" />
                <p className="dv-empty-card__title">No pending renewal deadlines</p>
                <span className="dv-empty-card__desc">
                  Upload contracts or bills to automatically extract expiry schedules.
                </span>
              </Card>
            ) : (
              <div className="dv-deadline-list">
                {deadlines.slice(0, 5).map((d) => (
                  <div key={d._id} className="dv-deadline-row">
                    <div className="dv-deadline-row__left">
                      <div className="dv-deadline-row__indicator" />
                      <div>
                        <span className="dv-deadline-row__title">{d.title || d.documentTitle}</span>
                        <span className="dv-deadline-row__date">
                          Due: {d.date || (d.dueDate ? new Date(d.dueDate).toLocaleDateString() : "Scheduled")}
                        </span>
                      </div>
                    </div>
                    <ExpiryBadge 
                      expiryDate={d.date || d.dueDate} 
                      daysLeft={d.daysLeft} 
                      size="sm" 
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

      </div>
    </div>
  );
}
