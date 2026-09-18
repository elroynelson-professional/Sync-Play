"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";
import { socketUrl } from "../lib/socket";

type UserSearchResult = {
  id: string;
  name: string;
  email: string;
  relationship: "friend" | "pending" | "incoming" | "none";
};

type AppShellProps = {
  children: ReactNode;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  searchPlaceholder: string;
  user: { name: string; email: string; profileImage?: string | null };
  onInbox: () => void;
  onAccountSettings: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onHelp: () => void;
  onLogout: () => void;
  hasUnread?: boolean;
  isSettingsOpen?: boolean;
  onDashboardClick?: () => void;
};

export function AppShell({ children, searchTerm, onSearchTermChange, searchPlaceholder, user, onInbox, onAccountSettings, onCreateRoom, onJoinRoom, onHelp, onLogout, hasUnread, isSettingsOpen, onDashboardClick }: AppShellProps) {
  const pathname = usePathname();
  const [userSearchResults, setUserSearchResults] = useState<UserSearchResult[]>([]);
  const [friendRequestPendingId, setFriendRequestPendingId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const query = searchTerm.trim();
    if (query.length < 2) {
      setUserSearchResults([]);
      return;
    }

    const controller = new AbortController();
    const searchTimer = window.setTimeout(() => {
      fetch(`${socketUrl}/api/users/search?q=${encodeURIComponent(query)}`, { credentials: "include", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) return;
          const payload = (await response.json()) as { users?: UserSearchResult[] };
          setUserSearchResults(payload.users || []);
        })
        .catch(() => undefined);
    }, 220);

    return () => {
      window.clearTimeout(searchTimer);
      controller.abort();
    };
  }, [searchTerm]);

  async function addFriend(email: string) {
    const result = userSearchResults.find((item) => item.email === email);
    if (!result) return;

    setFriendRequestPendingId(result.id);
    try {
      const response = await fetch(`${socketUrl}/api/friends/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setUserSearchResults((current) => current.map((item) => item.id === result.id ? { ...item, relationship: "pending" } : item));
      }
    } finally {
      setFriendRequestPendingId(null);
    }
  }

  const mobileNavItems = [
    { label: "Dashboard", href: "/dashboard", icon: "▣" },
    { label: "Friends", href: "/friends", icon: "◫" },
    { label: "History", href: "/history", icon: "◌" },
  ];

  return (
    <main className="syncplay-auth-shell min-h-screen bg-black p-0 text-white">
      <div className="mx-auto flex h-screen max-h-screen w-full overflow-hidden bg-[#050505]">
        <AppSidebar onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} onHelp={onHelp} onLogout={onLogout} isSettingsOpen={isSettingsOpen} onDashboardClick={onDashboardClick} />
        <div className="flex min-h-0 flex-1 flex-col bg-[#050505] px-3 py-3 sm:px-4 md:px-5 md:py-5">
          <div className="mb-3 md:hidden">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((current) => !current)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#0d0d0d] text-xl text-slate-200"
                aria-label="Toggle navigation menu"
              >
                ☰
              </button>
              <div className="flex-1 text-left">
                <div className="text-[2.2rem] font-semibold tracking-[-0.08em] text-white leading-none">Sykonyx</div>
              </div>
            </div>

            {mobileMenuOpen ? (
              <div
                className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
                onClick={() => setMobileMenuOpen(false)}
              >
                <div
                  className="h-full w-[92vw] max-w-[420px] bg-[#090909] px-5 py-4 shadow-2xl shadow-black/60"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div className="text-[2.2rem] font-semibold tracking-[-0.08em] text-white">Sykonyx</div>
                    <button
                      type="button"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xl text-slate-200"
                      aria-label="Close navigation menu"
                    >
                      ×
                    </button>
                  </div>

                  <div className="mb-4 text-[0.8rem] font-semibold uppercase tracking-[0.25em] text-slate-400">Menu</div>
                  <nav className="space-y-3">
                    {mobileNavItems.map((item) => {
                      const isActive = pathname === item.href && !(isSettingsOpen && item.href === "/dashboard");
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[1.05rem] font-medium transition ${isActive ? "bg-white/8 text-emerald-300" : "text-slate-200 hover:bg-white/5"}`}
                        >
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center text-[0.8rem] ${isActive ? "text-emerald-300" : "text-slate-400"}`}>{item.icon}</span>
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </nav>

                  <div className="mt-6 space-y-3">
                    <button type="button" onClick={() => { onCreateRoom(); setMobileMenuOpen(false); }} className="w-full rounded-[1.1rem] bg-emerald-500 px-4 py-4 text-[1.05rem] font-semibold text-[#03150a]">
                      Create room
                    </button>
                    <button type="button" onClick={() => { onJoinRoom(); setMobileMenuOpen(false); }} className="w-full rounded-[1.1rem] border border-white/10 bg-white/5 px-4 py-4 text-[1.05rem] font-semibold text-white">
                      Join room
                    </button>
                  </div>

                  <div className="mt-8 border-t border-white/10 pt-5">
                    <div className="mb-4 text-[0.8rem] font-semibold uppercase tracking-[0.25em] text-slate-400">General</div>
                    <div className="space-y-3">
                      <button type="button" onClick={() => { onHelp?.(); setMobileMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[1.05rem] font-medium text-slate-200 hover:bg-white/5">
                        <span className="flex h-4 w-4 items-center justify-center text-[1rem] text-slate-300">?</span>
                        <span>Help</span>
                      </button>
                      <button type="button" onClick={() => { onLogout(); setMobileMenuOpen(false); }} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[1.05rem] font-medium text-slate-200 hover:bg-white/5">
                        <span className="flex h-4 w-4 items-center justify-center text-[1rem] text-slate-300">↪</span>
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <TopBar searchTerm={searchTerm} onSearchTermChange={onSearchTermChange} searchPlaceholder={searchPlaceholder} user={user} onInbox={onInbox} onAccountSettings={onAccountSettings} hasUnread={hasUnread} userSearchResults={userSearchResults} onAddFriend={addFriend} friendRequestPendingId={friendRequestPendingId} />
          <div className="mt-4 flex-1 overflow-y-auto overflow-x-hidden pb-2 pr-0 md:pr-1">{children}</div>
        </div>
      </div>
    </main>
  );
}
