import React from 'react';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { ThemeProvider } from './theme';

export function AppProviders({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </ThemeProvider>
  );
}
