import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Zap, LayoutDashboard, BarChart3, Users, Mail, TrendingUp, Settings } from "lucide-react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/campaigns", label: "Campaigns", icon: BarChart3 },
  { to: "/leads",     label: "Contacts",  icon: Users },
  { to: "/templates", label: "Templates", icon: Mail },
  { to: "/analytics", label: "Analytics", icon: TrendingUp },
  { to: "/settings",  label: "Settings",  icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen w-[200px] flex-col bg-[var(--color-surface-1)]"
      style={{ borderRight: "1px solid rgba(255,255,255,0.055)" }}
    >
      {/* Cyan accent bar */}
      <div
        className="h-[3px] w-full shrink-0"
        style={{
          background:
            "linear-gradient(90deg, var(--color-accent) 0%, var(--color-accent-bright) 55%, transparent 100%)",
        }}
      />

      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <motion.div
          whileHover={{ scale: 1.08 }}
          transition={{ type: "spring", stiffness: 500, damping: 20 }}
          className="flex h-7 w-7 shrink-0 items-center justify-center"
          style={{ background: "var(--color-accent)", borderRadius: "5px" }}
        >
          <Zap size={14} className="text-[var(--color-surface-0)]" strokeWidth={2.5} />
        </motion.div>
        <div>
          <span className="block text-[13px] font-bold tracking-tight text-[var(--color-ink-primary)]">
            OutboundEngine
          </span>
          <span className="block font-mono text-[9px] uppercase tracking-widest text-[var(--color-ink-muted)]">
            AI Outreach
          </span>
        </div>
      </div>

      {/* Section label */}
      <p className="px-4 pb-1 font-mono text-[9px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
        Workspace
      </p>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-px px-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive = location.pathname.startsWith(to);

          return (
            <NavLink
              key={to}
              to={to}
              className="relative flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium"
              style={{ borderRadius: "4px" }}
            >
              {({ isActive: navActive }) => {
                const active = navActive || isActive;
                return (
                  <>
                    {active && (
                      <motion.div
                        layoutId="sidebar-active"
                        className="absolute inset-0"
                        style={{
                          borderRadius: "4px",
                          background:
                            "linear-gradient(90deg, rgba(0,180,216,0.13) 0%, rgba(0,180,216,0.02) 100%)",
                          borderLeft: "2px solid var(--color-accent)",
                        }}
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}
                    <Icon
                      size={14}
                      strokeWidth={active ? 2.2 : 1.7}
                      className="relative z-10 shrink-0"
                      style={{
                        color: active ? "var(--color-accent)" : "var(--color-ink-tertiary)",
                      }}
                    />
                    <span
                      className="relative z-10"
                      style={{
                        color: active ? "var(--color-ink-primary)" : "var(--color-ink-secondary)",
                      }}
                    >
                      {label}
                    </span>
                  </>
                );
              }}
            </NavLink>
          );
        })}

      </nav>

      {/* Footer */}
      <div className="px-4 py-3.5" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
            style={{ background: "rgba(0,180,216,0.15)", color: "var(--color-accent)" }}
          >
            U
          </div>
          <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">v1.0.0</span>
        </div>
      </div>
    </aside>
  );
}
