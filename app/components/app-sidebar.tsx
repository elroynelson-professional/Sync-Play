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
    <button type="button" onClick={onClick} className={`${sidebarItemClass} text-[var(--foreground)] hover:bg-[var(--soft-background)]`}>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[11px] text-[var(--muted)]">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

export function AppSidebar({ onCreateRoom, onJoinRoom, onHelp, onLogout, isSettingsOpen = false, onDashboardClick }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[240px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] px-4 py-5 md:flex">
      <div className="mb-6 px-2">
        <div className="text-[1.7rem] font-semibold tracking-[-0.06em] text-[var(--foreground)]">Sykonyx</div>
      </div>

      <nav aria-label="Primary navigation" className="space-y-1.5 text-sm">
        <div className="mb-3 px-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">Menu</div>
        {navItems.map((item) => {
          const isActive = pathname === item.href && !(isSettingsOpen && item.href === "/dashboard");

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={item.href === "/dashboard" ? onDashboardClick : undefined}
              className={`${sidebarItemClass} ${
                isActive ? "bg-[var(--soft-background)] text-emerald-600 shadow-[inset_0_0_0_1px_rgba(29,157,95,0.12)]" : "text-[var(--foreground)] hover:bg-[var(--soft-background)]"
              }`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center text-[11px] ${isActive ? "text-emerald-600" : "text-[var(--muted)]"}`}>{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 space-y-3 pb-4 text-sm">
        <button type="button" onClick={onCreateRoom} className="w-full rounded-[16px] bg-emerald-500 px-4 py-3 text-[1.1rem] font-semibold text-[#03150a] shadow-[0_0_0_1px_rgba(16,185,129,0.18)] transition hover:bg-emerald-400">
          Create room
        </button>
        <button type="button" onClick={onJoinRoom} className="w-full rounded-[16px] border border-[var(--border)] bg-[var(--control-background)] px-4 py-3 text-[1.1rem] font-semibold text-[var(--foreground)] transition hover:bg-[var(--control-background-hover)]">
          Join room
        </button>
      </div>

      <div className="mt-auto space-y-3 text-sm">
        <div className="mb-3 px-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">General</div>
        <SidebarAction label="Help" icon="?" onClick={onHelp} />
        <SidebarAction label="Logout" icon="↪" onClick={onLogout} />
      </div>
    </aside>
  );
}
