import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../features/auth/context/AuthContext';
import { LogOut, ShieldCheck, Lock } from 'lucide-react';
import Button from '../../common/Button/Button';
import './AppHeader.css';

export default function AppHeader({ title, subtitle }) {
  const { user, lockVault, logout } = useAuth();
  const navigate = useNavigate();

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
