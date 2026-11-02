import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import {
  Activity,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ShieldAlert,
  HelpCircle,
  FileText,
  Filter,
  Check,
  X,
  Layers,
} from 'lucide-react';

import AppHeader from '../../components/layout/AppHeader/AppHeader';
import Card from '../../components/common/Card/Card';
import Button from '../../components/common/Button/Button';
import Badge from '../../components/common/Badge/Badge';
import Skeleton from '../../components/common/Skeleton/Skeleton';
import EmptyState from '../../components/common/EmptyState/EmptyState';

import './AlertsCenterPage.css';

export default function AlertsCenterPage() {
  const navigate = useNavigate();

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [actioningId, setActioningId] = useState(null);

  async function loadAlerts() {
    try {
      setLoading(true);
      const res = await apiRequest(`/api/intelligence/alerts?status=${statusFilter}`);
      if (res.success && res.data) {
        setAlerts(res.data);
      }
    } catch (err) {
      console.warn('Failed loading alerts:', err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts();
  }, [statusFilter]);

  async function handleAlertAction(alertId, action) {
    try {
      setActioningId(alertId);
      const res = await apiRequest(`/api/intelligence/alerts/${alertId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });

      if (res.success) {
        // Remove or update in list
        setAlerts((prev) => prev.filter((a) => a._id !== alertId));
      } else {
        alert(res.error || 'Failed to update alert');
      }
    } catch (err) {
      alert('Error updating alert: ' + err.message);
    } finally {
      setActioningId(null);
    }
  }

  return (
    <div className="alerts-center-page">
      <AppHeader
        title="Proactive Alerts Centre"
        subtitle="Automated alerts for expirations, missing paperwork, and conflicting information"
      />

      {/* Status Filter Tabs */}
      <div className="alerts-filter-bar">
        <div className="filter-tab-group">
          <button
            className={`filter-tab-pill ${statusFilter === 'ACTIVE' ? 'active' : ''}`}
            onClick={() => setStatusFilter('ACTIVE')}
          >
            Active Alerts
          </button>
          <button
            className={`filter-tab-pill ${statusFilter === 'DISMISSED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('DISMISSED')}
          >
            Dismissed
          </button>
          <button
            className={`filter-tab-pill ${statusFilter === 'RESOLVED' ? 'active' : ''}`}
            onClick={() => setStatusFilter('RESOLVED')}
          >
            Resolved History
          </button>
        </div>
      </div>

      {/* Alerts List */}
      {loading ? (
        <div className="alerts-skeleton-list">
          <Skeleton height={100} />
          <Skeleton height={100} />
          <Skeleton height={100} />
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={statusFilter === 'ACTIVE' ? 'All Clear! No Active Alerts' : 'No alerts in this view'}
          description={
            statusFilter === 'ACTIVE'
              ? 'Your vault is healthy. No approaching expirations, missing statutory files, or conflicts detected.'
              : 'You have no alerts matching this filter status.'
          }
          action={
            <Button size="sm" onClick={() => navigate('/intelligence')}>
              <span>View Intelligence Overview</span>
            </Button>
          }
        />
      ) : (
        <div className="alerts-list">
          {alerts.map((alert) => {
            const isCritical = alert.severity === 'critical';
            const isWarning = alert.severity === 'warning';

            return (
              <Card
                key={alert._id}
                className={`alert-card ${isCritical ? 'border-critical' : isWarning ? 'border-warning' : ''}`}
              >
                <div className="alert-card-left">
                  <div className={`alert-severity-icon icon-${alert.severity}`}>
                    {isCritical ? (
                      <AlertTriangle size={22} />
                    ) : isWarning ? (
                      <Clock size={22} />
                    ) : (
                      <Activity size={22} />
                    )}
                  </div>

                  <div className="alert-body">
                    <div className="alert-header-row">
                      <h4 className="alert-title">{alert.title}</h4>
                      <Badge
                        variant={isCritical ? 'danger' : isWarning ? 'warning' : 'outline'}
                      >
                        {alert.severity.toUpperCase()}
                      </Badge>
                      <span className="alert-type-tag">{alert.alertType.replace(/_/g, ' ')}</span>
                    </div>

                    <p className="alert-message">{alert.message}</p>

                    {/* Linked metadata references */}
                    <div className="alert-references">
                      {alert.relatedDocumentIds && alert.relatedDocumentIds.map((doc) => (
                        <Link
                          key={doc._id}
                          to={`/documents/${doc._id}`}
                          className="alert-doc-pill"
                        >
                          <FileText size={12} />
                          <span>{doc.title || 'Related Document'}</span>
                        </Link>
                      ))}
                      {alert.relatedEntityIds && alert.relatedEntityIds.map((ent) => (
                        <Link
                          key={ent._id}
                          to={`/intelligence/entities/${ent._id}`}
                          className="alert-entity-pill"
                        >
                          <Layers size={12} />
                          <span>{ent.name}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="alert-card-actions">
                  {alert.actionUrl && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => navigate(alert.actionUrl)}
                    >
                      <span>{alert.actionLabel || 'Take Action'}</span>
                      <ExternalLink size={14} />
                    </Button>
                  )}

                  {statusFilter === 'ACTIVE' && (
                    <div className="alert-button-group">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actioningId === alert._id}
                        onClick={() => handleAlertAction(alert._id, 'resolve')}
                      >
                        <Check size={14} />
                        <span>Resolve</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={actioningId === alert._id}
                        onClick={() => handleAlertAction(alert._id, 'dismiss')}
                      >
                        <X size={14} />
                        <span>Dismiss</span>
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

