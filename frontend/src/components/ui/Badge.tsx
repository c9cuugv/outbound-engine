import type { ReactNode } from "react";

type Variant = "gray" | "yellow" | "green" | "red" | "orange" | "info" | "accent";

const VARIANT_CLASSES: Record<Variant, string> = {
  gray: "bg-[var(--color-badge-gray)] text-gray-300",
  yellow: "bg-[var(--color-badge-yellow)] text-amber-300",
  green: "bg-[var(--color-badge-green)] text-emerald-300",
  red: "bg-[var(--color-badge-red)] text-red-300",
  orange: "bg-[var(--color-badge-orange)] text-orange-300",
  info: "bg-[var(--color-info-dim)] text-blue-400",
  accent: "bg-[var(--color-accent-dim)] text-[var(--color-accent)]",
};

interface BadgeProps {
  variant?: Variant;
  children: ReactNode;
  className?: string;
}

export default function Badge({ variant = "gray", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Map research/lead statuses to badge variants */
export function statusVariant(
  status: string,
): Variant {
  const map: Record<string, Variant> = {
    pending: "gray",
    new: "gray",
    draft: "gray",
    in_progress: "yellow",
    generating: "yellow",
    completed: "green",
    active: "green",
    approved: "green",
    sent: "info",
    failed: "red",
    bounced: "red",
    needs_review: "orange",
    review: "orange",
    paused: "yellow",
    replied: "accent",
  };
  return map[status] ?? "gray";
}
