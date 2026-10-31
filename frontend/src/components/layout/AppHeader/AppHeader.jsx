import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../features/auth/context/AuthContext';
import { LogOut, ShieldCheck, Sun, Moon, Lock } from 'lucide-react';
import Button from '../../common/Button/Button';
import './AppHeader.css';

export default function AppHeader({ title, subtitle }) {
  const { user, lockVault, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark');

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('docvault_theme', next);
    setTheme(next);
  };

  const handleLockVault = () => {
    lockVault();
    navigate('/enter-pin', { state: { email: user?.email } });
  };

  return (
    <header className="dv-app-header">
      <div className="dv-app-header__title-group">
        <h1 className="dv-app-header__title">{title}</h1>
        {subtitle && <p className="dv-app-header__subtitle">{subtitle}</p>}
      </div>

      <div className="dv-app-header__actions">
        {/* Quick Theme Switcher */}
        <button
          type="button"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {theme === 'dark' ? <Sun size={17} color="#fbbf24" /> : <Moon size={17} color="#0f172a" />}
        </button>

        <div className="dv-app-header__user-pill">
          <ShieldCheck size={16} className="dv-app-header__shield-icon" />
          <span className="dv-app-header__user-email">{user?.email || 'Authenticated User'}</span>
        </div>

        {/* Lock Vault Button - immediately locks the vault and redirects to PIN challenge */}
        <Button variant="outline" size="sm" icon={Lock} onClick={handleLockVault}>
          Lock Vault
        </Button>

        {/* Complete Sign Out */}
        <Button variant="ghost" size="sm" icon={LogOut} onClick={logout} title="Sign Out of Session">
          Sign Out
        </Button>
      </div>
    </header>
  );
}

