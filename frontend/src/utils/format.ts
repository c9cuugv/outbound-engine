export const pct = (num: number, denom: number): string =>
  denom === 0 ? "0%" : `${((num / denom) * 100).toFixed(1)}%`;

export const relativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

export const fmtNumber = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
