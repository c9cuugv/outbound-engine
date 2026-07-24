/*
 * Recharts takes colours as plain string props (stroke, fill, contentStyle) and
 * cannot consume Tailwind classes. Rather than hardcode hex values at each call
 * site — which is exactly how the previous UI drifted away from its tokens —
 * this resolves them from the CSS custom properties at runtime, so
 * styles/globals.css stays the single source of truth.
 */

const read = (token: string, fallback: string): string => {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || fallback;
};

/* Fallbacks mirror globals.css and only apply if the sheet has not parsed yet. */
export const chartTheme = {
  get axis() {
    return read("--color-ink-subtle", "#6b737e");
  },
  get grid() {
    return read("--color-line", "#252a31");
  },
  get surface() {
    return read("--color-raised", "#1a1e23");
  },
  get sent() {
    return read("--color-accent", "#4c8dff");
  },
  get opened() {
    return read("--color-success", "#3fb950");
  },
  get replied() {
    return read("--color-warning", "#d29922");
  },
};
