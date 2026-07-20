import { NavLink, useLocation } from "react-router-dom";
import { Users, BarChart3, Zap, User, Sparkles } from "lucide-react";

const NAV_ITEMS = [
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/campaigns", label: "Campaigns", icon: BarChart3 },
  { to: "/quick-draft", label: "Quick Draft", icon: Sparkles },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-40 flex h-full w-[260px] flex-col border-r border-white/5 bg-surface-container/80 p-6 backdrop-blur-xl">
      {/* Brand */}
      <div className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary">
          <Zap size={18} className="text-on-primary" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="font-headline-sm text-headline-sm font-bold leading-tight tracking-tight text-primary-fixed">
            OutboundEngine
          </h1>
          <p className="font-label-md text-label-md uppercase tracking-widest text-on-surface-variant opacity-80" style={{ fontSize: '10px' }}>
            AI OUTREACH
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex flex-1 flex-col gap-1">
        <p className="font-label-sm text-label-sm mt-4 px-4 py-2 uppercase tracking-wider text-on-surface-variant opacity-60">
          WORKSPACE
        </p>

        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const isActive =
            to === "/leads"
              ? location.pathname === "/leads" || location.pathname === "/"
              : location.pathname.startsWith(to);

          return (
            <NavLink
              key={to}
              to={to}
              end={to === "/campaigns"}
              className={`flex items-center gap-3 rounded-r-lg px-4 py-2 font-label-md text-label-md transition-colors duration-200 ${
                isActive
                  ? "border-l-2 border-primary bg-primary/10 text-primary"
                  : "border-l-2 border-transparent text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface opacity-70"
              }`}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          );
        })}
      </div>

      {/* Bottom Profile/Settings */}
      <div className="mt-auto border-t border-white/5 pt-4">
        <a className="flex items-center gap-3 rounded-r-lg border-l-2 border-transparent px-4 py-2 font-label-md text-label-md text-on-surface-variant opacity-70 transition-colors duration-200 hover:bg-surface-container-high hover:text-on-surface" href="#">
          <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-surface-container-highest">
            <User size={14} className="text-on-surface-variant" />
          </div>
          <span>User Settings</span>
        </a>
      </div>
    </aside>
  );
}
