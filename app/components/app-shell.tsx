"use client";

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
  const [userSearchResults, setUserSearchResults] = useState<UserSearchResult[]>([]);
  const [friendRequestPendingId, setFriendRequestPendingId] = useState<string | null>(null);

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

  return (
    <main className="syncplay-auth-shell min-h-screen bg-black p-0 text-white">
      <div className="mx-auto flex h-screen max-h-screen w-full overflow-hidden bg-[#050505]">
        <AppSidebar onCreateRoom={onCreateRoom} onJoinRoom={onJoinRoom} onHelp={onHelp} onLogout={onLogout} isSettingsOpen={isSettingsOpen} onDashboardClick={onDashboardClick} />
        <div className="flex min-h-0 flex-1 flex-col bg-[#050505] px-4 py-4 md:px-5 md:py-5">
          <TopBar searchTerm={searchTerm} onSearchTermChange={onSearchTermChange} searchPlaceholder={searchPlaceholder} user={user} onInbox={onInbox} onAccountSettings={onAccountSettings} hasUnread={hasUnread} userSearchResults={userSearchResults} onAddFriend={addFriend} friendRequestPendingId={friendRequestPendingId} />
          <div className="mt-4 flex-1 overflow-y-auto pr-1 pb-2">{children}</div>
        </div>
      </div>
    </main>
  );
}
