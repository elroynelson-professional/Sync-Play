"use client";

import { useEffect, useRef } from "react";

type TopBarProps = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  searchPlaceholder: string;
  user: {
    name: string;
    email: string;
  };
  onInbox: () => void;
  onAccountSettings: () => void;
  hasUnread?: boolean;
};

export function TopBar({
  searchTerm,
  onSearchTermChange,
  searchPlaceholder,
  user,
  onInbox,
  onAccountSettings,
  hasUnread = false,
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
      <div className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-[#0d0d0d] px-3 py-2.5 shadow-inner shadow-black/30">
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

      <div className="flex items-center gap-3">
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
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111111] text-[11px] font-semibold text-white">{(user.name || "G").slice(0, 2).toUpperCase()}</div>
          <div className="pr-1">
            <div className="text-[14px] font-medium text-white">{user.name}</div>
            <div className="text-[10px] text-slate-400">{user.email}</div>
          </div>
        </button>
      </div>
    </header>
  );
}
