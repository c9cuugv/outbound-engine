import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import LoginPage from "./pages/LoginPage";

const LeadTable = lazy(() => import("./pages/LeadTable"));
const CampaignWizard = lazy(() => import("./pages/CampaignWizard"));
const EmailReviewQueue = lazy(() => import("./pages/EmailReviewQueue"));
const CampaignDashboard = lazy(() => import("./pages/CampaignDashboard"));

function PageSkeleton() {
  return (
    <div className="space-y-4 py-2">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="skeleton h-6 w-36 rounded-md" />
          <div className="skeleton h-3.5 w-24 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-8 w-24 rounded-lg" />
          <div className="skeleton h-8 w-28 rounded-lg" />
        </div>
      </div>
      {/* Filter bar skeleton */}
      <div className="flex gap-3">
        <div className="skeleton h-9 flex-1 rounded-lg" />
        <div className="skeleton h-9 w-32 rounded-lg" />
        <div className="skeleton h-9 w-32 rounded-lg" />
      </div>
      {/* Table skeleton */}
      <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[var(--color-surface-1)]">
        <div className="border-b border-white/[0.06] px-4 py-3">
          <div className="flex gap-6">
            {[80, 140, 100, 90, 70, 80, 70].map((w, i) => (
              <div key={i} className="skeleton h-3.5 rounded" style={{ width: w }} />
            ))}
          </div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-6 border-b border-white/[0.03] px-4 py-3"
            style={{ opacity: 1 - i * 0.1 }}
          >
            <div className="skeleton h-3.5 w-28 rounded" />
            <div className="skeleton h-3 w-40 rounded" />
            <div className="skeleton h-3.5 w-24 rounded" />
            <div className="skeleton h-3.5 w-20 rounded" />
            <div className="skeleton h-5 w-16 rounded-full" />
            <div className="skeleton h-5 w-20 rounded-full" />
            <div className="skeleton h-3 w-16 rounded" />
          </div>
        ))}
      </div>
    </div>
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
            <Suspense fallback={<PageSkeleton />}>
              <LeadTable />
            </Suspense>
          }
        />
        <Route
          path="/campaigns/new"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <CampaignWizard />
            </Suspense>
          }
        />
        <Route
          path="/campaigns/:id/review"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <EmailReviewQueue />
            </Suspense>
          }
        />
        <Route
          path="/campaigns/:id/dashboard"
          element={
            <Suspense fallback={<PageSkeleton />}>
              <CampaignDashboard />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
