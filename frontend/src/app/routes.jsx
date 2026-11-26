import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../features/auth/components/ProtectedRoute";
import AppLayout from "../components/layout/AppLayout";

// Eagerly loaded public entry & auth routes for instant first-paint
import LandingPage from "../features/landing/LandingPage";
import LoginPage from "../features/auth/pages/LoginPage";
import RegisterPage from "../features/auth/pages/RegisterPage";
import VerifyOtpPage from "../features/auth/pages/VerifyOtpPage";
import EnterPinPage from "../features/auth/pages/EnterPinPage";
import AuthVerifiedPage from "../features/auth/pages/AuthVerifiedPage";

// Lazy-loaded feature modules for optimal mobile bundle size & fast initial load
const HomePage = React.lazy(() => import("../features/dashboard/HomePage"));
const DocumentsPage = React.lazy(() => import("../features/documents/DocumentsPage"));
const DocumentDetailPage = React.lazy(() => import("../features/documents/DocumentDetailPage"));
const ConnectionsPage = React.lazy(() => import("../features/sharing/ConnectionsPage"));
const ShareCenterPage = React.lazy(() => import("../features/sharing/ShareCenterPage"));
const SharedDocumentViewerPage = React.lazy(() => import("../features/sharing/SharedDocumentViewerPage"));
const AskAiPage = React.lazy(() => import("../features/ai-assistant/AskAiPage"));
const CopilotBetaPage = React.lazy(() => import("../features/copilot-beta/CopilotBetaPage"));
const AssetsPage = React.lazy(() => import("../features/assets/AssetsPage"));
const AssetDetailPage = React.lazy(() => import("../features/assets/AssetDetailPage"));
const BankStatementsPage = React.lazy(() => import("../features/assets/BankStatementsPage"));
const DeadlinesPage = React.lazy(() => import("../features/deadlines/DeadlinesPage"));
const UploadPage = React.lazy(() => import("../features/upload/UploadPage"));
const MorePage = React.lazy(() => import("../features/dashboard/MorePage"));
const AdminDashboardPage = React.lazy(() => import("../features/admin/AdminDashboardPage"));

const IntelligenceDashboardPage = React.lazy(() => import("../features/intelligence/IntelligenceDashboardPage"));
const EntityExplorerPage = React.lazy(() => import("../features/intelligence/EntityExplorerPage"));
const EntityDetailPage = React.lazy(() => import("../features/intelligence/EntityDetailPage"));
const AlertsCenterPage = React.lazy(() => import("../features/intelligence/AlertsCenterPage"));
const ConflictsCenterPage = React.lazy(() => import("../features/intelligence/ConflictsCenterPage"));

export function AppRoutes() {
  return (
    <React.Suspense fallback={<div className="dv-page-loading">Loading DocVault...</div>}>
      <Routes>
        {/* Public Marketing Landing Page / Mobile App Gateway */}
        <Route path="/" element={<LandingPage />} />

        {/* Public Auth Routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-otp" element={<VerifyOtpPage />} />
        <Route path="/enter-pin" element={<EnterPinPage />} />
        <Route path="/auth/verify" element={<AuthVerifiedPage />} />

        {/* Public Document Share Viewer Routes (Direct access via shared link / QR code) */}
        <Route path="/shares/:id/view" element={<SharedDocumentViewerPage />} />
        <Route path="/shares/access/:token" element={<SharedDocumentViewerPage />} />
        <Route path="/shares/:id" element={<SharedDocumentViewerPage />} />

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
          <Route path="/ask-ai" element={<AskAiPage />} />
          <Route path="/copilot-beta" element={<CopilotBetaPage />} />
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
    </React.Suspense>
  );
}
