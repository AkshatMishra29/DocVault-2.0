import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiRequest, API_BASE_URL } from "../../services/api";
import { Calendar, Download, AlertTriangle, Clock, CheckCircle2, FileText, ChevronRight, ArrowRight, Plus, Trash2, Check, ExternalLink } from "lucide-react";
import Modal from "../../components/common/Modal/Modal";

import AppHeader from "../../components/layout/AppHeader/AppHeader";
import Card from "../../components/common/Card/Card";
import Button from "../../components/common/Button/Button";
import Badge from "../../components/common/Badge/Badge";
import EmptyState from "../../components/common/EmptyState/EmptyState";
import Skeleton from "../../components/common/Skeleton/Skeleton";
import ExpiryBadge from "../../components/common/ExpiryBadge/ExpiryBadge";

import "./DeadlinesPage.css";

export default function DeadlinesPage() {
  const [deadlines, setDeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [availableDocs, setAvailableDocs] = useState([]);
  
  // Add manual reminder modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newCategory, setNewCategory] = useState("Bill Due Date");
  const [newAction, setNewAction] = useState("");
  const [selectedDocId, setSelectedDocId] = useState("");
  const [modalError, setModalError] = useState("");

  // Link existing reminder to doc modal state
  const [linkModalDeadline, setLinkModalDeadline] = useState(null);
  const [linkTargetDocId, setLinkTargetDocId] = useState("");
  const [linkingDoc, setLinkingDoc] = useState(false);

  useEffect(() => {
    fetchDeadlines();
    fetchDocuments();
  }, []);

  async function fetchDocuments() {
    try {
      const res = await apiRequest("/api/documents");
      if (res.success && Array.isArray(res.data)) {
        setAvailableDocs(res.data);
      }
    } catch (err) {
      console.warn("Failed to retrieve documents for linking:", err);
    }
  }

  async function fetchDeadlines() {
    try {
      setLoading(true);
      setError("");
      const res = await apiRequest("/api/deadlines");
      if (res.success && res.data) {
        setDeadlines(res.data);
      } else {
        setDeadlines([]);
      }
    } catch (err) {
      setError("Failed to retrieve deadline schedules.");
    } finally {
      setLoading(false);
    }
  }

  const handleCreateReminder = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDate) {
      setModalError("Please provide both a title and a due date.");
      return;
    }

    try {
      setSubmitting(true);
      setModalError("");
      const res = await apiRequest("/api/deadlines", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          date: newDate,
          category: newCategory,
          action: newAction.trim() || "Payment / Renewal required",
          linkedDocId: selectedDocId || null,
        }),
      });

      if (res.success && res.data) {
        setDeadlines((prev) => [res.data, ...prev]);
        setShowAddModal(false);
        setNewTitle("");
        setNewDate("");
        setNewAction("");
        setSelectedDocId("");
      } else {
        setModalError(res.error || "Failed to create reminder.");
      }
    } catch (err) {
      setModalError(err.message || "Error saving reminder.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLinkDocToDeadline = async (e) => {
    e.preventDefault();
    if (!linkModalDeadline) return;
    try {
      setLinkingDoc(true);
      const res = await apiRequest(`/api/deadlines/${linkModalDeadline._id}`, {
        method: "PUT",
        body: JSON.stringify({
          linkedDocId: linkTargetDocId || null,
        }),
      });
      if (res.success && res.data) {
        setDeadlines((prev) =>
          prev.map((d) => (d._id === linkModalDeadline._id ? res.data : d))
        );
        setLinkModalDeadline(null);
        setLinkTargetDocId("");
      } else {
        alert(res.error || "Failed to link document.");
      }
    } catch (err) {
      alert("Error linking document: " + err.message);
    } finally {
      setLinkingDoc(false);
    }
  };

  const handleToggleComplete = async (id) => {
    try {
      const res = await apiRequest(`/api/deadlines/${id}/complete`, { method: "PATCH" });
      if (res.success && res.data) {
        setDeadlines((prev) =>
          prev.map((d) => (d._id === id ? { ...d, isCompleted: res.data.isCompleted, status: res.data.status } : d))
        );
      }
    } catch (err) {
      console.warn("Failed to update status:", err);
    }
  };

  const handleDeleteReminder = async (id) => {
    if (!window.confirm("Remove this reminder?")) return;
    try {
      const res = await apiRequest(`/api/deadlines/${id}`, { method: "DELETE" });
      if (res.success) {
        setDeadlines((prev) => prev.filter((d) => d._id !== id));
      }
    } catch (err) {
      alert("Failed to delete reminder: " + err.message);
    }
  };

  const token = localStorage.getItem("token");
  const calendarIcsUrl = `${API_BASE_URL}/api/deadlines/calendar.ics?token=${token}`;

  // Group into urgent and upcoming
  const urgentDeadlines = deadlines.filter(
    (d) => d.severity === "urgent" || (d.daysLeft !== undefined && d.daysLeft <= 15)
  );

  const regularDeadlines = deadlines.filter(
    (d) => !(d.severity === "urgent" || (d.daysLeft !== undefined && d.daysLeft <= 15))
  );

  return (
    <div className="dv-deadlines-page">
      <AppHeader
        title="Renewals & Reminders"
        subtitle="Automated countdown schedules derived from policy and warranty expiration dates."
      />

      <div className="dv-deadlines-content">
        <div className="dv-deadlines-toolbar">
          <div className="dv-deadlines-count">
            <strong>{deadlines.length}</strong> Tracked Policy & Renewal Deadline(s)
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <Button
              variant="primary"
              size="md"
              icon={Plus}
              onClick={() => {
                setShowAddModal(true);
                setModalError("");
              }}
            >
              Add Reminder
            </Button>

            <a href={calendarIcsUrl} download="docvault-deadlines.ics">
              <Button variant="secondary" size="md" icon={Download}>
                Export Calendar (.ICS)
              </Button>
            </a>
          </div>
        </div>

        {error && (
          <div className="dv-deadlines-error" role="alert">
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="dv-deadlines-loading">
            <Skeleton height="70px" />
            <Skeleton height="70px" />
            <Skeleton height="70px" />
          </div>
        ) : deadlines.length === 0 ? (
          <EmptyState
            title="No upcoming policy deadlines"
            description="When you upload documents containing expiration dates, DocVault automatically creates tracked reminders."
            actionLabel="Upload Document to Schedule"
            onAction={() => window.location.href = "/upload"}
          />
        ) : (
          <div className="dv-deadlines-sections">
            {/* Urgent Deadlines Group */}
            {urgentDeadlines.length > 0 && (
              <div className="dv-deadline-group">
                <div className="dv-deadline-group-header">
                  <div className="dv-urgent-tag">Critical Attention Required</div>
                  <h3 className="dv-group-title">Expiring Within 15 Days or Overdue</h3>
                </div>

                <div className="dv-deadlines-list">
                  {urgentDeadlines.map((d) => {
                    const targetDocId = (d.linkedDocId && typeof d.linkedDocId === "object" && d.linkedDocId._id)
                      ? d.linkedDocId._id
                      : (typeof d.linkedDocId === "string" && d.linkedDocId)
                        ? d.linkedDocId
                        : d.documentId || d.docId || null;
                    const docTitle = (d.linkedDocId && typeof d.linkedDocId === "object" && d.linkedDocId.title)
                      ? d.linkedDocId.title
                      : "Document";

                    return (
                      <Card key={d._id} hover padding="md" className="dv-deadline-card dv-deadline-card--urgent">
                        <div className="dv-deadline-card__left">
                          <div className="dv-dicon-box dv-dicon-box--urgent">
                            <AlertTriangle size={18} />
                          </div>
                          <div className="dv-deadline-card__info">
                            <div className="dv-deadline-card__title-row">
                              <h4 className="dv-deadline-card__title">{d.title}</h4>
                              <ExpiryBadge expiryDate={d.date} daysLeft={d.daysLeft} size="sm" />
                            </div>
                            <p className="dv-deadline-card__action">{d.action || "Renewal required"}</p>
                            <span className="dv-deadline-card__date">
                              Due Date: <strong>{d.date || "Scheduled"}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="dv-deadline-card__right" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {/* Part C: Direct Renewal Link */}
                          {(() => {
                            const title = (d.title || "").toLowerCase();
                            let url = "https://www.google.com/search?q=" + encodeURIComponent((d.title || "") + " renewal portal India");
                            let label = "Renew Online";
                            if (title.includes("insurance") || title.includes("policy")) {
                              url = "https://www.policybazaar.com/";
                              label = "Renew Policy";
                            } else if (title.includes("passport")) {
                              url = "https://portal2.passportindia.gov.in/";
                              label = "Passport Seva";
                            } else if (title.includes("puc") || title.includes("license") || title.includes("driving") || title.includes("rc")) {
                              url = "https://parivahan.gov.in/";
                              label = "Parivahan";
                            }
                            return (
                              <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                                <Button variant="primary" size="sm" icon={ExternalLink}>
                                  {label}
                                </Button>
                              </a>
                            );
                          })()}
                          {targetDocId ? (
                            <Link to={`/documents/${targetDocId}`} style={{ textDecoration: "none" }}>
                              <Button variant="outline" size="sm" icon={FileText} title={`View ${docTitle}`}>
                                View Document
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={Plus}
                              onClick={() => {
                                setLinkModalDeadline(d);
                                setLinkTargetDocId("");
                              }}
                              title="Link a document to this renewal"
                            >
                              Link Document
                            </Button>
                          )}
                          <Button
                            variant={d.isCompleted ? "secondary" : "outline"}
                            size="sm"
                            icon={Check}
                            onClick={() => handleToggleComplete(d._id)}
                            title={d.isCompleted ? "Mark Incomplete" : "Mark Completed"}
                          >
                            {d.isCompleted ? "Done" : "Mark Done"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            onClick={() => handleDeleteReminder(d._id)}
                            title="Delete Reminder"
                          />
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Upcoming Normal Deadlines Group */}
            {regularDeadlines.length > 0 && (
              <div className="dv-deadline-group">
                <div className="dv-deadline-group-header">
                  <h3 className="dv-group-title">Upcoming Schedules</h3>
                </div>

                <div className="dv-deadlines-list">
                  {regularDeadlines.map((d) => {
                    const targetDocId = (d.linkedDocId && typeof d.linkedDocId === "object" && d.linkedDocId._id)
                      ? d.linkedDocId._id
                      : (typeof d.linkedDocId === "string" && d.linkedDocId)
                        ? d.linkedDocId
                        : d.documentId || d.docId || null;
                    const docTitle = (d.linkedDocId && typeof d.linkedDocId === "object" && d.linkedDocId.title)
                      ? d.linkedDocId.title
                      : "Document";

                    return (
                      <Card key={d._id} hover padding="md" className="dv-deadline-card">
                        <div className="dv-deadline-card__left">
                          <div className="dv-dicon-box dv-dicon-box--normal">
                            <Calendar size={18} />
                          </div>
                          <div className="dv-deadline-card__info">
                            <div className="dv-deadline-card__title-row">
                              <h4 className="dv-deadline-card__title">{d.title}</h4>
                              <ExpiryBadge expiryDate={d.date} daysLeft={d.daysLeft} size="sm" />
                            </div>
                            <p className="dv-deadline-card__action">{d.action || "Renewal scheduled"}</p>
                            <span className="dv-deadline-card__date">
                              Due Date: <strong>{d.date || "Scheduled"}</strong>
                            </span>
                          </div>
                        </div>

                        <div className="dv-deadline-card__right" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {targetDocId ? (
                            <Link to={`/documents/${targetDocId}`} style={{ textDecoration: "none" }}>
                              <Button variant="outline" size="sm" icon={FileText} title={`View ${docTitle}`}>
                                View Document
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={Plus}
                              onClick={() => {
                                setLinkModalDeadline(d);
                                setLinkTargetDocId("");
                              }}
                              title="Link a document to this renewal"
                            >
                              Link Document
                            </Button>
                          )}
                          <Button
                            variant={d.isCompleted ? "secondary" : "outline"}
                            size="sm"
                            icon={Check}
                            onClick={() => handleToggleComplete(d._id)}
                            title={d.isCompleted ? "Mark Incomplete" : "Mark Completed"}
                          >
                            {d.isCompleted ? "Done" : "Mark Done"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            onClick={() => handleDeleteReminder(d._id)}
                            title="Delete Reminder"
                          />
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Manual Reminder Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Reminder"
      >
        <form onSubmit={handleCreateReminder} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {modalError && (
            <div style={{ padding: "8px 12px", background: "rgba(220, 38, 38, 0.15)", border: "1px solid rgba(220, 38, 38, 0.3)", borderRadius: "8px", color: "#F87171", fontSize: "13px" }}>
              {modalError}
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#CBD5E1", marginBottom: "6px" }}>
              Reminder Title *
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Car Insurance Renewal, Electricity Bill, Society Maintenance"
              style={{ width: "100%", padding: "10px 12px", background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "8px", color: "#FFF", fontSize: "14px" }}
              required
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#CBD5E1", marginBottom: "6px" }}>
                Due Date *
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "8px", color: "#FFF", fontSize: "14px" }}
                required
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#CBD5E1", marginBottom: "6px" }}>
                Category
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "8px", color: "#FFF", fontSize: "14px" }}
              >
                <option value="Bill Due Date">Bill Due Date</option>
                <option value="Insurance Expiry">Insurance Expiry</option>
                <option value="Warranty Expiry">Warranty Expiry</option>
                <option value="Policy Renewal">Policy Renewal</option>
                <option value="RC Renewal">RC Renewal</option>
                <option value="PUC Expiry">PUC Expiry</option>
                <option value="Subscription Expiry">Subscription Expiry</option>
                <option value="Custom">Custom</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#CBD5E1", marginBottom: "6px" }}>
              Action / Notes (Optional)
            </label>
            <input
              type="text"
              value={newAction}
              onChange={(e) => setNewAction(e.target.value)}
              placeholder="e.g. Pay via netbanking, renew online before cutoff"
              style={{ width: "100%", padding: "10px 12px", background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "8px", color: "#FFF", fontSize: "14px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#CBD5E1", marginBottom: "6px" }}>
              Link Stored Document (Optional)
            </label>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "8px", color: "#FFF", fontSize: "14px" }}
            >
              <option value="">-- No Document Linked --</option>
              {availableDocs.map((doc) => (
                <option key={doc._id || doc.id} value={doc._id || doc.id}>
                  {doc.title || doc.name || doc.originalName || "Untitled"} ({doc.category || "General"})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
            <Button variant="ghost" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={submitting}>
              Save Reminder
            </Button>
          </div>
        </form>
      </Modal>

      {/* Link Document Modal for Existing Reminder */}
      <Modal
        isOpen={!!linkModalDeadline}
        onClose={() => setLinkModalDeadline(null)}
        title={`Link Document to ${linkModalDeadline?.title || "Reminder"}`}
      >
        <form onSubmit={handleLinkDocToDeadline} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <p style={{ fontSize: "13px", color: "#94A3B8", margin: 0, lineHeight: 1.5 }}>
            Select a stored vault document to associate with this renewal reminder so you can access and view it anytime.
          </p>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "#CBD5E1", marginBottom: "6px" }}>
              Choose Document *
            </label>
            <select
              value={linkTargetDocId}
              onChange={(e) => setLinkTargetDocId(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", background: "rgba(15, 23, 42, 0.8)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: "8px", color: "#FFF", fontSize: "14px" }}
              required
            >
              <option value="">-- Select Document --</option>
              {availableDocs.map((doc) => (
                <option key={doc._id || doc.id} value={doc._id || doc.id}>
                  {doc.title || doc.name || doc.originalName || "Untitled"} ({doc.category || "General"})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
            <Button variant="ghost" onClick={() => setLinkModalDeadline(null)}>
              Cancel
            </Button>
            <Button variant="primary" loading={linkingDoc}>
              Attach Document
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
