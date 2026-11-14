import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, FileText, UploadCloud, Layers, Calendar, 
  Sparkles, Settings, ShieldCheck, Activity, Users, Share2, 
  Landmark, Lock, ChevronDown, Check, UserPlus, Sun, Moon 
} from 'lucide-react';
import DocVaultLogo from '../../common/DocVaultLogo/DocVaultLogo';
import { useAuth } from '../../../features/auth/context/AuthContext';
import { useTheme } from '../../../app/theme';
import './AppSidebar.css';

const navItems = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/documents', label: 'My Documents', icon: FileText },
  { to: '/deadlines', label: 'Renewals', icon: Calendar },
  { to: '/assets', label: 'My Assets', icon: Layers },
  { to: '/shares', label: 'Sharing', icon: Share2 },
  { to: '/ask-ai', label: 'Ask AI', icon: Sparkles },
  { to: '/more', label: 'Settings', icon: Settings },
];

export default function AppSidebar() {
  const { user, lockSession, savedSessions = [], switchSession, logout } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);
  const navigate = useNavigate();

  const handleLock = () => {
    lockSession();
    navigate('/enter-pin', { state: { email: user?.email, pinLength: user?.pinLength } });
  };

  const handleSwitchToOld = (targetEmail) => {
    switchSession(targetEmail);
    setShowSwitchMenu(false);
    navigate('/enter-pin', { state: { email: targetEmail } });
  };

  const userInitial = user?.name ? user.name[0].toUpperCase() : 'U';
  const otherSessions = (savedSessions || []).filter(
    (s) => s && s.email && s.email.includes('@') && s.email.toLowerCase() !== (user?.email || '').toLowerCase()
  );

  return (
    <aside className="dv-sidebar">
      <div className="dv-sidebar__header">
        <NavLink to="/dashboard">
          <DocVaultLogo height={44} />
        </NavLink>
      </div>

      <nav className="dv-sidebar__nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `dv-sidebar__item ${isActive ? 'dv-sidebar__item--active' : ''}`
              }
            >
              <Icon size={18} className="dv-sidebar__icon" />
              <span className="dv-sidebar__label">{item.label}</span>
              {item.badge && <span className="dv-sidebar__badge">{item.badge}</span>}
            </NavLink>
          );
        })}
        {user?.role === 'admin' && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `dv-sidebar__item ${isActive ? 'dv-sidebar__item--active' : ''}`
            }
          >
            <ShieldCheck size={18} className="dv-sidebar__icon" />
            <span className="dv-sidebar__label">Admin Console</span>
          </NavLink>
        )}
      </nav>

      <div className="dv-sidebar__footer">
        {/* Prominent Segmented Theme Switcher */}
        <div className="dv-sidebar__theme-segment" role="group" aria-label="Theme selector">
          <button
            type="button"
            className={`dv-sidebar__theme-btn ${resolvedTheme === 'light' ? 'dv-sidebar__theme-btn--active' : ''}`}
            onClick={() => setTheme('light')}
            title="Switch to Light Mode"
          >
            <Sun size={13} className="dv-sidebar__theme-icon" />
            <span>Light</span>
          </button>
          <button
            type="button"
            className={`dv-sidebar__theme-btn ${resolvedTheme === 'dark' ? 'dv-sidebar__theme-btn--active' : ''}`}
            onClick={() => setTheme('dark')}
            title="Switch to Dark Mode"
          >
            <Moon size={13} className="dv-sidebar__theme-icon" />
            <span>Dark</span>
          </button>
        </div>

        {/* User Session & Quick Lock Card */}
        <div className="dv-sidebar__session-card">
          <div className="dv-sidebar__user-row">
            <div className="dv-sidebar__user-avatar">
              <span>{userInitial}</span>
            </div>
            <div className="dv-sidebar__user-info">
              <strong>{user?.name || 'Vault Custodian'}</strong>
              <small>{user?.email || 'Protected'}</small>
            </div>
          </div>

          <div className="dv-sidebar__session-actions">
            <button
              type="button"
              onClick={handleLock}
              className="dv-sidebar__lock-btn"
              title="Lock this session (Cmd+L)"
            >
              <Lock size={13} />
              <span>Lock Session</span>
            </button>

            {otherSessions.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSwitchMenu(!showSwitchMenu)}
                className="dv-sidebar__switch-btn"
                title="Switch to another session"
              >
                <Users size={12} />
                <span>Switch ({otherSessions.length})</span>
                <ChevronDown size={12} className={showSwitchMenu ? "dv-rotate-180" : ""} />
              </button>
            )}
          </div>

          {/* Sidebar Session Switcher Dropdown */}
          {showSwitchMenu && otherSessions.length > 0 && (
            <div className="dv-sidebar__switch-dropdown">
              <div className="dv-sidebar__switch-header">Switch Session</div>
              {(savedSessions || []).filter(s => s && s.email && s.email.includes('@')).map((s) => {
                const isCurrent = s.email.toLowerCase() === (user?.email || '').toLowerCase();
                return (
                  <button
                    key={s.email}
                    type="button"
                    className={`dv-sidebar__session-option ${isCurrent ? 'dv-sidebar__session-option--active' : ''}`}
                    onClick={() => !isCurrent && handleSwitchToOld(s.email)}
                  >
                    <div className="dv-sidebar__opt-avatar">
                      <span>{s.name?.[0]?.toUpperCase() || 'U'}</span>
                    </div>
                    <div className="dv-sidebar__opt-meta">
                      <strong>{s.name}</strong>
                      <small>{s.email}</small>
                    </div>
                    {isCurrent && <Check size={13} className="dv-opt-check" />}
                  </button>
                );
              })}
              <button
                type="button"
                className="dv-sidebar__add-opt-btn"
                onClick={() => {
                  setShowSwitchMenu(false);
                  logout();
                  navigate('/login');
                }}
              >
                <UserPlus size={12} />
                <span>Sign in with new account</span>
              </button>
            </div>
          )}
        </div>

        <div className="dv-sidebar__tier-pill">
          <span className="dv-sidebar__dot" />
          <span className="dv-sidebar__tier-text">Vault Pro Isolated</span>
        </div>
      </div>
    </aside>
  );
}
