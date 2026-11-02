import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/context/AuthContext";
import { apiRequest } from "../../services/api";
import { 
  FileText, UploadCloud, Calendar, Sparkles, Layers, ArrowRight,
  ShieldCheck, AlertTriangle, Clock, ChevronRight, Lock, 
  CheckCircle2, Eye, HelpCircle, Shield, FileCheck
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
  "What is covered under my health policy?",
  "Which appliances still have active warranties?",
  "Find the important details in my latest invoice."
];

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [assets, setAssets] = useState([]);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true);
        setError(null);

        const [docsRes, deadRes, assetsRes, reviewRes] = await Promise.all([
          apiRequest("/api/documents").catch(() => ({ data: [] })),
          apiRequest("/api/deadlines").catch(() => ({ data: [] })),
          apiRequest("/api/assets").catch(() => ({ data: [] })),
          apiRequest("/api/extraction/review-queue").catch(() => ({ data: [] })),
        ]);

        if (docsRes?.data) setDocuments(docsRes.data);
        if (deadRes?.data) setDeadlines(deadRes.data);
        if (assetsRes?.data) setAssets(assetsRes.data);
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

  const recentDocs = safeDocs.slice(0, 5);
  const pendingReviewDocs = safeReviewQueue.slice(0, 4);

  const userName = user?.name ? user.name.split(" ")[0] : "Vault Custodian";

  return (
    <div className="dv-dashboard">
      <AppHeader
        title="Your personal document command centre"
        subtitle={`Welcome back, ${userName}. Everything important, organized and protected.`}
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

        {/* Section A: Welcome Hero Bar with Direct Action CTAs */}
        <div className="dv-dash-hero">
          <div className="dv-dash-hero__info">
            <h2 className="dv-dash-hero__title">
              Secure Documents. Actionable Intelligence.
            </h2>
            <p className="dv-dash-hero__desc">
              Your policies, warranties, and identity records are organized, verified, and protected. Never miss critical renewals.
            </p>
          </div>

          <div className="dv-dash-hero__actions">
            <Link to="/upload">
              <Button variant="primary" size="md" icon={UploadCloud}>
                Upload Document
              </Button>
            </Link>
            <Link to="/documents">
              <Button variant="outline" size="md" icon={FileText}>
                Browse Vault
              </Button>
            </Link>
          </div>
        </div>

        {/* Mobile & Tablet Native App Quick Action Pills */}
        <div className="dv-mobile-quick-actions">
          <Link to="/upload" className="dv-mobile-quick-btn dv-mobile-quick-btn--primary">
            <UploadCloud size={16} />
            <span>Upload File</span>
          </Link>
          <Link to="/ask-ai" className="dv-mobile-quick-btn dv-mobile-quick-btn--dark">
            <Sparkles size={16} />
            <span>Ask Copilot</span>
          </Link>
          <Link to="/admin" className="dv-mobile-quick-btn dv-mobile-quick-btn--outline">
            <ShieldCheck size={16} />
            <span>Enclave Admin</span>
          </Link>
        </div>

        {/* Urgent Renewal Alert Banner */}
        {urgentDeadlines.length > 0 && (
          <div className="dv-alert-banner dv-alert-banner--warning">
            <div className="dv-alert-banner__icon-box">
              <AlertTriangle size={20} color="#DC2626" />
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
          </div>
        )}

        {/* Section B: Overview Metrics Grid */}
        <div className="dv-stats-grid">
          <Card padding="md" className="dv-stat-card">
            <div className="dv-stat-card__icon-box dv-stat-card__icon-box--brand">
              <FileText size={22} color="#0070F2" />
            </div>
            <div className="dv-stat-card__meta">
              <span className="dv-stat-card__label">Total Documents</span>
              <span className="dv-stat-card__value">
                {loading ? <Skeleton width="60px" height="28px" /> : documents.length}
              </span>
            </div>
          </Card>

          <Card padding="md" className="dv-stat-card">
            <div className="dv-stat-card__icon-box dv-stat-card__icon-box--amber">
              <Calendar size={22} color="#D97706" />
            </div>
            <div className="dv-stat-card__meta">
              <span className="dv-stat-card__label">Upcoming Deadlines</span>
              <span className="dv-stat-card__value">
                {loading ? <Skeleton width="60px" height="28px" /> : deadlines.length}
              </span>
            </div>
          </Card>

          <Card padding="md" className="dv-stat-card">
            <div className="dv-stat-card__icon-box dv-stat-card__icon-box--blue">
              <Layers size={22} color="#2563EB" />
            </div>
            <div className="dv-stat-card__meta">
              <span className="dv-stat-card__label">Tracked Assets</span>
              <span className="dv-stat-card__value">
                {loading ? <Skeleton width="60px" height="28px" /> : assets.length}
              </span>
            </div>
          </Card>

          <Card padding="md" className="dv-stat-card">
            <div className="dv-stat-card__icon-box dv-stat-card__icon-box--purple">
              <CheckCircle2 size={22} color="#9333EA" />
            </div>
            <div className="dv-stat-card__meta">
              <span className="dv-stat-card__label">Needs Review</span>
              <span className="dv-stat-card__value">
                {loading ? <Skeleton width="60px" height="28px" /> : reviewQueue.length}
              </span>
            </div>
          </Card>
        </div>

        {/* Section D: AI Copilot Panel */}
        <div className="dv-ai-copilot-card">
          <div className="dv-ai-copilot-card__header">
            <div className="dv-ai-copilot-card__icon">
              <Sparkles size={22} color="#FFFFFF" />
            </div>
            <div>
              <h3 className="dv-ai-copilot-card__title">Your documents. One intelligent assistant.</h3>
              <p className="dv-ai-copilot-card__desc">
                Ask questions and get answers grounded strictly in your personal vault.
              </p>
            </div>
            <div className="dv-ai-copilot-card__cta">
              <Link to="/ask-ai">
                <Button variant="secondary" size="md" icon={ArrowRight} iconPosition="right">
                  Ask DocVault
                </Button>
              </Link>
            </div>
          </div>

          <div className="dv-ai-copilot-card__suggestions">
            <span className="dv-ai-suggestions-label">Try asking:</span>
            <div className="dv-ai-chips">
              {SUGGESTED_COPILOT_QUESTIONS.map((question, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="dv-ai-chip"
                  onClick={() => navigate(`/ask-ai?q=${encodeURIComponent(question)}`)}
                >
                  <Sparkles size={12} className="dv-ai-chip__icon" />
                  <span>{question}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Section F: Extraction Review Queue (Key Product Differentiator) */}
        {reviewQueue.length > 0 && (
          <div className="dv-review-queue-section">
            <div className="dv-dash-pane__header">
              <div className="dv-dash-pane__title-wrap">
                <div className="dv-review-pill">Attention Needed</div>
                <h3 className="dv-dash-pane__title">Documents Needing Review</h3>
                <p className="dv-dash-pane__subtitle">
                  Important details flagged for your quick confirmation.
                </p>
              </div>
              <Link to="/documents" className="dv-dash-pane__action">
                View All Documents <ChevronRight size={16} />
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
                      <Badge variant="warning" size="sm">Verification Required</Badge>
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
                            "{sampleField.evidence.slice(0, 90)}..."
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
          </div>
        )}

        {/* Section E & G: Dual Column (Recent Documents & Renewal Attention) */}
        <div className="dv-dash-dual-grid">
          {/* Left Column: Recent Documents */}
          <div className="dv-dash-pane">
            <div className="dv-dash-pane__header">
              <div>
                <h3 className="dv-dash-pane__title">Recent Vault Documents</h3>
                <p className="dv-dash-pane__subtitle">Latest policies, contracts, and proofs</p>
              </div>
              <Link to="/documents" className="dv-dash-pane__action">
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
                title="Your vault is currently empty"
                description="Upload your insurance policies, warranty cards, or identity proofs to enable automated OCR extraction."
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
          </div>

          {/* Right Column: Renewal Attention (Deadlines) */}
          <div className="dv-dash-pane">
            <div className="dv-dash-pane__header">
              <div>
                <h3 className="dv-dash-pane__title">Renewal Attention</h3>
                <p className="dv-dash-pane__subtitle">Upcoming policy and warranty expirations</p>
              </div>
              <Link to="/deadlines" className="dv-dash-pane__action">
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
                <Clock size={32} color="#94A3B8" />
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
          </div>
        </div>

        {/* Section C: Intelligent Upload Entry Point & Quick Actions */}
        <div className="dv-upload-entry-section">
          <Card padding="lg" className="dv-upload-entry-card">
            <div className="dv-upload-entry-card__content">
              <div className="dv-upload-entry-card__icon-box">
                <UploadCloud size={28} />
              </div>
              <div>
                <h4 className="dv-upload-entry-card__title">Ready to secure a new document?</h4>
                <p className="dv-upload-entry-card__desc">
                  Accepted formats: <strong>PDF, JPG, JPEG, PNG, WEBP</strong> (up to 25 MB). Automatic details organization, renewal schedules, and smart search.
                </p>
              </div>
            </div>
            <Link to="/upload">
              <Button variant="primary" size="md" icon={UploadCloud}>
                Upload Document
              </Button>
            </Link>
          </Card>
        </div>

        {/* Section H: Privacy and Vault Trust Panel */}
        <div className="dv-trust-panel">
          <div className="dv-trust-panel__header">
            <div className="dv-trust-panel__badge">
              <ShieldCheck size={16} />
              <span>Security Architecture</span>
            </div>
            <h4 className="dv-trust-panel__title">How DocVault Protects Your Personal Records</h4>
          </div>

          <div className="dv-trust-grid">
            <div className="dv-trust-item">
              <div className="dv-trust-item__icon dv-trust-item__icon--emerald">
                <Lock size={18} />
              </div>
              <div className="dv-trust-item__content">
                <h5>Two-Stage Protection</h5>
                <p>Authentication requires account password plus a personal 4-to-6 digit vault PIN challenge.</p>
              </div>
            </div>

            <div className="dv-trust-item">
              <div className="dv-trust-item__icon dv-trust-item__icon--blue">
                <Shield size={18} />
              </div>
              <div className="dv-trust-item__content">
                <h5>Tenant Isolation</h5>
                <p>Every query is strictly user-scoped in database queries with strict authorization boundaries.</p>
              </div>
            </div>

            <div className="dv-trust-item">
              <div className="dv-trust-item__icon dv-trust-item__icon--purple">
                <FileCheck size={18} />
              </div>
              <div className="dv-trust-item__content">
                <h5>Storage-Only Isolation</h5>
                <p>Sensitive IDs (Aadhaar, PAN) can be isolated from AI and indexing pipelines.</p>
              </div>
            </div>

            <div className="dv-trust-item">
              <div className="dv-trust-item__icon dv-trust-item__icon--amber">
                <Clock size={18} />
              </div>
              <div className="dv-trust-item__content">
                <h5>Audit Trail Logging</h5>
                <p>All file views, uploads, and deletions are recorded in an immutable audit ledger.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
