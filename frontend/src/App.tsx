import { lazy, Suspense, Component, type ReactNode } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import LoginPage from "./pages/LoginPage";
import { SkeletonRows, ErrorState } from "./components/ui/Feedback";

const LeadTable = lazy(() => import("./pages/LeadTable"));
const CampaignList = lazy(() => import("./pages/CampaignList"));
const CampaignBuilder = lazy(() => import("./pages/CampaignBuilder"));
const EmailReviewQueue = lazy(() => import("./pages/EmailReviewQueue"));
const CampaignDashboard = lazy(() => import("./pages/CampaignDashboard"));
const LeadTimeline = lazy(() => import("./pages/LeadTimeline"));
const QuickDraft = lazy(() => import("./pages/QuickDraft"));

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <ErrorState error={this.state.error} onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

/** Every lazy route gets the same boundary + fallback treatment. */
function Page({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<SkeletonRows rows={6} />}>{children}</Suspense>
    </ErrorBoundary>
  );
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
            <Page>
              <LeadTable />
            </Page>
          }
        />
        <Route
          path="/campaigns"
          element={
            <Page>
              <CampaignList />
            </Page>
          }
        />
        <Route
          path="/campaigns/new"
          element={
            <Page>
              <CampaignBuilder />
            </Page>
          }
        />
        <Route
          path="/campaigns/:id/review"
          element={
            <Page>
              <EmailReviewQueue />
            </Page>
          }
        />
        <Route
          path="/campaigns/:id/dashboard"
          element={
            <Page>
              <CampaignDashboard />
            </Page>
          }
        />
        <Route
          path="/campaigns/:id/leads/:leadId"
          element={
            <Page>
              <LeadTimeline />
            </Page>
          }
        />
        <Route
          path="/quick-draft"
          element={
            <Page>
              <QuickDraft />
            </Page>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/leads" replace />} />
    </Routes>
  );
}
