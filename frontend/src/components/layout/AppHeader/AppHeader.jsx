import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../../features/auth/context/AuthContext';
import { LogOut, ShieldCheck, Lock, Users, ChevronDown, UserPlus, Check, Bell, Calendar, AlertTriangle, FileText, ChevronRight, Sun, Moon } from 'lucide-react';
import { useTheme } from '../../../app/theme';
import { apiRequest } from '../../../services/api';
import Button from '../../common/Button/Button';
import './AppHeader.css';

export default function AppHeader({ title, subtitle }) {
  const { user, lockSession, logout, savedSessions = [], switchSession } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const notifRef = useRef(null);

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
  const menuRef = useRef(null);
  const navigate = useNavigate();

  const handleLockSession = () => {
    lockSession();
    navigate('/enter-pin', { state: { email: user?.email, pinLength: user?.pinLength } });
  };

  const handleSwitchToOldSession = (targetEmail) => {
    switchSession(targetEmail);
    setShowSwitchMenu(false);
    navigate('/enter-pin', { state: { email: targetEmail } });
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowSwitchMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const userInitial = user?.name ? user.name[0].toUpperCase() : 'U';
  const otherSessions = savedSessions.filter(
    (s) => s.email.toLowerCase() !== (user?.email || '').toLowerCase()
  );

  return (
    <header className="dv-app-header">
      <div className="dv-app-header__title-group">
        <div className="dv-app-header__mobile-avatar">
          <span>{userInitial}</span>
        </div>
        <div>
          <h1 className="dv-app-header__title">{title}</h1>
          {subtitle && <p className="dv-app-header__subtitle">{subtitle}</p>}
        </div>
      </div>

            <div className="dv-app-header__actions" ref={menuRef}>
        {/* Dark / Light Mode Theme Toggle Pill */}
        <button
          type="button"
          className="dv-header-theme-toggle"
          onClick={toggleTheme}
          title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
          aria-label="Toggle theme"
        >
          {resolvedTheme === 'dark' ? (
            <>
              <Sun size={15} className="dv-theme-icon-sun" />
              <span className="dv-header-theme-label">Light</span>
            </>
          ) : (
            <>
              <Moon size={15} className="dv-theme-icon-moon" />
              <span className="dv-header-theme-label">Dark</span>
            </>
          )}
        </button>

        {/* Notification Bell Dropdown */}
        <div className="dv-header-notif-wrapper" ref={notifRef}>
          <button
            type="button"
            className={`dv-header-notif-btn ${notifications.length > 0 ? 'dv-header-notif-btn--has-unread' : ''}`}
            onClick={() => setShowNotifications(!showNotifications)}
            title="Notifications"
          >
            <Bell size={18} />
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

        {/* User Account & Switch Pill */}
        <div className="dv-app-header__session-wrapper">
          <button
            type="button"
            className="dv-app-header__user-pill"
            onClick={() => otherSessions.length > 0 && setShowSwitchMenu(!showSwitchMenu)}
            title={otherSessions.length > 0 ? "Click to switch session" : "Active session"}
          >
            <ShieldCheck size={15} className="dv-app-header__shield-icon" />
            <span className="dv-app-header__user-email">{user?.email || 'Authenticated User'}</span>
            {otherSessions.length > 0 && (
              <span className="dv-app-header__switch-badge">
                <Users size={11} />
                <span>{savedSessions.length}</span>
                <ChevronDown size={11} className={showSwitchMenu ? "dv-rotate-180" : ""} />
              </span>
            )}
          </button>

          {/* Quick Session Switch Menu */}
          {showSwitchMenu && otherSessions.length > 0 && (
            <div className="dv-header-switch-dropdown">
              <div className="dv-header-switch-title">Switch to Another Session</div>
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
              <div className="dv-header-dropdown-footer">
                <button
                  type="button"
                  className="dv-header-add-session-btn"
                  onClick={() => {
                    setShowSwitchMenu(false);
                    logout();
                    navigate('/login');
                  }}
                >
                  <UserPlus size={13} />
                  <span>Sign In with New Account</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Lock Session Button (Immediately locks vault and redirects to PIN screen) */}
        <Button 
          variant="outline" 
          size="sm" 
          icon={Lock} 
          onClick={handleLockSession}
          className="dv-app-header__lock-btn"
          title="Lock active session (Cmd+L / Ctrl+L)"
        >
          <span>Lock Session</span>
          <kbd className="dv-app-header__kbd">⌘L</kbd>
        </Button>

        {/* Complete Sign Out */}
        <Button 
          variant="ghost" 
          size="sm" 
          icon={LogOut} 
          onClick={logout} 
          title="Sign Out of Session"
          className="dv-app-header__logout-btn"
        >
          Sign Out
        </Button>
      </div>
    </header>
  );
}
