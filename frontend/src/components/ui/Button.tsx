import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-[var(--color-surface-0)] font-semibold hover:bg-[var(--color-accent-hover)] active:scale-[0.97]",
  secondary:
    "bg-white/[0.06] text-[var(--color-ink-primary)] border border-white/[0.08] hover:bg-white/[0.1]",
  ghost:
    "text-[var(--color-ink-secondary)] hover:text-[var(--color-ink-primary)] hover:bg-white/[0.04]",
  danger:
    "bg-[var(--color-danger-dim)] text-red-400 border border-red-500/20 hover:bg-red-500/20",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-8 px-3 text-[12px] gap-1.5 rounded",
  md: "h-9 px-4 text-[13px] gap-2 rounded-md",
  lg: "h-11 px-6 text-[14px] gap-2.5 rounded-md",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-medium transition-all disabled:pointer-events-none disabled:opacity-40 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
