import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import {
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Layers,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Check,
  Edit3,
} from 'lucide-react';

import AppHeader from '../../components/layout/AppHeader/AppHeader';
import Card from '../../components/common/Card/Card';
import Button from '../../components/common/Button/Button';
import Badge from '../../components/common/Badge/Badge';
import Skeleton from '../../components/common/Skeleton/Skeleton';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import Modal from '../../components/common/Modal/Modal';

import './ConflictsCenterPage.css';

export default function ConflictsCenterPage() {
  const navigate = useNavigate();

  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConflict, setSelectedConflict] = useState(null);
  const [resolutionChoice, setResolutionChoice] = useState('KEEP_A');
  const [manualValue, setManualValue] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolving, setResolving] = useState(false);

  async function loadConflicts() {
    try {
      setLoading(true);
      const res = await apiRequest('/api/intelligence/conflicts?status=OPEN');
      if (res.success && res.data) {
        setConflicts(res.data.conflicts || []);
      }
    } catch (err) {
      console.warn('Failed loading conflicts:', err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConflicts();
  }, []);

  function handleOpenResolutionModal(conflict) {
    setSelectedConflict(conflict);
    setResolutionChoice('KEEP_A');
    setManualValue('');
    setResolutionNotes('');
  }

  async function handleResolveSubmit(e) {
    e.preventDefault();
    if (!selectedConflict) return;

    try {
      setResolving(true);
      const res = await apiRequest(`/api/intelligence/conflicts/${selectedConflict._id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          resolution: resolutionChoice,
          manualValue: resolutionChoice === 'MANUAL_OVERRIDE' ? manualValue : undefined,
          notes: resolutionNotes || undefined,
        }),
      });

      if (res.success) {
        setSelectedConflict(null);
        await loadConflicts();
      } else {
        alert(res.error || 'Failed to resolve conflict');
      }
    } catch (err) {
      alert('Error resolving conflict: ' + err.message);
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="conflicts-center-page">
      <AppHeader
        title="Conflict Detection & Resolver"
        subtitle="Cross-document fact comparison with non-destructive audit resolution"
        action={
          <Button variant="outline" size="sm" onClick={() => navigate('/intelligence')}>
            <span>Back to Intelligence</span>
          </Button>
        }
      />

      {loading ? (
        <div className="conflicts-skeleton-list">
          <Skeleton height={140} />
          <Skeleton height={140} />
        </div>
      ) : conflicts.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Zero Conflicts Detected"
          description="All facts extracted across your connected documents and entities are mutually consistent."
          action={
            <Button size="sm" onClick={() => navigate('/intelligence')}>
              <span>View Knowledge Graph</span>
            </Button>
          }
        />
      ) : (
        <div className="conflicts-list">
          {conflicts.map((c) => (
            <Card key={c._id} className="conflict-card">
              <div className="conflict-card-header">
                <div className="conflict-field-badge">
                  <AlertTriangle size={18} className="dv-color-warning" />
                  <div>
                    <h4 className="conflict-title">Discrepancy on "{c.fieldName}"</h4>
                    <span className="conflict-entity-tag">
                      Entity: {c.entityId?.name || 'Linked Profile'}
                    </span>
                  </div>
                </div>
                <Badge variant="warning">OPEN CONFLICT</Badge>
              </div>

              <div className="conflict-comparison-columns">
                {/* Document A */}
                <div className="comparison-column col-a">
                  <span className="column-label">Source Document A</span>
                  <Link to={`/documents/${c.documentAId?._id}`} className="column-doc-title">
                    <FileText size={14} />
                    <span>{c.documentAId?.title || 'Document A'}</span>
                  </Link>
                  <div className="fact-value-box font-mono">
                    {String(c.factAValue)}
                  </div>
                </div>

                <div className="comparison-divider">VS</div>

                {/* Document B */}
                <div className="comparison-column col-b">
                  <span className="column-label">Source Document B</span>
                  <Link to={`/documents/${c.documentBId?._id}`} className="column-doc-title">
                    <FileText size={14} />
                    <span>{c.documentBId?.title || 'Document B'}</span>
                  </Link>
                  <div className="fact-value-box font-mono">
                    {String(c.factBValue)}
                  </div>
                </div>
              </div>

              <div className="conflict-card-footer">
                <p className="conflict-helper-text">
                  Choose which value is verified, or provide an override without destroying historical audit evidence.
                </p>
                <Button size="sm" onClick={() => handleOpenResolutionModal(c)}>
                  <Edit3 size={14} />
                  <span>Resolve Discrepancy</span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Resolution Modal */}
      {selectedConflict && (
        <Modal
          isOpen={Boolean(selectedConflict)}
          onClose={() => setSelectedConflict(null)}
          title={`Resolve Discrepancy: ${selectedConflict.fieldName}`}
        >
          <form onSubmit={handleResolveSubmit} className="resolution-form">
            <p className="resolution-modal-desc">
              Select the authentic verified value for <strong>{selectedConflict.fieldName}</strong>:
            </p>

            <div className="resolution-choices">
              <label className={`choice-label ${resolutionChoice === 'KEEP_A' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="resolution"
                  value="KEEP_A"
                  checked={resolutionChoice === 'KEEP_A'}
                  onChange={() => setResolutionChoice('KEEP_A')}
                />
                <div>
                  <span className="choice-title">Keep Document A's Value</span>
                  <span className="choice-val font-mono">{String(selectedConflict.factAValue)}</span>
                </div>
              </label>

              <label className={`choice-label ${resolutionChoice === 'KEEP_B' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="resolution"
                  value="KEEP_B"
                  checked={resolutionChoice === 'KEEP_B'}
                  onChange={() => setResolutionChoice('KEEP_B')}
                />
                <div>
                  <span className="choice-title">Keep Document B's Value</span>
                  <span className="choice-val font-mono">{String(selectedConflict.factBValue)}</span>
                </div>
              </label>

              <label className={`choice-label ${resolutionChoice === 'MANUAL_OVERRIDE' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="resolution"
                  value="MANUAL_OVERRIDE"
                  checked={resolutionChoice === 'MANUAL_OVERRIDE'}
                  onChange={() => setResolutionChoice('MANUAL_OVERRIDE')}
                />
                <div>
                  <span className="choice-title">Enter Verified Manual Value</span>
                </div>
              </label>
            </div>

            {resolutionChoice === 'MANUAL_OVERRIDE' && (
              <div className="form-group dv-mt-3">
                <label>Verified True Value</label>
                <input
                  type="text"
                  placeholder="Enter the verified value..."
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  required
                  className="dv-text-input font-mono"
                />
              </div>
            )}

            <div className="form-group dv-mt-3">
              <label>Resolution Notes / Audit Justification (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Verified physically against smart card chip"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                className="dv-text-input"
              />
            </div>

            <div className="modal-actions">
              <Button type="button" variant="ghost" onClick={() => setSelectedConflict(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={resolving}>
                {resolving ? 'Saving...' : 'Apply Resolution'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
