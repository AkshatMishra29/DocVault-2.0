import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, isVaultUnlocked, pendingEmail } = useAuth();

  // If no user session is present, go to login
  if (!user && !pendingEmail) {
    return <Navigate to="/login" replace />;
  }

  // If user is logged in with password but vault PIN is locked, go to PIN entry screen
  if (!isVaultUnlocked) {
    const emailToPass = user?.email || pendingEmail || sessionStorage.getItem('docvault_pending_email') || localStorage.getItem('pending_pin_email') || '';
    const lenToPass = user?.pinLength || Number(sessionStorage.getItem('docvault_pin_length')) || 4;
    return <Navigate to="/enter-pin" replace state={{ email: emailToPass, pinLength: lenToPass }} />;
  }

  return children;
}
