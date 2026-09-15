"use client";

import type { ReactNode } from "react";
import { AppSidebar } from "./app-sidebar";
import { TopBar } from "./top-bar";

type AppShellProps = {
  children: ReactNode;
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  searchPlaceholder: string;
  user: { name: string; email: string };
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
  return (
    <main className="min-h-screen bg-black p-0 text-white">
      <div className="mx-auto flex h-screen max-h-screen w-full overflow-hidden bg-[#050505]">
        <AppSidebar onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} onHelp={onHelp} onLogout={onLogout} isSettingsOpen={isSettingsOpen} onDashboardClick={onDashboardClick} />
        <div className="flex min-h-0 flex-1 flex-col bg-[#050505] px-4 py-4 md:px-5 md:py-5">
          <TopBar searchTerm={searchTerm} onSearchTermChange={onSearchTermChange} searchPlaceholder={searchPlaceholder} user={user} onInbox={onInbox} onAccountSettings={onAccountSettings} hasUnread={hasUnread} />
          <div className="mt-4 flex-1 overflow-y-auto pr-1 pb-2">{children}</div>
        </div>
      </div>
    </main>
  );
}
