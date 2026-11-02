import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import {
  ArrowLeft,
  Layers,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Car,
  Home,
  User,
  Package,
  ShieldCheck,
  Plus,
  ExternalLink,
  ShieldAlert,
  HelpCircle,
  Link2,
  Trash2,
} from 'lucide-react';

import AppHeader from '../../components/layout/AppHeader/AppHeader';
import Card from '../../components/common/Card/Card';
import Button from '../../components/common/Button/Button';
import Badge from '../../components/common/Badge/Badge';
import Skeleton from '../../components/common/Skeleton/Skeleton';
import Modal from '../../components/common/Modal/Modal';

import './EntityDetailPage.css';

const TYPE_ICONS = {
  PERSON: User,
  VEHICLE: Car,
  PROPERTY: Home,
  PRODUCT: Package,
  INSURANCE_POLICY: ShieldCheck,
  OTHER: Layers,
};

export default function EntityDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [allUserDocs, setAllUserDocs] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [linking, setLinking] = useState(false);

  async function loadEntityDetail() {
    try {
      setLoading(true);
      setError(null);
      const res = await apiRequest(`/api/intelligence/entities/${id}`);
      if (res.success && res.data) {
        setDetail(res.data);
      } else {
        setError(res.error || 'Entity not found');
      }
    } catch (err) {
      setError(err.message || 'Error connecting to intelligence service');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntityDetail();
  }, [id]);

  async function handleOpenLinkModal() {
    setShowLinkModal(true);
    try {
      const res = await apiRequest('/api/documents');
      if (res.success && res.data) {
        setAllUserDocs(res.data);
      }
    } catch (err) {
      console.warn('Failed loading documents for link modal:', err.message);
    }
  }

  async function handleLinkDocument(e) {
    e.preventDefault();
    if (!selectedDocId) return;

    try {
      setLinking(true);
      const currentDocIds = (detail.entity.linkedDocumentIds || []).map(d => d._id || d);
      const updatedDocIds = [...new Set([...currentDocIds, selectedDocId])];

      const res = await apiRequest(`/api/intelligence/entities/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ linkedDocumentIds: updatedDocIds }),
      });

      if (res.success) {
        setShowLinkModal(false);
        setSelectedDocId('');
        await loadEntityDetail();
      } else {
        alert(res.error || 'Failed to link document');
      }
    } catch (err) {
      alert(err.message || 'Error linking document');
    } finally {
      setLinking(false);
    }
  }

  const entity = detail?.entity;
  const completeness = detail?.completeness;
  const relationships = detail?.relationships || [];
  const conflicts = detail?.conflicts || [];
  const linkedDocs = entity?.linkedDocumentIds || [];

  const Icon = TYPE_ICONS[entity?.entityType] || Layers;

  return (
    <div className="entity-detail-page">
      <AppHeader
        title={entity ? entity.name : 'Entity Profile'}
        subtitle={`Knowledge Graph profile & statutory completeness`}
        action={
          <Button variant="outline" size="sm" onClick={() => navigate('/intelligence/entities')}>
            <ArrowLeft size={16} />
            <span>Back to Entities</span>
          </Button>
        }
      />

      {loading ? (
        <div className="entity-detail-skeleton">
          <Skeleton height={200} />
          <Skeleton height={300} />
        </div>
      ) : error || !entity ? (
        <Card className="entity-error-card">
          <AlertTriangle size={28} className="dv-color-danger" />
          <div>
            <h3>Entity Not Available</h3>
            <p>{error || 'The requested entity could not be found or access is denied.'}</p>
            <Button size="sm" onClick={() => navigate('/intelligence/entities')} className="dv-mt-2">
              Return to Explorer
            </Button>
          </div>
        </Card>
      ) : (
        <div className="entity-detail-layout">
          {/* Main Entity Overview Card */}
          <Card className="entity-hero-card">
            <div className="hero-top">
              <div className="hero-icon-title">
                <div className={`hero-type-icon type-${entity.entityType.toLowerCase()}`}>
                  <Icon size={28} />
                </div>
                <div>
                  <h2 className="hero-name">{entity.name}</h2>
                  <div className="hero-badge-row">
                    <Badge variant="primary">{entity.entityType}</Badge>
                    <Badge variant="outline">{entity.status.toUpperCase()}</Badge>
                  </div>
                </div>
              </div>

              <Button size="sm" onClick={handleOpenLinkModal}>
                <Plus size={16} />
                <span>Link Document</span>
              </Button>
            </div>

            {/* Entity Attributes Table */}
            <div className="hero-attributes-grid">
              {entity.attributes && Object.entries(entity.attributes).map(([key, val]) => (
                <div key={key} className="hero-attr-item">
                  <span className="hero-attr-key">{key.replace(/([A-Z])/g, ' $1')}:</span>
                  <span className="hero-attr-val font-mono">{String(val)}</span>
                </div>
              ))}
              {entity.aliases && entity.aliases.length > 0 && (
                <div className="hero-attr-item">
                  <span className="hero-attr-key">Aliases:</span>
                  <span className="hero-attr-val">{entity.aliases.join(', ')}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Completeness Checklist Card */}
          {completeness?.hasTemplate && (
            <Card className="completeness-card">
              <div className="section-header">
                <div className="header-left">
                  <CheckCircle2 size={20} className="dv-color-primary" />
                  <h3>Document Completeness Checklist</h3>
                </div>
                <div className="completeness-score-badge">
                  <span className="score-num">{completeness.completenessScore}%</span>
                  <span className="score-label">Complete</span>
                </div>
              </div>

              <p className="completeness-desc">
                {completeness.description || 'Statutory and operational documents for this profile.'}
              </p>

              <div className="checklist-items-list">
                {completeness.items.map((item) => {
                  const isPresent = item.status === 'PRESENT';
                  const isExpired = item.status === 'EXPIRED';
                  const isExpiring = item.status === 'EXPIRING_SOON';
                  const isMissing = item.status === 'POTENTIALLY_MISSING';

                  return (
                    <div
                      key={item.requirementKey}
                      className={`checklist-row ${isPresent ? 'row-present' : isExpired ? 'row-expired' : 'row-missing'}`}
                    >
                      <div className="checklist-row-left">
                        {isPresent ? (
                          <CheckCircle2 size={18} className="dv-color-primary" />
                        ) : isExpired ? (
                          <AlertTriangle size={18} className="dv-color-danger" />
                        ) : (
                          <HelpCircle size={18} className="dv-color-warning" />
                        )}
                        <div>
                          <div className="checklist-row-title">
                            <span>{item.title}</span>
                            {item.isRequired && <span className="req-pill">Required</span>}
                          </div>
                          <span className="checklist-row-desc">{item.description}</span>
                        </div>
                      </div>

                      <div className="checklist-row-right">
                        {isPresent && item.matchedDocument && (
                          <div className="matched-doc-info">
                            <Badge variant="success">Verified in DocVault</Badge>
                            <Link to={`/documents/${item.matchedDocument.documentId}`} className="doc-link-btn">
                              <span>{item.matchedDocument.title}</span>
                              <ExternalLink size={12} />
                            </Link>
                          </div>
                        )}
                        {isExpired && item.matchedDocument && (
                          <div className="matched-doc-info">
                            <Badge variant="danger">Expired ({item.matchedDocument.expiryDate})</Badge>
                            <Button size="xs" variant="outline" onClick={() => navigate('/upload')}>
                              Upload Renewal
                            </Button>
                          </div>
                        )}
                        {isExpiring && item.matchedDocument && (
                          <div className="matched-doc-info">
                            <Badge variant="warning">Expires in {item.matchedDocument.daysLeft}d</Badge>
                            <Link to={`/documents/${item.matchedDocument.documentId}`} className="doc-link-btn">
                              <span>View Doc</span>
                            </Link>
                          </div>
                        )}
                        {isMissing && (
                          <div className="matched-doc-info">
                            <Badge variant="outline">Not found in DocVault</Badge>
                            <Button size="xs" onClick={() => navigate('/upload')}>
                              Upload Now
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Connected Graph Relationships */}
          <Card className="relationships-card">
            <div className="section-header">
              <div className="header-left">
                <Layers size={20} className="dv-color-primary" />
                <h3>Knowledge Graph Relationships ({relationships.length})</h3>
              </div>
            </div>

            {relationships.length === 0 ? (
              <p className="empty-subtext">No relationship edges connected to this entity yet.</p>
            ) : (
              <div className="relationship-edge-list">
                {relationships.map((rel) => {
                  const isFrom = rel.fromEntityId?._id?.toString() === entity._id.toString();
                  const targetName = isFrom ? rel.toEntityId?.name : rel.fromEntityId?.name;
                  const targetType = isFrom ? rel.toEntityId?.entityType : rel.fromEntityId?.entityType;
                  const targetId = isFrom ? rel.toEntityId?._id : rel.fromEntityId?._id;

                  return (
                    <div key={rel._id} className="relationship-edge-row">
                      <div className="edge-endpoints">
                        <span className="edge-this">{entity.name}</span>
                        <span className="edge-type-pill">{rel.relationshipType}</span>
                        <Link to={`/intelligence/entities/${targetId}`} className="edge-target">
                          {targetName} ({targetType})
                        </Link>
                      </div>

                      <div className="edge-meta">
                        <Badge variant={rel.verificationStatus === 'confirmed' ? 'success' : 'outline'}>
                          {rel.verificationStatus}
                        </Badge>
                        {rel.sourceDocumentId && (
                          <Link to={`/documents/${rel.sourceDocumentId._id}`} className="doc-evidence-link">
                            <FileText size={12} />
                            <span>Source Doc</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Linked Documents List */}
          <Card className="linked-docs-card">
            <div className="section-header">
              <div className="header-left">
                <FileText size={20} className="dv-color-primary" />
                <h3>Linked Documents ({linkedDocs.length})</h3>
              </div>
            </div>

            {linkedDocs.length === 0 ? (
              <p className="empty-subtext">No documents explicitly linked to this entity profile.</p>
            ) : (
              <div className="linked-docs-list">
                {linkedDocs.map((doc) => (
                  <div key={doc._id} className="linked-doc-row">
                    <div className="linked-doc-info">
                      <FileText size={18} className="dv-color-primary" />
                      <div>
                        <Link to={`/documents/${doc._id}`} className="linked-doc-title">
                          {doc.title || doc.originalName}
                        </Link>
                        <span className="linked-doc-cat">{doc.category}</span>
                      </div>
                    </div>

                    <div className="linked-doc-actions">
                      {doc.expiryDate && (
                        <span className="linked-doc-expiry font-mono">
                          Expires: {doc.expiryDate}
                        </span>
                      )}
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => navigate(`/documents/${doc._id}`)}
                      >
                        <ExternalLink size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Open Conflicts on this entity if any */}
          {conflicts && conflicts.length > 0 && (
            <Card className="conflicts-card">
              <div className="section-header">
                <div className="header-left">
                  <ShieldAlert size={20} className="dv-color-warning" />
                  <h3>Information Discrepancies ({conflicts.length})</h3>
                </div>
              </div>

              <div className="conflicts-list">
                {conflicts.map((c) => (
                  <div key={c._id} className="conflict-box">
                    <div className="conflict-box-header">
                      <span className="conflict-field-name">Field: {c.fieldName}</span>
                      <Badge variant="warning">OPEN CONFLICT</Badge>
                    </div>
                    <div className="conflict-values-grid">
                      <div className="conflict-side">
                        <span className="side-label">Document A ({c.documentAId?.title}):</span>
                        <span className="side-val font-mono">{String(c.factAValue)}</span>
                      </div>
                      <div className="conflict-side">
                        <span className="side-label">Document B ({c.documentBId?.title}):</span>
                        <span className="side-val font-mono">{String(c.factBValue)}</span>
                      </div>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => navigate('/intelligence/conflicts')}
                      className="dv-mt-2"
                    >
                      Resolve in Conflict Resolver
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Link Document Modal */}
      {showLinkModal && (
        <Modal
          isOpen={showLinkModal}
          onClose={() => setShowLinkModal(false)}
          title={`Link Document to ${entity?.name}`}
        >
          <form onSubmit={handleLinkDocument} className="link-doc-form">
            <p className="modal-desc">
              Select a stored vault document to link to this entity profile and update its Knowledge Graph.
            </p>

            <div className="form-group">
              <label>Select Document</label>
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                className="dv-select-input"
                required
              >
                <option value="">-- Choose a document --</option>
                {allUserDocs.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.title} ({d.category})
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={() => setShowLinkModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={linking || !selectedDocId}>
                {linking ? 'Linking...' : 'Link to Entity'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
