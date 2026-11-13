import React from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { ThemeProvider } from './theme';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '940417312093-vftovh8cf0r3q5jr45jt1659bgnh7n1e.apps.googleusercontent.com';

export function AppProviders({ children }) {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <ThemeProvider>
        <AuthProvider>
          {children}
        </AuthProvider>
      </ThemeProvider>
    </GoogleOAuthProvider>
  );
}
