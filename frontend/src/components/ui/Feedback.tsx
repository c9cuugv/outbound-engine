import type { ReactNode } from "react";
import Button from "./Button";

/*
 * DESIGN.md rule 6: every list has loading, empty, and error states.
 * They live together here so a page cannot ship one and forget the others.
 */

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink-subtle border-t-transparent ${className}`}
    />
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-11 rounded-md" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-14 text-center">
      <p className="text-[15px] font-medium text-ink">{title}</p>
      {hint && <p className="mt-1.5 max-w-sm text-[13px] text-ink-muted">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  // Surface what actually failed. A generic "something went wrong" gives the
  // operator nothing to act on.
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Request failed";

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-lg border border-danger/25 bg-danger-soft px-6 py-12 text-center"
    >
      <p className="text-[15px] font-medium text-danger">Something failed</p>
      <p className="mt-1.5 max-w-md font-mono text-[12px] text-ink-muted">{message}</p>
      {onRetry && (
        <Button className="mt-5" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
