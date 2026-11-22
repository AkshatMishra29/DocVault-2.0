import React, { useState, useEffect } from 'react';
import {
  Lock,
  Users,
  UserCheck,
  UserX,
  X,
  Shield,
  Calendar,
  Download,
  Eye,
  Copy,
  Check,
  ShieldCheck,
  Search,
  Link as LinkIcon,
  Sparkles,
  ExternalLink,
  Clock,
  ArrowRight
} from 'lucide-react';
import { useAuth } from '../auth/context/AuthContext';
import { sharingService } from '../../services/sharing.service';
import './ShareModal.css';

export default function ShareModal({ documentId, documentTitle, isOpen, onClose, onSaved }) {
  const { user } = useAuth();

  // Tab: 'DIRECT' (Share with Person) | 'LINK' (Create Share Link) | 'POLICY' (Audience Policy)
  const [activeTab, setActiveTab] = useState('DIRECT');

  // Direct Person Share State
  const [recipientInput, setRecipientInput] = useState('');
  const [verifiedRecipient, setVerifiedRecipient] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  // Share Configurations
  const [canView, setCanView] = useState(true);
  const [canDownload, setCanDownload] = useState(false);
  const [expiryOption, setExpiryOption] = useState('168'); // hours: 24, 168 (7d), 720 (30d), '0' (never)
  const [linkPassword, setLinkPassword] = useState('');

  // Connections and Policy state
  const [mutualConnections, setMutualConnections] = useState([]);
  const [audienceMode, setAudienceMode] = useState('ONLY_ME');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [excludedUserIds, setExcludedUserIds] = useState([]);

  // Link Share Result State
  const [generatedLink, setGeneratedLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  // Status / Feedback
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [copiedMyId, setCopiedMyId] = useState(false);

  const myDocVaultId = user?.docVaultId || (() => {
    try {
      const stored = JSON.parse(localStorage.getItem('docvault_user') || localStorage.getItem('user') || '{}');
      return stored.docVaultId || '';
    } catch {
      return '';
    }
  })();

  const copyMyId = () => {
    if (myDocVaultId) {
      navigator.clipboard.writeText(myDocVaultId);
      setCopiedMyId(true);
      setTimeout(() => setCopiedMyId(false), 2000);
    }
  };

  useEffect(() => {
    if (isOpen && documentId) {
      loadData();
      resetForm();
    }
  }, [isOpen, documentId]);

  const resetForm = () => {
    setRecipientInput('');
    setVerifiedRecipient(null);
    setVerifyError('');
    setError('');
    setSuccessMessage('');
    setGeneratedLink('');
    setLinkCopied(false);
    setCanView(true);
    setCanDownload(false);
    setExpiryOption('168');
    setLinkPassword('');
  };

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [connRes, shareRes] = await Promise.all([
        sharingService.getConnections().catch(() => ({ success: false })),
        sharingService.getDocumentSharing(documentId).catch(() => ({ success: false })),
      ]);

      if (connRes.success && Array.isArray(connRes.data)) {
        setMutualConnections(connRes.data);
      }

      if (shareRes.success && shareRes.data?.policy) {
        const p = shareRes.data.policy;
        setAudienceMode(p.audienceMode || 'ONLY_ME');
        setCanView(p.permissions?.view !== false);
        setCanDownload(Boolean(p.permissions?.download));
        setSelectedUserIds((p.selectedUserIds || []).map((id) => (typeof id === 'object' ? id._id : id)));
        setExcludedUserIds((p.excludedUserIds || []).map((id) => (typeof id === 'object' ? id._id : id)));
      }
    } catch (err) {
      console.warn('Failed to load sharing details:', err);
    } finally {
      setLoading(false);
    }
  };

  // Live Recipient Verification
  const handleVerifyRecipient = async (val) => {
    const query = val !== undefined ? val : recipientInput;
    if (!query || !query.trim()) {
      setVerifiedRecipient(null);
      setVerifyError('');
      return;
    }

    setVerifying(true);
    setVerifyError('');
    try {
      const res = await sharingService.lookupRecipient(query.trim());
      if (res.success && res.data) {
        setVerifiedRecipient(res.data);
        setVerifyError('');
      } else {
        setVerifiedRecipient(null);
        setVerifyError(res.error || 'Recipient not found. Check the DocVault ID or email.');
      }
    } catch (err) {
      setVerifiedRecipient(null);
      setVerifyError('Failed to lookup recipient.');
    } finally {
      setVerifying(false);
    }
  };

  // Quick select an existing connection
  const selectConnection = (conn) => {
    const id = conn.id || conn._id;
    const name = conn.name || 'User';
    const docVaultId = conn.docVaultId || '';
    const email = conn.email || '';

    setVerifiedRecipient({ id, name, docVaultId, email });
    setRecipientInput(docVaultId || email || name);
    setVerifyError('');
  };

  // DIRECT SHARE: Share document directly with verified person or email
  const handleDirectShare = async (e) => {
    e.preventDefault();
    if (!verifiedRecipient && !recipientInput.trim()) {
      setError('Please enter a recipient DocVault ID or Email.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const hours = Number(expiryOption);
      const payload = {
        documentIds: [documentId],
        purpose: `Share: ${documentTitle}`,
        recipientUserId: verifiedRecipient?.id || null,
        recipientDocVaultId: verifiedRecipient?.docVaultId || (!recipientInput.includes('@') ? recipientInput.trim() : null),
        recipientEmail: verifiedRecipient?.email || (recipientInput.includes('@') ? recipientInput.trim() : null),
        permissions: {
          view: canView,
          download: canDownload,
        },
        expiresInHours: hours > 0 ? hours : null,
      };

      const res = await sharingService.directShare(payload);
      if (res.success) {
        const recipientName = verifiedRecipient?.name || recipientInput.trim();
        setSuccessMessage(`Document successfully shared with ${recipientName}! They can now view it in DocVault.`);
        if (onSaved) onSaved();
      } else {
        setError(res.error || 'Failed to share document.');
      }
    } catch (err) {
      setError(err.message || 'Error sharing document.');
    } finally {
      setSaving(false);
    }
  };

  // LINK SHARE: Generate secure expiring link
  const handleGenerateLink = async () => {
    setSaving(true);
    setError('');
    try {
      const hours = Number(expiryOption);
      const payload = {
        documentIds: [documentId],
        purpose: `Link Share: ${documentTitle}`,
        shareType: 'LINK',
        permissions: {
          view: canView,
          download: canDownload,
        },
        expiresInHours: hours > 0 ? hours : 168,
        password: linkPassword.trim() || null,
      };

      const res = await sharingService.directShare(payload);
      if (res.success && res.data) {
        const url = `${window.location.origin}${res.data.shareUrl}`;
        setGeneratedLink(url);
      } else {
        setError(res.error || 'Failed to generate link.');
      }
    } catch (err) {
      setError(err.message || 'Error creating share link.');
    } finally {
      setSaving(false);
    }
  };

  const copyGeneratedLink = () => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  // POLICY SAVE: Save WhatsApp-style audience policy
  const handleSavePolicy = async () => {
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
      });

      if (res.success) {
        setSuccessMessage('Document audience policy updated successfully!');
        if (onSaved) onSaved();
      } else {
        setError(res.error || 'Failed to update policy.');
      }
    } catch (err) {
      setError(err.message || 'Error saving policy.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="share-modal-backdrop" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="share-modal__header">
          <div>
            <div className="share-modal__title">Share Document</div>
            <div className="share-modal__doc-title">{documentTitle}</div>
          </div>
          <button className="share-modal__close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Sender ID Banner */}
        <div className="share-modal__my-id-banner">
          <div className="share-modal__my-id-left">
            <ShieldCheck size={16} className="share-modal__shield-icon" />
            <span className="share-modal__my-id-tag">YOUR DOCVAULT ID:</span>
            <span className="share-modal__my-id-code">{myDocVaultId || 'Loading...'}</span>
          </div>
          {myDocVaultId && (
            <button
              type="button"
              className="share-modal__copy-btn"
              onClick={copyMyId}
              title="Copy your DocVault ID"
            >
              {copiedMyId ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
              <span>{copiedMyId ? 'Copied' : 'Copy ID'}</span>
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="share-modal__tabs">
          <button
            type="button"
            className={`share-modal__tab-btn ${activeTab === 'DIRECT' ? 'share-modal__tab-btn--active' : ''}`}
            onClick={() => { setActiveTab('DIRECT'); setError(''); setSuccessMessage(''); }}
          >
            <UserCheck size={15} />
            <span>Share with Person</span>
          </button>
          <button
            type="button"
            className={`share-modal__tab-btn ${activeTab === 'LINK' ? 'share-modal__tab-btn--active' : ''}`}
            onClick={() => { setActiveTab('LINK'); setError(''); setSuccessMessage(''); }}
          >
            <LinkIcon size={15} />
            <span>Create Share Link</span>
          </button>
          <button
            type="button"
            className={`share-modal__tab-btn ${activeTab === 'POLICY' ? 'share-modal__tab-btn--active' : ''}`}
            onClick={() => { setActiveTab('POLICY'); setError(''); setSuccessMessage(''); }}
          >
            <Users size={15} />
            <span>Audience Policy</span>
          </button>
        </div>

        {/* Feedback alerts */}
        {error && (
          <div className="share-modal__alert share-modal__alert--error">
            {error}
          </div>
        )}
        {successMessage && (
          <div className="share-modal__alert share-modal__alert--success">
            <Check size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* TAB 1: SHARE WITH PERSON */}
        {activeTab === 'DIRECT' && (
          <form onSubmit={handleDirectShare} className="share-modal__body">
            <div>
              <label className="section-label">Recipient DocVault ID or Email</label>
              <div className="share-modal__search-input-wrap">
                <input
                  type="text"
                  className="share-modal__text-input"
                  placeholder="Enter DocVault ID (e.g. DV-XXXX-XXXX) or email"
                  value={recipientInput}
                  onChange={(e) => {
                    setRecipientInput(e.target.value);
                    setVerifiedRecipient(null);
                    setVerifyError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleVerifyRecipient();
                    }
                  }}
                />
                <button
                  type="button"
                  className="share-modal__verify-btn"
                  onClick={() => handleVerifyRecipient()}
                  disabled={verifying || !recipientInput.trim()}
                >
                  {verifying ? 'Checking...' : 'Verify'}
                </button>
              </div>

              {verifyError && (
                <div className="share-modal__hint-error">{verifyError}</div>
              )}

              {/* Verified Recipient Card */}
              {verifiedRecipient && (
                <div className="share-modal__verified-card">
                  <div className="share-modal__verified-avatar">
                    {(verifiedRecipient.name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="share-modal__verified-info">
                    <div className="share-modal__verified-name-row">
                      <strong className="share-modal__verified-name">{verifiedRecipient.name}</strong>
                      <span className="share-modal__verified-badge">✓ Verified DocVault User</span>
                    </div>
                    <div className="share-modal__verified-sub">
                      {verifiedRecipient.docVaultId && (
                        <span className="friend-id-badge">{verifiedRecipient.docVaultId}</span>
                      )}
                      {verifiedRecipient.email && (
                        <span className="share-modal__verified-email">{verifiedRecipient.email}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Connections Pick */}
            {mutualConnections.length > 0 && (
              <div>
                <label className="section-label">Or Pick From Contacts ({mutualConnections.length})</label>
                <div className="share-modal__chips-row">
                  {mutualConnections.map((conn) => {
                    const id = conn.id || conn._id;
                    const isSelected = verifiedRecipient?.id === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`share-modal__chip ${isSelected ? 'share-modal__chip--selected' : ''}`}
                        onClick={() => selectConnection(conn)}
                      >
                        <span className="share-modal__chip-avatar">
                          {(conn.name || 'U').charAt(0).toUpperCase()}
                        </span>
                        <span>{conn.name}</span>
                        {conn.docVaultId && <span className="share-modal__chip-id">({conn.docVaultId})</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Permissions */}
            <div>
              <label className="section-label">Permissions</label>
              <div className="share-modal__perm-cards">
                <div
                  className={`share-modal__perm-card ${!canDownload ? 'share-modal__perm-card--active' : ''}`}
                  onClick={() => setCanDownload(false)}
                >
                  <Eye size={18} />
                  <div>
                    <strong>View Only</strong>
                    <span>Recipient can view securely in viewer</span>
                  </div>
                </div>

                <div
                  className={`share-modal__perm-card ${canDownload ? 'share-modal__perm-card--active' : ''}`}
                  onClick={() => setCanDownload(true)}
                >
                  <Download size={18} />
                  <div>
                    <strong>View & Download</strong>
                    <span>Recipient can also download copy</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Expiry Selector */}
            <div>
              <label className="section-label">Access Duration</label>
              <div className="share-modal__expiry-chips">
                {[
                  { label: '24 Hours', val: '24' },
                  { label: '7 Days', val: '168' },
                  { label: '30 Days', val: '720' },
                  { label: 'No Expiry', val: '0' },
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    className={`share-modal__duration-btn ${expiryOption === opt.val ? 'share-modal__duration-btn--active' : ''}`}
                    onClick={() => setExpiryOption(opt.val)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <div className="share-modal__footer">
              <button type="button" className="btn-sm btn-outline" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn-sm btn-primary"
                disabled={saving || (!verifiedRecipient && !recipientInput.trim())}
              >
                {saving ? 'Sharing...' : verifiedRecipient ? `Share with ${verifiedRecipient.name}` : 'Share Document'}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: CREATE SHARE LINK */}
        {activeTab === 'LINK' && (
          <div className="share-modal__body">
            <p className="share-modal__tab-desc">
              Generate a secure cryptographic expiring link. You can send it directly via WhatsApp, email, or messaging.
            </p>

            {generatedLink ? (
              <div className="share-modal__generated-link-box">
                <div className="share-modal__link-ready-header">
                  <Check size={18} color="#10b981" />
                  <strong>Secure Link Ready</strong>
                </div>
                <div className="share-modal__link-input-group">
                  <input
                    type="text"
                    readOnly
                    className="share-modal__text-input"
                    value={generatedLink}
                  />
                  <button
                    type="button"
                    className="share-modal__copy-link-btn"
                    onClick={copyGeneratedLink}
                  >
                    {linkCopied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                    <span>{linkCopied ? 'Copied!' : 'Copy Link'}</span>
                  </button>
                </div>
                <div className="share-modal__link-details">
                  <span><Clock size={12} /> Expiring in {expiryOption === '0' ? 'continuous' : `${expiryOption} hours`}</span>
                  <span><Shield size={12} /> {canDownload ? 'View & Download' : 'View-Only'}</span>
                </div>
              </div>
            ) : (
              <>
                {/* Permissions */}
                <div>
                  <label className="section-label">Link Permissions</label>
                  <div className="share-modal__perm-cards">
                    <div
                      className={`share-modal__perm-card ${!canDownload ? 'share-modal__perm-card--active' : ''}`}
                      onClick={() => setCanDownload(false)}
                    >
                      <Eye size={18} />
                      <div>
                        <strong>View Only</strong>
                        <span>Watermarked viewer without download</span>
                      </div>
                    </div>

                    <div
                      className={`share-modal__perm-card ${canDownload ? 'share-modal__perm-card--active' : ''}`}
                      onClick={() => setCanDownload(true)}
                    >
                      <Download size={18} />
                      <div>
                        <strong>Allow Download</strong>
                        <span>Recipient can download document</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Duration */}
                <div>
                  <label className="section-label">Link Validity</label>
                  <div className="share-modal__expiry-chips">
                    {[
                      { label: '24 Hours', val: '24' },
                      { label: '7 Days', val: '168' },
                      { label: '30 Days', val: '720' },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        className={`share-modal__duration-btn ${expiryOption === opt.val ? 'share-modal__duration-btn--active' : ''}`}
                        onClick={() => setExpiryOption(opt.val)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional Password */}
                <div>
                  <label className="section-label">Password Protection (Optional)</label>
                  <input
                    type="password"
                    className="share-modal__text-input"
                    placeholder="Leave blank for no password"
                    value={linkPassword}
                    onChange={(e) => setLinkPassword(e.target.value)}
                  />
                </div>

                <div className="share-modal__footer">
                  <button type="button" className="btn-sm btn-outline" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-sm btn-primary"
                    onClick={handleGenerateLink}
                    disabled={saving}
                  >
                    {saving ? 'Generating...' : 'Generate Secure Link'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: AUDIENCE POLICY */}
        {activeTab === 'POLICY' && (
          <div className="share-modal__body">
            <div>
              <label className="section-label">Audience Visibility</label>
              <div className="audience-options">
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

                <div
                  className={`audience-card ${audienceMode === 'ALL_CONNECTIONS' ? 'audience-card--selected' : ''}`}
                  onClick={() => setAudienceMode('ALL_CONNECTIONS')}
                >
                  <div className="audience-card__icon"><Users size={18} /></div>
                  <div>
                    <div className="audience-card__title">All Mutual Connections</div>
                    <div className="audience-card__sub">Share with all {mutualConnections.length} mutual connections</div>
                  </div>
                </div>

                <div
                  className={`audience-card ${audienceMode === 'SELECTED' ? 'audience-card--selected' : ''}`}
                  onClick={() => setAudienceMode('SELECTED')}
                >
                  <div className="audience-card__icon"><UserCheck size={18} /></div>
                  <div>
                    <div className="audience-card__title">Selected People</div>
                    <div className="audience-card__sub">Only share with chosen contacts</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="share-modal__footer">
              <button type="button" className="btn-sm btn-outline" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-sm btn-primary"
                onClick={handleSavePolicy}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Audience Policy'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
