import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../../features/auth/context/AuthContext';
import { LogOut, ShieldCheck, Lock, Users, ChevronDown, UserPlus, Check } from 'lucide-react';
import Button from '../../common/Button/Button';
import './AppHeader.css';

export default function AppHeader({ title, subtitle }) {
  const { user, lockSession, logout, savedSessions = [], switchSession } = useAuth();
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);
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
