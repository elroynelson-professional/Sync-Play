"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AppSidebarProps = {
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onHelp?: () => void;
  onLogout: () => void;
  isSettingsOpen?: boolean;
  onDashboardClick?: () => void;
};

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "▣" },
  { label: "Friends", href: "/friends", icon: "◫" },
  { label: "History", href: "/history", icon: "◌" },
];

const sidebarItemClass = "flex min-h-10 w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-[15px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70";

function SidebarAction({ label, icon, onClick }: { label: string; icon: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`${sidebarItemClass} text-slate-300 hover:bg-white/4`}>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[11px] text-slate-400">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

export function AppSidebar({ onCreateRoom, onJoinRoom, onHelp, onLogout, isSettingsOpen = false, onDashboardClick }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[240px] shrink-0 flex-col border-r border-white/10 bg-[#090909] px-4 py-5 md:flex">
      <div className="mb-6 px-2">
        <div className="text-[1.7rem] font-semibold tracking-[-0.06em] text-white">Sykonyx</div>
      </div>

      <nav aria-label="Primary navigation" className="space-y-1.5 text-sm">
        <div className="mb-3 px-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">Menu</div>
        {navItems.map((item) => {
          const isActive = pathname === item.href && !(isSettingsOpen && item.href === "/dashboard");

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={item.href === "/dashboard" ? onDashboardClick : undefined}
              className={`${sidebarItemClass} ${
                isActive ? "bg-[#1a1d1d] text-emerald-300 shadow-[inset_0_0_0_1px_rgba(94,234,212,0.08)]" : "text-slate-300 hover:bg-white/4"
              }`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center text-[11px] ${isActive ? "text-emerald-300" : "text-slate-400"}`}>{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}

      </nav>

      <div className="mt-auto space-y-3 text-sm">
        <div className="mb-3 px-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">General</div>
        <SidebarAction label="Help" icon="?" onClick={onHelp} />
        <SidebarAction label="Logout" icon="↪" onClick={onLogout} />
      </div>
    </aside>
  );
}
