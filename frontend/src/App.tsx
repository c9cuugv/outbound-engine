import { lazy, Suspense, Component, type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import LoginPage from "./pages/LoginPage";

const LeadTable = lazy(() => import("./pages/LeadTable"));
const CampaignList = lazy(() => import("./pages/CampaignList"));
const CampaignBuilder = lazy(() => import("./pages/CampaignBuilder"));
const EmailReviewQueue = lazy(() => import("./pages/EmailReviewQueue"));
const CampaignDashboard = lazy(() => import("./pages/CampaignDashboard"));

function PageSkeleton() {
  return (
    <div className="flex h-[50vh] items-center justify-center">
      <div className="skeleton h-8 w-8 rounded-full" />
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[50vh] flex-col items-center justify-center gap-3">
          <p className="text-[13px] text-[var(--color-danger)]">Something went wrong.</p>
          <button
            className="text-[13px] underline"
            onClick={() => this.setState({ hasError: false })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/leads" replace />} />
        <Route
          path="/leads"
          element={
            <ErrorBoundary>
              <Suspense fallback={<PageSkeleton />}>
                <LeadTable />
              </Suspense>
            </ErrorBoundary>
          }
        />
        <Route
          path="/campaigns"
          element={
            <ErrorBoundary>
              <Suspense fallback={<PageSkeleton />}>
                <CampaignList />
              </Suspense>
            </ErrorBoundary>
          }
        />
        <Route
          path="/campaigns/new"
          element={
            <ErrorBoundary>
              <Suspense fallback={<PageSkeleton />}>
                <CampaignBuilder />
              </Suspense>
            </ErrorBoundary>
          }
        />
        <Route
          path="/campaigns/:id/review"
          element={
            <ErrorBoundary>
              <Suspense fallback={<PageSkeleton />}>
                <EmailReviewQueue />
              </Suspense>
            </ErrorBoundary>
          }
        />
        <Route
          path="/campaigns/:id/dashboard"
          element={
            <ErrorBoundary>
              <Suspense fallback={<PageSkeleton />}>
                <CampaignDashboard />
              </Suspense>
            </ErrorBoundary>
          }
        />
      </Route>
    </Routes>
  );
}
