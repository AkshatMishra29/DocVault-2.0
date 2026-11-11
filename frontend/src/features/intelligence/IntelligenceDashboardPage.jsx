import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import {
  Activity,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Layers,
  FileText,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Car,
  Home,
  User,
  Package,
  FileCheck2,
} from 'lucide-react';

import AppHeader from '../../components/layout/AppHeader/AppHeader';
import Card from '../../components/common/Card/Card';
import Button from '../../components/common/Button/Button';
import Badge from '../../components/common/Badge/Badge';
import Skeleton from '../../components/common/Skeleton/Skeleton';

import './IntelligenceDashboardPage.css';

export default function IntelligenceDashboardPage() {
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState(null);

  async function loadSummary() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest('/api/intelligence/summary');
      if (res.success && res.data) {
        setSummary(res.data);
      } else {
        setError(res.error || 'Failed to load intelligence summary');
      }
    } catch (err) {
      setError(err.message || 'Error connecting to intelligence service');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  async function handleReEvaluate() {
    try {
      setEvaluating(true);
      const res = await apiRequest('/api/intelligence/evaluate', { method: 'POST' });
      if (res.success) {
        await loadSummary();
      } else {
        alert(res.error || 'Evaluation failed');
      }
    } catch (err) {
      alert('Error evaluating vault events: ' + err.message);
    } finally {
      setEvaluating(false);
    }
  }

  const health = summary?.health || {};
  const counts = health?.counts || {};
  const alerts = summary?.alerts || {};
  const graph = summary?.graph || {};
  const conflicts = summary?.conflicts || {};

  return (
    <div className="intelligence-dashboard-page">
      <AppHeader
        title="Document Intelligence"
        subtitle="Deterministic document health, knowledge graph ontology, and proactive vault reasoning."
      />

      <div className="intelligence-content">
        {/* Apple Zen 3D Intelligence Command Hero */}
        <div className="dv-intel-hero">
          <div className="dv-intel-hero__info">
            <div className="dv-intel-hero__kicker">
              <span className="dv-intel-hero__kicker-dot" />
              <span>Vault Reasoning Active</span>
            </div>
            <h2 className="dv-intel-hero__title">
              Autonomous Document <span className="dv-intel-hero__title-accent">Intelligence</span>
            </h2>
            <p className="dv-intel-hero__desc">
              Continuously evaluates policy health, maps your personal knowledge graph, and identifies conflicting clauses across documents.
            </p>
          </div>

          <div className="dv-intel-hero__actions">
            <Button
              variant="primary"
              size="md"
              onClick={handleReEvaluate}
              disabled={evaluating || loading}
            >
              <RefreshCw size={16} className={evaluating ? 'dv-spin' : ''} />
              <span>{evaluating ? 'Analyzing Vault...' : 'Sync & Re-evaluate'}</span>
            </Button>
            <Link to="/intelligence/entities">
              <Button variant="outline" size="md" icon={Layers}>
                Explore Graph
              </Button>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="intelligence-skeleton-grid">
            <Skeleton height={140} />
            <Skeleton height={140} />
            <Skeleton height={140} />
            <Skeleton height={140} />
          </div>
        ) : error ? (
          <Card className="intelligence-error-card">
            <AlertCircle size={28} className="dv-color-danger" />
            <div>
              <h3>Intelligence Engine Offline</h3>
              <p>{error}</p>
              <Button size="sm" onClick={loadSummary} className="dv-mt-2">
                Retry
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {/* Health Metrics Ribbon */}
            <div className="intelligence-stat-grid">
              <Card className="stat-card stat-valid">
                <div className="stat-icon-wrap">
                  <CheckCircle2 size={24} />
                </div>
                <div className="stat-body">
                  <span className="stat-value">{counts.VALID || 0}</span>
                  <span className="stat-label">Valid Documents</span>
                  <span className="stat-sub">100% compliant</span>
                </div>
              </Card>

              <Card className="stat-card stat-expiring">
                <div className="stat-icon-wrap">
                  <Clock size={24} />
                </div>
                <div className="stat-body">
                  <span className="stat-value">{counts.EXPIRING_SOON || 0}</span>
                  <span className="stat-label">Expiring Soon (30d)</span>
                  <span className="stat-sub">Action required</span>
                </div>
              </Card>

              <Card className="stat-card stat-expired">
                <div className="stat-icon-wrap">
                  <AlertTriangle size={24} />
                </div>
                <div className="stat-body">
                  <span className="stat-value">{counts.EXPIRED || 0}</span>
                  <span className="stat-label">Expired Documents</span>
                  <span className="stat-sub">Renewal needed</span>
                </div>
              </Card>

              <Card className="stat-card stat-conflicts">
                <div className="stat-icon-wrap">
                  <AlertCircle size={24} />
                </div>
                <div className="stat-body">
                  <span className="stat-value">{conflicts.totalOpen || 0}</span>
                  <span className="stat-label">Open Conflicts</span>
                  <span className="stat-sub">Data discrepancies</span>
                </div>
              </Card>
            </div>

            {/* Quick Actions Navigation Banner */}
            <div className="intelligence-nav-cards">
              <Link to="/intelligence/entities" className="nav-card-tile">
                <div className="nav-card-header">
                  <div className="nav-tile-icon icon-graph">
                    <Layers size={22} />
                  </div>
                  <span className="nav-tile-pill">{graph.totalEntities || 0} Entities</span>
                </div>
                <h3>Knowledge Graph</h3>
                <p>Explore connected People, Vehicles, Real Estate, and Policies with 1-click traversal.</p>
                <div className="nav-tile-footer">
                  <span>Explore Entities</span>
                  <ArrowRight size={16} />
                </div>
              </Link>

              <Link to="/intelligence/alerts" className="nav-card-tile">
                <div className="nav-card-header">
                  <div className="nav-tile-icon icon-alerts">
                    <Activity size={22} />
                  </div>
                  <span className="nav-tile-pill pill-alert">{alerts.totalActive || 0} Active</span>
                </div>
                <h3>Alerts Centre</h3>
                <p>Actionable alerts for expirations, missing statutory paperwork, and contradictory data.</p>
                <div className="nav-tile-footer">
                  <span>View All Alerts</span>
                  <ArrowRight size={16} />
                </div>
              </Link>

              <Link to="/intelligence/conflicts" className="nav-card-tile">
                <div className="nav-card-header">
                  <div className="nav-tile-icon icon-conflicts">
                    <FileCheck2 size={22} />
                  </div>
                  <span className="nav-tile-pill pill-conflicts">{conflicts.totalOpen || 0} Discrepancies</span>
                </div>
                <h3>Conflict Resolver</h3>
                <p>Compare conflicting facts across uploaded documents and resolve without deleting history.</p>
                <div className="nav-tile-footer">
                  <span>Resolve Conflicts</span>
                  <ArrowRight size={16} />
                </div>
              </Link>
            </div>

            {/* Expiring Soon & Expired Documents List */}
            {health.expiringSoon && health.expiringSoon.length > 0 && (
              <Card className="dashboard-section-card">
                <div className="section-card-header">
                  <div className="section-header-title">
                    <Clock size={20} className="dv-color-warning" />
                    <h3>Expiring Soon (Action Required)</h3>
                  </div>
                  <Link to="/deadlines" className="section-header-link">
                    View in Deadlines <ChevronRight size={16} />
                  </Link>
                </div>
                <div className="expiring-doc-list">
                  {health.expiringSoon.map((item) => (
                    <div key={item._id} className="expiring-doc-item">
                      <div className="expiring-doc-left">
                        <FileText size={18} className="dv-color-primary" />
                        <div>
                          <Link to={`/documents/${item._id}`} className="expiring-doc-title">
                            {item.title}
                          </Link>
                          <span className="expiring-doc-cat">{item.category}</span>
                        </div>
                      </div>
                      <div className="expiring-doc-right">
                        <Badge variant="warning">
                          Expires in {item.health.daysLeft} days ({item.expiryDate})
                        </Badge>
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => navigate(`/documents/${item._id}`)}
                        >
                          <ExternalLink size={14} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Expired Documents Banner if any */}
            {health.expired && health.expired.length > 0 && (
              <Card className="dashboard-section-card card-border-danger">
                <div className="section-card-header">
                  <div className="section-header-title">
                    <AlertTriangle size={20} className="dv-color-danger" />
                    <h3>Expired Paperwork ({health.expired.length})</h3>
                  </div>
                </div>
                <div className="expiring-doc-list">
                  {health.expired.slice(0, 5).map((item) => (
                    <div key={item._id} className="expiring-doc-item">
                      <div className="expiring-doc-left">
                        <FileText size={18} className="dv-color-danger" />
                        <div>
                          <Link to={`/documents/${item._id}`} className="expiring-doc-title">
                            {item.title}
                          </Link>
                          <span className="expiring-doc-cat">{item.category}</span>
                        </div>
                      </div>
                      <div className="expiring-doc-right">
                        <Badge variant="danger">
                          Expired on {item.expiryDate}
                        </Badge>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => navigate(`/upload`)}
                        >
                          Upload Renewal
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Knowledge Graph Breakdown */}
            <Card className="dashboard-section-card">
              <div className="section-card-header">
                <div className="section-header-title">
                  <Layers size={20} className="dv-color-primary" />
                  <h3>Knowledge Graph Entities</h3>
                </div>
                <Link to="/intelligence/entities" className="section-header-link">
                  Open Entity Explorer <ChevronRight size={16} />
                </Link>
              </div>

              <div className="entity-type-chips">
                <div className="entity-chip">
                  <User size={16} />
                  <span className="chip-label">People:</span>
                  <span className="chip-count">{graph.typeCounts?.PERSON || 0}</span>
                </div>
                <div className="entity-chip">
                  <Car size={16} />
                  <span className="chip-label">Vehicles:</span>
                  <span className="chip-count">{graph.typeCounts?.VEHICLE || 0}</span>
                </div>
                <div className="entity-chip">
                  <Home size={16} />
                  <span className="chip-label">Properties:</span>
                  <span className="chip-count">{graph.typeCounts?.PROPERTY || 0}</span>
                </div>
                <div className="entity-chip">
                  <Package size={16} />
                  <span className="chip-label">Products:</span>
                  <span className="chip-count">{graph.typeCounts?.PRODUCT || 0}</span>
                </div>
                <div className="entity-chip">
                  <ShieldCheck size={16} />
                  <span className="chip-label">Policies:</span>
                  <span className="chip-count">{graph.typeCounts?.INSURANCE_POLICY || 0}</span>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

