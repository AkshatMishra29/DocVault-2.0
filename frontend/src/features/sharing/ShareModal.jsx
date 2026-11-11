import React, { useState, useEffect } from 'react';
import { Lock, Users, UserCheck, UserX, X, Shield, Calendar, Download, Eye } from 'lucide-react';
import { sharingService } from '../../services/sharing.service';
import './ShareModal.css';

export default function ShareModal({ documentId, documentTitle, isOpen, onClose, onSaved }) {
  const [audienceMode, setAudienceMode] = useState('ONLY_ME');
  const [mutualConnections, setMutualConnections] = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [excludedUserIds, setExcludedUserIds] = useState([]);
  const [canView, setCanView] = useState(true);
  const [canDownload, setCanDownload] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && documentId) {
      loadData();
    }
  }, [isOpen, documentId]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [connRes, shareRes] = await Promise.all([
        sharingService.getConnections(),
        sharingService.getDocumentSharing(documentId),
      ]);

      if (connRes.success) {
        setMutualConnections(connRes.data || []);
      }

      if (shareRes.success && shareRes.data?.policy) {
        const p = shareRes.data.policy;
        setAudienceMode(p.audienceMode || 'ONLY_ME');
        setCanView(p.permissions?.view !== false);
        setCanDownload(Boolean(p.permissions?.download));
        setSelectedUserIds((p.selectedUserIds || []).map((id) => (typeof id === 'object' ? id._id : id)));
        setExcludedUserIds((p.excludedUserIds || []).map((id) => (typeof id === 'object' ? id._id : id)));
        if (p.expiresAt) {
          setExpiresAt(new Date(p.expiresAt).toISOString().split('T')[0]);
        } else {
          setExpiresAt('');
        }
      }
    } catch (err) {
      setError('Failed to load sharing settings.');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectUser = (userId) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const toggleExcludeUser = (userId) => {
    if (excludedUserIds.includes(userId)) {
      setExcludedUserIds(excludedUserIds.filter((id) => id !== userId));
    } else {
      setExcludedUserIds([...excludedUserIds, userId]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await sharingService.setDocumentPolicy({
        documentId,
        audienceMode,
        selectedUserIds,
        excludedUserIds,
        permissions: {
          view: canView,
          download: canDownload,
        },
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });

      if (res.success) {
        if (onSaved) onSaved();
        onClose();
      } else {
        setError(res.error || 'Failed to update sharing.');
      }
    } catch (err) {
      setError(err.message || 'Error saving sharing settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="share-modal-backdrop" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="share-modal__header">
          <div className="share-modal__title">Share "{documentTitle}"</div>
          <button className="btn-sm btn-outline" onClick={onClose} style={{ border: 'none' }}>
            <X size={18} />
          </button>
        </div>

        <div className="share-modal__body">
          {error && (
            <div style={{ padding: '0.6rem 0.8rem', background: '#ffebee', color: '#c62828', borderRadius: '6px', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}

          {/* STEP 1: Audience Selector (WhatsApp-Style) */}
          <div>
            <div className="section-label">1. Who can see this document?</div>
            <div className="audience-options">
              {/* Option A: ONLY ME */}
              <div
                className={`audience-card ${audienceMode === 'ONLY_ME' ? 'audience-card--selected' : ''}`}
                onClick={() => setAudienceMode('ONLY_ME')}
              >
                <div className="audience-card__icon"><Lock size={18} /></div>
                <div>
                  <div className="audience-card__title">Only Me (Private)</div>
                  <div className="audience-card__sub">Only you have access to this document</div>
                </div>
              </div>

              {/* Option B: ALL MUTUAL CONNECTIONS */}
              <div
                className={`audience-card ${audienceMode === 'ALL_CONNECTIONS' ? 'audience-card--selected' : ''}`}
                onClick={() => setAudienceMode('ALL_CONNECTIONS')}
              >
                <div className="audience-card__icon"><Users size={18} /></div>
                <div>
                  <div className="audience-card__title">All Mutual Connections</div>
                  <div className="audience-card__sub">Share with all {mutualConnections.length} current connections</div>
                </div>
              </div>

              {/* Option C: SELECTED PEOPLE */}
              <div
                className={`audience-card ${audienceMode === 'SELECTED' ? 'audience-card--selected' : ''}`}
                onClick={() => setAudienceMode('SELECTED')}
              >
                <div className="audience-card__icon"><UserCheck size={18} /></div>
                <div>
                  <div className="audience-card__title">Selected People...</div>
                  <div className="audience-card__sub">Only share with specific connections</div>
                </div>
              </div>

              {/* Option D: ALL EXCEPT */}
              <div
                className={`audience-card ${audienceMode === 'ALL_EXCEPT' ? 'audience-card--selected' : ''}`}
                onClick={() => setAudienceMode('ALL_EXCEPT')}
              >
                <div className="audience-card__icon"><UserX size={18} /></div>
                <div>
                  <div className="audience-card__title">All Connections Except...</div>
                  <div className="audience-card__sub">Share with everyone except specific people</div>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-picker: Selected or Excluded friends */}
          {audienceMode === 'SELECTED' && (
            <div>
              <div className="section-label">Select Recipients ({selectedUserIds.length} selected)</div>
              {mutualConnections.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: '#5b738b', padding: '0.5rem 0' }}>
                  No connections available. Add connections from the Connections page first.
                </div>
              ) : (
                <div className="friend-selector">
                  {mutualConnections.map((user) => (
                    <label key={user.id} className="friend-item">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => toggleSelectUser(user.id)}
                      />
                      <div className="friend-avatar">
                        {(user.name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="friend-info">
                        <span className="friend-name">{user.name || 'DocVault User'}</span>
                        <span className="friend-id">{user.docVaultId}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {audienceMode === 'ALL_EXCEPT' && (
            <div>
              <div className="section-label">Select Excluded People ({excludedUserIds.length} excluded)</div>
              {mutualConnections.length === 0 ? (
                <div style={{ fontSize: '0.85rem', color: '#5b738b', padding: '0.5rem 0' }}>
                  No connections to exclude.
                </div>
              ) : (
                <div className="friend-selector">
                  {mutualConnections.map((user) => (
                    <label key={user.id} className="friend-item">
                      <input
                        type="checkbox"
                        checked={excludedUserIds.includes(user.id)}
                        onChange={() => toggleExcludeUser(user.id)}
                      />
                      <div className="friend-avatar">
                        {(user.name || 'U').charAt(0).toUpperCase()}
                      </div>
                      <div className="friend-info">
                        <span className="friend-name">{user.name || 'DocVault User'}</span>
                        <span className="friend-id">{user.docVaultId}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: Permissions (View vs Download separate) */}
          {audienceMode !== 'ONLY_ME' && (
            <div>
              <div className="section-label">2. Recipient Permissions</div>
              <div className="permissions-row">
                <label className="perm-checkbox">
                  <input
                    type="checkbox"
                    checked={canView}
                    onChange={(e) => setCanView(e.target.checked)}
                  />
                  <Eye size={16} /> Allow Viewing
                </label>

                <label className="perm-checkbox">
                  <input
                    type="checkbox"
                    checked={canDownload}
                    onChange={(e) => setCanDownload(e.target.checked)}
                  />
                  <Download size={16} /> Allow Downloading
                </label>
              </div>
            </div>
          )}

          {/* STEP 3: Access Duration / Expiry */}
          {audienceMode !== 'ONLY_ME' && (
            <div className="expiry-row">
              <div className="section-label">3. Access Expiration (Optional)</div>
              <input
                type="date"
                className="expiry-input"
                min={new Date().toISOString().split('T')[0]}
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                Leave blank for continuous access until manually revoked.
              </span>
            </div>
          )}
        </div>

        <div className="share-modal__footer">
          <button className="btn-sm btn-outline" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-sm btn-primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving...' : 'Save Sharing Policy'}
          </button>
        </div>
      </div>
    </div>
  );
}

