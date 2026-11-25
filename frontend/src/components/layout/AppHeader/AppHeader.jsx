import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../../features/auth/context/AuthContext';
import { 
  LogOut, ShieldCheck, Lock, Users, ChevronDown, UserPlus, 
  Check, Bell, Calendar, AlertTriangle, FileText, ChevronRight, 
  Sun, Moon, Sparkles, Bot 
} from 'lucide-react';
import { useTheme } from '../../../app/theme';
import { apiRequest } from '../../../services/api';
import './AppHeader.css';

export default function AppHeader({ title, subtitle }) {
  const { user, lockSession, logout, savedSessions = [], switchSession } = useAuth();
  const { resolvedTheme } = useTheme();
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);
  const accountRef = useRef(null);
  const navigate = useNavigate();

  // Load real-time vault notifications
  useEffect(() => {
    let mounted = true;
    async function loadNotifications() {
      try {
        const [deadRes, revRes] = await Promise.all([
          apiRequest('/api/deadlines').catch(() => ({ data: [] })),
          apiRequest('/api/extraction/review-queue').catch(() => ({ data: [] }))
        ]);

        const notifs = [];
        if (deadRes?.data && Array.isArray(deadRes.data)) {
          deadRes.data.forEach((d) => {
            const days = d.daysLeft !== undefined ? d.daysLeft : null;
            if (days !== null && days <= 0) {
              notifs.push({
                id: `overdue-${d.documentId || d._id}`,
                type: 'danger',
                title: `${d.title} is Overdue`,
                desc: `Expired on ${d.date || d.dueDate}`,
                link: d.documentId ? `/documents/${d.documentId}` : '/deadlines'
              });
            } else if (days !== null && days <= 30) {
              notifs.push({
                id: `expiring-${d.documentId || d._id}`,
                type: 'warning',
                title: `${d.title} Expiring Soon`,
                desc: `Renewal due in ${days} days`,
                link: d.documentId ? `/documents/${d.documentId}` : '/deadlines'
              });
            }
          });
        }

        if (revRes?.data && Array.isArray(revRes.data)) {
          revRes.data.slice(0, 3).forEach((r) => {
            notifs.push({
              id: `review-${r._id}`,
              type: 'info',
              title: `Review Details for ${r.title}`,
              desc: 'Some extracted fields need your confirmation',
              link: `/documents/${r._id}`
            });
          });
        }

        if (mounted) {
          setNotifications(notifs);
        }
      } catch (err) {
        // quiet ignore
      }
    }
    loadNotifications();
    return () => { mounted = false; };
  }, []);

  const handleLockSession = () => {
    lockSession();
    navigate('/enter-pin', { state: { email: user?.email, pinLength: user?.pinLength } });
  };

  const handleSwitchToOldSession = (targetEmail) => {
    switchSession(targetEmail);
    setShowAccountMenu(false);
    navigate('/enter-pin', { state: { email: targetEmail } });
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setShowAccountMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const userInitial = user?.name ? user.name[0].toUpperCase() : (user?.email ? user.email[0].toUpperCase() : 'U');
  const userDisplayName = user?.name ? user.name.split(' ')[0] : (user?.email ? user.email.split('@')[0] : 'Account');
  const otherSessions = savedSessions.filter(
    (s) => s.email && s.email.toLowerCase() !== (user?.email || '').toLowerCase()
  );

  return (
    <header className="dv-app-header">
      <div className="dv-app-header__title-group">
        <h1 className="dv-app-header__title">{title}</h1>
        {subtitle && <p className="dv-app-header__subtitle">{subtitle}</p>}
      </div>

      <div className="dv-app-header__actions">
        {/* Copilot Beta Header Pill */}
        <Link
          to="/copilot-beta"
          className="dv-header-copilot-btn"
          title="Autonomous AI Copilot (Beta)"
          aria-label="DocVault Copilot Beta"
        >
          <Bot size={15} className="dv-header-copilot-icon" />
          <span className="dv-header-copilot-label">Copilot</span>
          <span className="dv-header-copilot-badge">Beta</span>
        </Link>

        {/* Quick Ask AI Copilot Button */}
        <Link
          to="/ask-ai"
          className="dv-header-ask-btn"
          title="Ask AI Assistant"
          aria-label="Ask AI Assistant"
        >
          <Sparkles size={15} className="dv-header-ask-icon" />
          <span className="dv-header-ask-label">Ask AI</span>
        </Link>

        {/* Notification Bell Dropdown */}
        <div className="dv-header-notif-wrapper" ref={notifRef}>
          <button
            type="button"
            className={`dv-header-notif-btn ${notifications.length > 0 ? 'dv-header-notif-btn--has-unread' : ''}`}
            onClick={() => setShowNotifications(!showNotifications)}
            title="Notifications"
            aria-label="Notifications"
          >
            <Bell size={17} />
            {notifications.length > 0 && (
              <span className="dv-header-notif-badge">{notifications.length}</span>
            )}
          </button>

          {showNotifications && (
            <div className="dv-header-notif-dropdown">
              <div className="dv-header-notif-header">
                <strong>Vault Notifications</strong>
                <span className="dv-notif-count-pill">{notifications.length} alerts</span>
              </div>

              <div className="dv-header-notif-list">
                {notifications.length === 0 ? (
                  <div className="dv-notif-empty">
                    <Check size={24} color="#10B981" />
                    <p>All caught up!</p>
                    <small>No pending renewals or document reviews.</small>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <Link
                      key={n.id}
                      to={n.link}
                      className={`dv-notif-item dv-notif-item--${n.type}`}
                      onClick={() => setShowNotifications(false)}
                    >
                      <div className="dv-notif-item-icon">
                        {n.type === 'danger' ? <AlertTriangle size={15} /> : <Calendar size={15} />}
                      </div>
                      <div className="dv-notif-item-content">
                        <span className="dv-notif-item-title">{n.title}</span>
                        <small className="dv-notif-item-desc">{n.desc}</small>
                      </div>
                      <ChevronRight size={14} className="dv-notif-arrow" />
                    </Link>
                  ))
                )}
              </div>

              <div className="dv-header-notif-footer">
                <Link to="/deadlines" onClick={() => setShowNotifications(false)}>
                  View all in Renewals & Deadlines →
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Quick Lock Session Button */}
        <button
          type="button"
          onClick={handleLockSession}
          className="dv-header-quick-lock-btn"
          title="Lock active session (Cmd+L / Ctrl+L)"
          aria-label="Lock Session"
        >
          <Lock size={14} />
          <span className="dv-header-lock-label">Lock</span>
          <kbd className="dv-app-header__kbd">⌘L</kbd>
        </button>

        {/* Consolidated User Profile Menu */}
        <div className="dv-app-header__session-wrapper" ref={accountRef}>
          <button
            type="button"
            className="dv-app-header__account-trigger"
            onClick={() => setShowAccountMenu(!showAccountMenu)}
            title="Account & Security"
            aria-label="Account Menu"
          >
            <div className="dv-header-avatar">
              <span>{userInitial}</span>
            </div>
            <span className="dv-header-account-name">{userDisplayName}</span>
            <ChevronDown size={13} className={`dv-header-account-chevron ${showAccountMenu ? "dv-rotate-180" : ""}`} />
          </button>

          {showAccountMenu && (
            <div className="dv-header-switch-dropdown">
              <div className="dv-header-account-card">
                <div className="dv-header-avatar dv-header-avatar--lg">
                  <span>{userInitial}</span>
                </div>
                <div className="dv-header-meta">
                  <strong>{user?.name || 'Vault Custodian'}</strong>
                  <small>{user?.email || 'Authenticated User'}</small>
                  <span className="dv-header-security-tag">
                    <ShieldCheck size={11} /> Verified Session
                  </span>
                </div>
              </div>

              {otherSessions.length > 0 && (
                <>
                  <div className="dv-header-switch-title">Switch Account ({otherSessions.length})</div>
                  {savedSessions.map((s) => {
                    const isCurrent = s.email.toLowerCase() === (user?.email || '').toLowerCase();
                    return (
                      <button
                        key={s.email}
                        type="button"
                        className={`dv-header-session-btn ${isCurrent ? 'dv-header-session-btn--current' : ''}`}
                        onClick={() => !isCurrent && handleSwitchToOldSession(s.email)}
                      >
                        <div className="dv-header-avatar">
                          <span>{s.name?.[0]?.toUpperCase() || 'U'}</span>
                        </div>
                        <div className="dv-header-meta">
                          <strong>{s.name}</strong>
                          <small>{s.email}</small>
                        </div>
                        {isCurrent ? (
                          <Check size={14} className="dv-current-check" />
                        ) : (
                          <span className="dv-switch-pill">Switch</span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}

              <div className="dv-header-dropdown-footer">
                <button
                  type="button"
                  className="dv-header-add-session-btn"
                  onClick={() => {
                    setShowAccountMenu(false);
                    logout();
                    navigate('/login');
                  }}
                >
                  <UserPlus size={13} />
                  <span>Sign In with New Account</span>
                </button>
                <button
                  type="button"
                  className="dv-header-logout-dropdown-btn"
                  onClick={() => {
                    setShowAccountMenu(false);
                    logout();
                  }}
                >
                  <LogOut size={13} />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
