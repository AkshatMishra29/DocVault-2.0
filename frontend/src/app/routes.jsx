import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../features/auth/components/ProtectedRoute";
import AppLayout from "../components/layout/AppLayout";

import LandingPage from "../features/landing/LandingPage";
import LoginPage from "../features/auth/pages/LoginPage";
import RegisterPage from "../features/auth/pages/RegisterPage";
import EnterPinPage from "../features/auth/pages/EnterPinPage";
import AuthVerifiedPage from "../features/auth/pages/AuthVerifiedPage";

import HomePage from "../features/dashboard/HomePage";
import DocumentsPage from "../features/documents/DocumentsPage";
import DocumentDetailPage from "../features/documents/DocumentDetailPage";
import AskAiPage from "../features/ai-assistant/AskAiPage";
import AssetsPage from "../features/assets/AssetsPage";
import DeadlinesPage from "../features/deadlines/DeadlinesPage";
import UploadPage from "../features/upload/UploadPage";
import MorePage from "../features/dashboard/MorePage";

export function AppRoutes() {
  return (
    <Routes>
      {/* Public Marketing Landing Page */}
      <Route path="/" element={<LandingPage />} />

      {/* Public Auth Routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/enter-pin" element={<EnterPinPage />} />
      <Route path="/auth/verify" element={<AuthVerifiedPage />} />

      {/* Backward Compatibility & Authenticated Application Shell */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<HomePage />} />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/documents/:id" element={<DocumentDetailPage />} />
        <Route path="/ask-ai" element={<AskAiPage />} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/deadlines" element={<DeadlinesPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/more" element={<MorePage />} />
      </Route>

      {/* Wildcard Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
