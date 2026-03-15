import { Loader2 } from "lucide-react";

interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

export default function Spinner({ size = 20, className = "", label }: SpinnerProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Loader2 size={size} className="animate-spin text-[var(--color-accent)]" />
      {label && (
        <span className="text-[13px] text-[var(--color-ink-secondary)]">{label}</span>
      )}
    </div>
  );
}

export function FullPageSpinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Spinner size={28} label={label} />
    </div>
  );
}
