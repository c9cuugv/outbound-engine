import { NavLink } from "react-router-dom";
import { Users, Send, Sparkles } from "lucide-react";

const NAV = [
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/campaigns", label: "Campaigns", icon: Send },
  { to: "/quick-draft", label: "Quick Draft", icon: Sparkles },
];

export default function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[228px] flex-col border-r border-line bg-surface">
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-5">
        <span className="grid h-6 w-6 place-items-center rounded bg-accent text-[13px] font-bold text-on-accent">
          O
        </span>
        <span className="text-[14px] font-semibold tracking-tight text-ink">OutboundEngine</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-3">
        <p className="label-overline px-2 pb-1.5 pt-2">Workspace</p>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[14px] transition-colors ${
                isActive
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink-muted hover:bg-raised hover:text-ink"
              }`
            }
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
