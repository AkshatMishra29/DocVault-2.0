import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../features/auth/components/ProtectedRoute";
import AppLayout from "../components/layout/AppLayout";

import LandingPage from "../features/landing/LandingPage";
import LoginPage from "../features/auth/pages/LoginPage";
import RegisterPage from "../features/auth/pages/RegisterPage";
import VerifyOtpPage from "../features/auth/pages/VerifyOtpPage";
import EnterPinPage from "../features/auth/pages/EnterPinPage";
import AuthVerifiedPage from "../features/auth/pages/AuthVerifiedPage";

import HomePage from "../features/dashboard/HomePage";
import DocumentsPage from "../features/documents/DocumentsPage";
import DocumentDetailPage from "../features/documents/DocumentDetailPage";
import ConnectionsPage from "../features/sharing/ConnectionsPage";
import ShareCenterPage from "../features/sharing/ShareCenterPage";
import SharedDocumentViewerPage from "../features/sharing/SharedDocumentViewerPage";
import AskAiPage from "../features/ai-assistant/AskAiPage";
import AssetsPage from "../features/assets/AssetsPage";
import AssetDetailPage from "../features/assets/AssetDetailPage";
import BankStatementsPage from "../features/assets/BankStatementsPage";
import DeadlinesPage from "../features/deadlines/DeadlinesPage";
import UploadPage from "../features/upload/UploadPage";
import MorePage from "../features/dashboard/MorePage";
import AdminDashboardPage from "../features/admin/AdminDashboardPage";

import IntelligenceDashboardPage from "../features/intelligence/IntelligenceDashboardPage";
import EntityExplorerPage from "../features/intelligence/EntityExplorerPage";
import EntityDetailPage from "../features/intelligence/EntityDetailPage";
import AlertsCenterPage from "../features/intelligence/AlertsCenterPage";
import ConflictsCenterPage from "../features/intelligence/ConflictsCenterPage";

export function AppRoutes() {
  return (
    <Routes>
      {/* Public Marketing Landing Page / Mobile App Gateway */}
      <Route path="/" element={<LandingPage />} />

      {/* Public Auth Routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-otp" element={<VerifyOtpPage />} />
      <Route path="/enter-pin" element={<EnterPinPage />} />
      <Route path="/auth/verify" element={<AuthVerifiedPage />} />

      {/* Authenticated Application Shell */}
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
        <Route path="/connections" element={<ConnectionsPage />} />
        <Route path="/shares" element={<ShareCenterPage />} />
        <Route path="/shares/:id/view" element={<SharedDocumentViewerPage />} />
        <Route path="/ask-ai" element={<AskAiPage />} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="/assets/:id" element={<AssetDetailPage />} />
        <Route path="/banking" element={<BankStatementsPage />} />
        <Route path="/deadlines" element={<DeadlinesPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/intelligence" element={<IntelligenceDashboardPage />} />
        <Route path="/intelligence/entities" element={<EntityExplorerPage />} />
        <Route path="/intelligence/entities/:id" element={<EntityDetailPage />} />
        <Route path="/intelligence/alerts" element={<AlertsCenterPage />} />
        <Route path="/intelligence/conflicts" element={<ConflictsCenterPage />} />
        <Route path="/more" element={<MorePage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/dashboard/admin" element={<AdminDashboardPage />} />
      </Route>

      {/* Catch-all Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
