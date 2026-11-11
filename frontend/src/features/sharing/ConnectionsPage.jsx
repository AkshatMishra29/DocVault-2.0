import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Clock, Check, X, Trash2, Copy, ShieldAlert, Search } from 'lucide-react';
import { sharingService } from '../../services/sharing.service';
import { apiRequest } from '../../config';
import './ConnectionsPage.css';

export default function ConnectionsPage() {
  const [activeTab, setActiveTab] = useState('mutual'); // 'mutual', 'incoming', 'outgoing', 'search'
  const [connections, setConnections] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [searchId, setSearchId] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copied, setCopied] = useState(false);
  const [myDocVaultId, setMyDocVaultId] = useState('');

  useEffect(() => {
    loadData(true);
    fetchMyProfile();

    // Live Sync: Automatic lightweight polling every 3 seconds
    const interval = setInterval(() => {
      loadData(false);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const fetchMyProfile = async () => {
    try {
      const stored = JSON.parse(
        localStorage.getItem('user') ||
        localStorage.getItem('docvault_user') ||
        '{}'
      );
      if (stored.docVaultId) {
        setMyDocVaultId(stored.docVaultId);
      }

      // Always fetch latest profile from backend using standard apiRequest
      const res = await apiRequest('/api/auth/me');
      if (res && res.success && res.user?.docVaultId) {
        setMyDocVaultId(res.user.docVaultId);
        localStorage.setItem('user', JSON.stringify({ ...stored, ...res.user }));
        localStorage.setItem('docvault_user', JSON.stringify({ ...stored, ...res.user }));
      }
    } catch (e) {
      console.warn('Profile fetch warning:', e);
    }
  };

  const loadData = async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setLoading(true);
    try {
      const [connRes, reqRes] = await Promise.all([
        sharingService.getConnections(),
        sharingService.getRequests(),
      ]);

      if (connRes.success) setConnections(connRes.data || []);
      if (reqRes.success) {
        setIncoming(reqRes.data?.incoming || []);
        setOutgoing(reqRes.data?.outgoing || []);
      }
    } catch (err) {
      if (showLoadingSpinner) setError('Failed to load connections.');
    } finally {
      if (showLoadingSpinner) setLoading(false);
    }
  };

  const copyMyId = () => {
    if (myDocVaultId) {
      navigator.clipboard.writeText(myDocVaultId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setError('');
    setSearchResult(null);
    if (!searchId.trim()) return;

    try {
      const res = await sharingService.lookupUser(searchId.trim());
      if (res.success) {
        setSearchResult(res.data);
      } else {
        setError(res.error || 'User not found.');
      }
    } catch (err) {
      setError('User not found with this DocVault ID.');
    }
  };

  const handleSendRequest = async (docVaultId) => {
    setError('');
    setSuccess('');
    try {
      const res = await sharingService.sendRequest(docVaultId);
      if (res.success) {
        setSuccess('Connection request sent!');
        setSearchResult(null);
        setSearchId('');
        loadData();
      } else {
        setError(res.error || 'Failed to send request.');
      }
    } catch (err) {
      setError(err.message || 'Error sending request.');
    }
  };

  const handleAccept = async (requestId) => {
    try {
      const res = await sharingService.acceptRequest(requestId);
      if (res.success) {
        setSuccess(res.isMutual ? 'Connected! You are now mutual connections.' : 'Request accepted.');
        loadData();
      }
    } catch (err) {
      setError('Failed to accept request.');
    }
  };

  const handleReject = async (requestId) => {
    try {
      await sharingService.rejectRequest(requestId);
      loadData();
    } catch (err) {
      setError('Failed to reject request.');
    }
  };

  const handleCancel = async (requestId) => {
    try {
      await sharingService.cancelRequest(requestId);
      loadData();
    } catch (err) {
      setError('Failed to cancel request.');
    }
  };

  const handleRemove = async (userId) => {
    if (!window.confirm('Remove connection? All active document shares with this user will be revoked immediately.')) {
      return;
    }
    try {
      await sharingService.removeConnection(userId);
      setSuccess('Connection removed and document access revoked.');
      loadData();
    } catch (err) {
      setError('Failed to remove connection.');
    }
  };

  return (
    <div className="connections-page">
      <div className="connections-header">
        <div>
          <h1 className="connections-header__title">Mutual Connections</h1>
          <p className="connections-header__sub">
            Connect with family & friends to securely share documents WhatsApp-style.
          </p>
        </div>

        <div className="my-id-card">
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Your DocVault ID</div>
            <div className="my-id-badge">{myDocVaultId || 'Loading ID...'}</div>
          </div>
          <button
            className="btn-sm btn-outline"
            onClick={copyMyId}
            disabled={!myDocVaultId}
            title="Copy ID"
          >
            <Copy size={14} />
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: '1rem', padding: '0.75rem', background: '#ffebee', color: '#c62828', borderRadius: '8px' }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '1rem', padding: '0.75rem', background: '#e8f5e9', color: '#2e7d32', borderRadius: '8px' }}>{success}</div>}

      <div className="connections-tabs">
        <button
          className={`connections-tab ${activeTab === 'mutual' ? 'connections-tab--active' : ''}`}
          onClick={() => setActiveTab('mutual')}
        >
          <Users size={16} />
          Connections
          <span className="badge-count">{connections.length}</span>
        </button>

        <button
          className={`connections-tab ${activeTab === 'incoming' ? 'connections-tab--active' : ''}`}
          onClick={() => setActiveTab('incoming')}
        >
          <Clock size={16} />
          Requests Received
          {incoming.length > 0 && <span className="badge-count">{incoming.length}</span>}
        </button>

        <button
          className={`connections-tab ${activeTab === 'outgoing' ? 'connections-tab--active' : ''}`}
          onClick={() => setActiveTab('outgoing')}
        >
          <UserPlus size={16} />
          Sent Requests
          {outgoing.length > 0 && <span className="badge-count">{outgoing.length}</span>}
        </button>

        <button
          className={`connections-tab ${activeTab === 'search' ? 'connections-tab--active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          <Search size={16} />
          Find by DocVault ID
        </button>
      </div>

      {/* Tab: Connections List with Live Directional Status */}
      {activeTab === 'mutual' && (
        <div>
          {connections.length === 0 ? (
            <div className="empty-state">
              <Users size={40} style={{ opacity: 0.4, marginBottom: '0.5rem' }} />
              <h3>No connections yet</h3>
              <p>Search a family member or friend by their DocVault ID to connect and share documents.</p>
              <button className="btn-sm btn-primary" onClick={() => setActiveTab('search')} style={{ margin: '1rem auto 0' }}>
                Find People
              </button>
            </div>
          ) : (
            <div className="conn-grid">
              {connections.map((user) => (
                <div key={user.id} className="conn-card">
                  <div>
                    <div className="conn-card__user">
                      <div className="conn-card__avatar">{user.name.charAt(0).toUpperCase()}</div>
                      <div style={{ flex: 1 }}>
                        <div className="conn-card__name">{user.name}</div>
                        <div className="conn-card__id">{user.docVaultId}</div>
                      </div>
                    </div>

                    <div style={{ marginTop: '0.85rem' }}>
                      {user.isMutual ? (
                        <span className="conn-badge conn-badge--mutual">
                          <Check size={12} /> Mutual (Two-Way Sharing + Shared AI)
                        </span>
                      ) : user.iApprovedThem ? (
                        <span className="conn-badge conn-badge--i-share">
                          You allowed them access (They have not allowed you yet)
                        </span>
                      ) : (
                        <span className="conn-badge conn-badge--they-share">
                          They allowed you access (You have not allowed them yet)
                        </span>
                      )}
                      <div className="conn-card__status-desc">
                        {user.isMutual
                          ? 'Both users can share documents with each other and both accounts’ AI Copilot can access shared documents.'
                          : user.iApprovedThem
                          ? 'You can share your documents with them, but cannot see their documents until they allow you.'
                          : 'They can share documents with you, but cannot see yours until you allow them.'}
                      </div>
                    </div>
                  </div>

                  <div className="conn-card__actions" style={{ marginTop: '0.5rem' }}>
                    {!user.theyApprovedMe && !user.isMutual && (
                      <button
                        className="btn-sm btn-primary"
                        onClick={() => handleSendRequest(user.docVaultId)}
                        title="Send request to make connection mutual"
                      >
                        <UserPlus size={14} /> Request Access Back
                      </button>
                    )}
                    <button className="btn-sm btn-danger" onClick={() => handleRemove(user.id)}>
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Incoming Requests */}
      {activeTab === 'incoming' && (
        <div>
          {incoming.length === 0 ? (
            <div className="empty-state">No incoming connection requests.</div>
          ) : (
            <div className="conn-grid">
              {incoming.map((req) => (
                <div key={req._id} className="conn-card">
                  <div className="conn-card__user">
                    <div className="conn-card__avatar">{req.requesterId?.name?.charAt(0) || 'U'}</div>
                    <div>
                      <div className="conn-card__name">{req.requesterId?.name}</div>
                      <div className="conn-card__id">{req.requesterId?.docVaultId}</div>
                    </div>
                  </div>
                  <div className="conn-card__actions">
                    <button className="btn-sm btn-primary" onClick={() => handleAccept(req._id)}>
                      <Check size={14} /> Accept
                    </button>
                    <button className="btn-sm btn-outline" onClick={() => handleReject(req._id)}>
                      <X size={14} /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Outgoing Requests */}
      {activeTab === 'outgoing' && (
        <div>
          {outgoing.length === 0 ? (
            <div className="empty-state">No pending sent requests.</div>
          ) : (
            <div className="conn-grid">
              {outgoing.map((req) => (
                <div key={req._id} className="conn-card">
                  <div className="conn-card__user">
                    <div className="conn-card__avatar">{req.recipientId?.name?.charAt(0) || 'U'}</div>
                    <div>
                      <div className="conn-card__name">{req.recipientId?.name}</div>
                      <div className="conn-card__id">{req.recipientId?.docVaultId}</div>
                    </div>
                  </div>
                  <div className="conn-card__actions">
                    <button className="btn-sm btn-outline" onClick={() => handleCancel(req._id)}>
                      <X size={14} /> Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Search & Connect */}
      {activeTab === 'search' && (
        <div>
          <form onSubmit={handleSearch} className="search-box">
            <input
              type="text"
              className="search-input"
              placeholder="Enter DocVault ID (e.g. DV-XXXX-XXXX)..."
              value={searchId}
              onChange={(e) => setSearchId(e.target.value)}
            />
            <button type="submit" className="btn-sm btn-primary" style={{ padding: '0 1.25rem' }}>
              Search
            </button>
          </form>

          {searchResult && (
            <div className="conn-card" style={{ maxWidth: '400px', margin: '0 auto' }}>
              <div className="conn-card__user">
                <div className="conn-card__avatar">{searchResult.name.charAt(0).toUpperCase()}</div>
                <div>
                  <div className="conn-card__name">{searchResult.name}</div>
                  <div className="conn-card__id">{searchResult.docVaultId}</div>
                </div>
              </div>
              <div className="conn-card__actions">
                <button
                  className="btn-sm btn-primary"
                  onClick={() => handleSendRequest(searchResult.docVaultId)}
                >
                  <UserPlus size={14} /> Send Connection Request
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

