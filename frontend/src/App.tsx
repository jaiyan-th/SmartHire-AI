import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Primitives';
import type { UserRole } from '@/lib/types';
import { pageTransitionVariants } from '@/motion/system';

const LandingPage = lazy(() => import('@/pages/LandingPage'));
const AuthPage = lazy(() => import('@/pages/AuthPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const InterviewSetupPage = lazy(() => import('@/pages/InterviewSetupPage'));
const InterviewStudioPage = lazy(() => import('@/pages/InterviewStudioPage'));
const InsightsPage = lazy(() => import('@/pages/InsightsPage'));
const ResumePage = lazy(() => import('@/pages/ResumePage'));
const GrowthPage = lazy(() => import('@/pages/GrowthPage'));
const RecruiterPage = lazy(() => import('@/pages/RecruiterPage'));
const AdminPage = lazy(() => import('@/pages/AdminPage'));
const DossierPage = lazy(() => import('@/pages/DossierPage'));

function RouteLoader() {
  return (
    <div className="min-h-screen bg-canvas text-ink flex items-center justify-center">
      <div className="font-mono text-xs text-ink-muted">Loading workspace…</div>
    </div>
  );
}

function ProtectedRoute({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: UserRole;
}) {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <RouteLoader />;
  if (!isAuthenticated || !user) return <Navigate to="/auth" replace />;

  if (requiredRole) {
    const allowed =
      (requiredRole === 'admin' && user.role === 'admin') ||
      (requiredRole === 'recruiter' && (user.role === 'recruiter' || user.role === 'admin'));
    if (!allowed) {
      return (
        <AppShell title="Access Restricted">
          <div className="max-w-md mx-auto rounded-2xl border border-border bg-surface p-8 text-center space-y-4 my-12">
            <span className="font-mono text-xs px-2.5 py-1 rounded bg-red-50 text-red-700 border border-red-200">
              403 ACCESS RESTRICTED
            </span>
            <h2 className="font-display text-2xl font-medium">Insufficient Role Permissions</h2>
            <p className="text-sm text-ink-secondary">
              This workspace is restricted to authorized {requiredRole} accounts.
            </p>
            <Link to="/dashboard">
              <Button variant="primary">Return to Dashboard</Button>
            </Link>
          </div>
        </AppShell>
      );
    }
  }

  return <>{children}</>;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        variants={pageTransitionVariants}
        initial="initial"
        animate="enter"
        exit="exit"
      >
        <Suspense fallback={<RouteLoader />}>
          <Routes location={location}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<AuthPage />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/interview/setup"
              element={
                <ProtectedRoute>
                  <InterviewSetupPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/interview/room"
              element={
                <ProtectedRoute>
                  <InterviewStudioPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/interview/room/:sessionId"
              element={
                <ProtectedRoute>
                  <InterviewStudioPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/insights"
              element={
                <ProtectedRoute>
                  <InsightsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/resume"
              element={
                <ProtectedRoute>
                  <ResumePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/growth"
              element={
                <ProtectedRoute>
                  <GrowthPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dossier"
              element={
                <ProtectedRoute>
                  <DossierPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/recruiter"
              element={
                <ProtectedRoute requiredRole="recruiter">
                  <RecruiterPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminPage />
                </ProtectedRoute>
              }
            />

            {/* Legacy HTML path aliases */}
            <Route path="/index.html" element={<Navigate to="/" replace />} />
            <Route path="/home.html" element={<Navigate to="/dashboard" replace />} />
            <Route path="/interview.html" element={<Navigate to="/interview/setup" replace />} />
            <Route path="/resume.html" element={<Navigate to="/resume" replace />} />
            <Route path="/skill-gap.html" element={<Navigate to="/growth" replace />} />
            <Route path="/insights.html" element={<Navigate to="/insights" replace />} />
            <Route path="/recruiter.html" element={<Navigate to="/recruiter" replace />} />
            <Route path="/admin.html" element={<Navigate to="/admin" replace />} />
            <Route path="/report-download.html" element={<Navigate to="/dossier" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <BrowserRouter>
              <AnimatedRoutes />
            </BrowserRouter>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
