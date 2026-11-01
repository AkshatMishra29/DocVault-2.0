import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiRequest, API_BASE_URL } from "../../services/api";
import { Calendar, Download, AlertTriangle, Clock, CheckCircle2, FileText, ChevronRight, ArrowRight } from "lucide-react";

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

  useEffect(() => {
    fetchDeadlines();
  }, []);

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
        title="Renewal & Expiry Deadlines"
        subtitle="Automated countdown schedules derived from policy and warranty expiration dates."
      />

      <div className="dv-deadlines-content">
        <div className="dv-deadlines-toolbar">
          <div className="dv-deadlines-count">
            <strong>{deadlines.length}</strong> Tracked Policy & Renewal Deadline(s)
          </div>

          <a href={calendarIcsUrl} download="docvault-deadlines.ics">
            <Button variant="secondary" size="md" icon={Download}>
              Export to Apple / Google Calendar (.ICS)
            </Button>
          </a>
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
                    const linkedDoc = d.linkedDocId;
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

                        {linkedDoc && typeof linkedDoc === "object" && linkedDoc._id && (
                          <div className="dv-deadline-card__right">
                            <Link to={`/documents/${linkedDoc._id}`}>
                              <Button variant="outline" size="sm" icon={FileText}>
                                View Policy
                              </Button>
                            </Link>
                          </div>
                        )}
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
                    const linkedDoc = d.linkedDocId;
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

                        {linkedDoc && typeof linkedDoc === "object" && linkedDoc._id && (
                          <div className="dv-deadline-card__right">
                            <Link to={`/documents/${linkedDoc._id}`}>
                              <Button variant="ghost" size="sm" icon={FileText}>
                                View Policy
                              </Button>
                            </Link>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
