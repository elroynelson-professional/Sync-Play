"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AppSidebarProps = {
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onAccountSettings: () => void;
  onHelp?: () => void;
  onLogout: () => void;
};

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "▣" },
  { label: "Friends", href: "/friends", icon: "◫" },
  { label: "History", href: "/history", icon: "◌" },
];

export function AppSidebar({ onCreateRoom, onJoinRoom, onAccountSettings, onHelp, onLogout }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[240px] shrink-0 flex-col border-r border-white/10 bg-[#090909] px-4 py-5 md:flex">
      <div className="mb-6 flex items-center gap-3 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-base font-semibold text-emerald-300">◔</div>
        <div className="text-[1.7rem] font-semibold tracking-[-0.06em] text-white">SyncPlay</div>
      </div>

      <nav aria-label="Primary navigation" className="space-y-1.5 text-sm">
        <div className="mb-3 px-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">Menu</div>
        {navItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${
                isActive ? "bg-white/6 text-emerald-300 shadow-inner shadow-emerald-500/5" : "text-slate-300 hover:bg-white/4"
              }`}
            >
              <span className={`flex h-4 w-4 items-center justify-center text-[10px] ${isActive ? "text-emerald-300" : "text-slate-400"}`}>{item.icon}</span>
              <span className="text-[15px] font-medium">{item.label}</span>
            </Link>
          );
        })}

        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <button type="button" onClick={onCreateRoom} className="block w-full rounded-xl bg-emerald-500 px-3 py-2.5 text-center text-sm font-medium text-[#03150a]">
            Create room
          </button>
          <button type="button" onClick={onJoinRoom} className="block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center text-sm font-medium text-white">
            Join room
          </button>
        </div>
      </nav>

      <div className="mt-auto space-y-3 text-sm">
        <div className="mb-3 px-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">General</div>
        <button type="button" onClick={onAccountSettings} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-slate-300 transition hover:bg-white/4">
          <span className="flex h-4 w-4 items-center justify-center text-[10px] text-slate-400">◌</span>
          <span className="text-[15px]">Account settings</span>
        </button>
        <button type="button" onClick={onHelp} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-slate-300 transition hover:bg-white/4">
          <span className="flex h-4 w-4 items-center justify-center text-[10px] text-slate-400">?</span>
          <span className="text-[15px]">Help</span>
        </button>
        <button type="button" onClick={onLogout} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-slate-300 transition hover:bg-white/4">
          <span className="flex h-4 w-4 items-center justify-center text-[10px] text-slate-400">↪</span>
          <span className="text-[15px]">Logout</span>
        </button>
      </div>
    </aside>
  );
}
