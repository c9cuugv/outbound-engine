import type { ReactNode, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes } from "react";

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border border-line bg-surface ${padded ? "p-5" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-semibold leading-9 tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

const FIELD =
  "w-full rounded-md border border-line bg-canvas px-3 text-[14px] text-ink placeholder:text-ink-subtle transition-colors hover:border-line-strong focus:border-accent focus:outline-none disabled:opacity-45";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${FIELD} h-9 ${className}`} {...rest} />;
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${FIELD} py-2 leading-6 ${className}`} {...rest} />;
}

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${FIELD} h-9 ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[12px] text-ink-subtle">{hint}</span>}
    </label>
  );
}

/** Dense data table. Horizontal overflow scrolls inside the card, never the page. */
export function Table({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead className="bg-surface">
          <tr className="border-b border-line">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const Th = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <th className={`label-overline px-4 py-2.5 font-semibold ${className}`}>{children}</th>
);

export const Td = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <td className={`px-4 py-2.5 text-[13px] ${className}`}>{children}</td>
);

export const Tr = ({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) => (
  <tr
    onClick={onClick}
    className={`border-b border-line/60 bg-canvas transition-colors last:border-0 ${
      onClick ? "cursor-pointer hover:bg-raised" : ""
    }`}
  >
    {children}
  </tr>
);

/** Single headline number. Used across dashboard and campaign list. */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <Card>
      <p className="label-overline">{label}</p>
      <p className="mt-1.5 text-[26px] font-semibold leading-8 tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-ink-subtle">{sub}</p>}
    </Card>
  );
}
