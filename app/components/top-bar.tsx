"use client";

import { useEffect, useRef } from "react";
import { ThemeToggle } from "./theme-toggle";

type TopBarProps = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  searchPlaceholder: string;
  user: {
    name: string;
    email: string;
    profileImage?: string | null;
  };
  onInbox: () => void;
  onAccountSettings: () => void;
  hasUnread?: boolean;
  userSearchResults?: { id: string; name: string; email: string; relationship: "friend" | "pending" | "incoming" | "none" }[];
  onAddFriend?: (email: string) => void;
  friendRequestPendingId?: string | null;
};

export function TopBar({
  searchTerm,
  onSearchTermChange,
  searchPlaceholder,
  user,
  onInbox,
  onAccountSettings,
  hasUnread = false,
  userSearchResults = [],
  onAddFriend,
  friendRequestPendingId = null,
}: TopBarProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  return (
    <header className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
      <div className="relative flex-1">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0d0d0d] px-3 py-2.5 shadow-inner shadow-black/30">
        <span className="text-base text-slate-400">⌕</span>
        <input
          ref={searchInputRef}
          type="search"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-slate-500"
        />
        <span className="hidden rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-medium text-slate-300 sm:inline">⌘F</span>
        </div>
        {searchTerm.trim().length >= 2 && userSearchResults.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#121212] shadow-2xl shadow-black/50">
            {userSearchResults.map((result) => (
              <div key={result.id} className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3 last:border-b-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">{result.name}</div>
                  <div className="truncate text-xs text-slate-400">{result.email}</div>
                </div>
                {result.relationship === "friend" ? (
                  <span className="shrink-0 text-xs text-emerald-300">Friends</span>
                ) : result.relationship === "pending" ? (
                  <span className="shrink-0 text-xs text-slate-400">Request sent</span>
                ) : result.relationship === "incoming" ? (
                  <span className="shrink-0 text-xs text-amber-300">Check requests</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAddFriend?.(result.email)}
                    disabled={friendRequestPendingId === result.id}
                    className="shrink-0 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-[#03150a] disabled:opacity-60"
                  >
                    {friendRequestPendingId === result.id ? "Sending..." : "Add friend"}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />
        <button
          type="button"
          onClick={onInbox}
          className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base text-slate-200 transition hover:bg-white/10"
          aria-label="Open inbox"
        >
          ✉
          {hasUnread ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#050505] bg-emerald-400" /> : null}
        </button>
        <button
          type="button"
          onClick={onAccountSettings}
          className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-left transition hover:bg-white/10"
          aria-label="Open account settings"
        >
          {user.profileImage ? (
            <img src={user.profileImage} alt={user.name} className="h-8 w-8 rounded-full object-cover ring-1 ring-white/10" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111111] text-[11px] font-semibold text-white">{(user.name || "G").slice(0, 2).toUpperCase()}</div>
          )}
          <div className="pr-1">
            <div className="text-[14px] font-medium text-white">{user.name}</div>
            <div className="text-[10px] text-slate-400">{user.email}</div>
          </div>
        </button>
      </div>
    </header>
  );
}
