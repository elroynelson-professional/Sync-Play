"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../components/app-shell";
import { AuthPageLoading } from "../../components/auth-page-loading";
import { RoomView } from "../../components/room-view";
import { socketUrl } from "../../lib/socket";

const ACTIVE_USER_KEY = "syncplay-active-user-v1";

type AccountUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  profileImage?: string | null;
};

function normalizeStoredUser(value: Partial<AccountUser> | null | undefined): AccountUser | null {
  if (!value || !value.id || !value.name || !value.email) return null;

  return {
    id: value.id,
    name: value.name,
    email: value.email,
    createdAt: value.createdAt || new Date().toISOString(),
    profileImage: value.profileImage ?? null,
  };
}

function readActiveUser(): AccountUser | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(ACTIVE_USER_KEY);
    return raw ? normalizeStoredUser(JSON.parse(raw) as Partial<AccountUser>) : null;
  } catch {
    return null;
  }
}

export default function RoomPage() {
  return (
    <Suspense fallback={<AuthPageLoading />}>
      <RoomPageContent />
    </Suspense>
  );
}

function RoomPageContent() {
  const router = useRouter();
  const params = useParams<{ roomId: string }>();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;
  const initialName = searchParams.get("name") ? decodeURIComponent(searchParams.get("name")!) : "Guest";
  const initialRole = searchParams.get("role") === "host" ? "host" : "guest";
  const initialAction = searchParams.get("action") === "create" ? "create" : "join";
  const initialTitle = searchParams.get("title") ? decodeURIComponent(searchParams.get("title")!) : "Sykonyx shared room";
  const roomTheme = {
    accent: searchParams.get("accent") || "#5eead4",
    background: searchParams.get("background") || "#0f172a",
  };

  useEffect(() => {
    const activeUser = readActiveUser();
    if (activeUser) {
      setUser(activeUser);
      return;
    }

    fetch(`${socketUrl}/api/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          router.replace("/");
          return;
        }

        const payload = (await response.json()) as { user?: AccountUser };
        const nextUser = normalizeStoredUser(payload.user) || readActiveUser();
        if (!nextUser) {
          router.replace("/");
          return;
        }

        setUser(nextUser);
        window.localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(nextUser));
      })
      .catch(() => router.replace("/"));
  }, [router]);

  async function signOut() {
    await fetch(`${socketUrl}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACTIVE_USER_KEY);
    }

    setUser(null);
    router.push("/");
  }

  if (!user) {
    return <AuthPageLoading />;
  }

  return (
    <AppShell
      searchTerm={searchTerm}
      onSearchTermChange={setSearchTerm}
      searchPlaceholder="Search room"
      user={user}
      onInbox={() => router.push(`/dashboard?inbox=1&returnTo=${encodeURIComponent(`/room/${roomId}`)}`)}
      onAccountSettings={() => router.push("/dashboard?settings=1")}
      onCreateRoom={() => router.push("/dashboard/room?mode=create")}
      onJoinRoom={() => router.push("/dashboard/room?mode=join")}
      onHelp={() => router.push("/contact")}
      onLogout={signOut}
    >
      <RoomView
        roomId={roomId.toUpperCase()}
        initialName={initialName}
        initialRole={initialRole}
        initialAction={initialAction}
        initialTitle={initialTitle}
        theme={roomTheme}
      />
    </AppShell>
  );
}