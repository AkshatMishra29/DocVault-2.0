import React, { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import AppSidebar from './AppSidebar/AppSidebar';
import BottomNav from './BottomNav';
import { useAuth } from '../../features/auth/context/AuthContext';
import './AppLayout.css';

export default function AppLayout() {
  const { isVaultUnlocked, user, pendingEmail } = useAuth();
  const navigate = useNavigate();

  // If locked, immediately redirect to /enter-pin with replace: true
  useEffect(() => {
    if (!isVaultUnlocked) {
      const emailToPass = user?.email || pendingEmail || sessionStorage.getItem('docvault_pending_email') || localStorage.getItem('pending_pin_email') || '';
      const lenToPass = user?.pinLength || Number(sessionStorage.getItem('docvault_pin_length')) || 4;
      navigate('/enter-pin', { replace: true, state: { email: emailToPass, pinLength: lenToPass } });
    }
  }, [isVaultUnlocked, user, pendingEmail, navigate]);

  // Bfcache defense: if user navigated via browser back/forward and browser restored frozen cached state
  useEffect(() => {
    const handlePageShow = (e) => {
      if (e.persisted) {
        const unlocked = sessionStorage.getItem('docvault_unlocked') === 'true';
        if (!unlocked) {
          window.location.reload();
        }
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  return (
    <div className="dv-app-shell">
      <AppSidebar />
      <main className="dv-app-main">
        <div className="dv-app-content-container">
          <Outlet />
        </div>
      </main>
      <div className="dv-mobile-nav-wrapper">
        <BottomNav />
      </div>
    </div>
  );
}
