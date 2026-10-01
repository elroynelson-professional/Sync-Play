"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../components/app-shell";
import { AuthPageLoading } from "../../components/auth-page-loading";
import { isRoomCodeValid, normalizeRoomCode } from "../../lib/room-validation";
import { socketUrl } from "../../lib/socket";

const ACTIVE_USER_KEY = "syncplay-active-user-v1";
const CUSTOM_ROOM_THEMES_KEY = "syncplay-custom-room-themes-v1";

type AccountUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  profileImage?: string | null;
};

type FriendContact = {
  id: string;
  name: string;
  profileImage?: string | null;
};

type RoomThemePreset = {
  id: string;
  name: string;
  accent: string;
  background: string;
  buttonColor?: string;
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

export default function DashboardRoomPage() {
  return (
    <Suspense fallback={<AuthPageLoading />}>
      <DashboardRoomPageContent />
    </Suspense>
  );
}

function DashboardRoomPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<AccountUser | null>(() => readActiveUser());
  const [searchTerm, setSearchTerm] = useState("");
  const [friendContacts, setFriendContacts] = useState<FriendContact[]>([]);
  const [roomDisplayName, setRoomDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState(searchParams.get("code") || "");
  const [roomTitle, setRoomTitle] = useState("");
  const [roomTheme, setRoomTheme] = useState("cinema");
  const [roomThemeCustom, setRoomThemeCustom] = useState("");
  const [roomThemeAccent, setRoomThemeAccent] = useState("#5eead4");
  const [roomThemeBackground, setRoomThemeBackground] = useState("#0f172a");
  const [roomThemeButtonColor, setRoomThemeButtonColor] = useState("#5eead4");
  const [roomSchedule, setRoomSchedule] = useState("");
  const [selectedInviteeIds, setSelectedInviteeIds] = useState<string[]>([]);
  const [customRoomThemes, setCustomRoomThemes] = useState<RoomThemePreset[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const parsed = JSON.parse(window.localStorage.getItem(CUSTOM_ROOM_THEMES_KEY) || "[]") as RoomThemePreset[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [activeRooms, setActiveRooms] = useState<Array<{ name: string; host: string; viewers: string; code: string; status: "Live" | "Idle" }>>([]);
  const [roomError, setRoomError] = useState("");
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);

  const mode = searchParams.get("mode") === "join" ? "join" : "create";
  const roomThemeOptions = [
    { value: "cinema", label: "Cinema noir" },
    { value: "focus", label: "Focus mode" },
    { value: "social", label: "Social lounge" },
    { value: "gaming", label: "Gaming arena" },
    { value: "custom", label: "Custom theme" },
    ...customRoomThemes.map((theme) => ({ value: `saved:${theme.id}`, label: theme.name })),
  ];

  const selectedRoomTheme = (() => {
    if (roomTheme.startsWith("saved:")) {
      const savedTheme = customRoomThemes.find((theme) => `saved:${theme.id}` === roomTheme);
      if (savedTheme) {
        return {
          name: savedTheme.name,
          accent: savedTheme.accent,
          background: savedTheme.background,
          buttonColor: savedTheme.buttonColor || savedTheme.accent,
        };
      }
    }

    if (roomTheme === "custom") {
      return {
        name: roomThemeCustom.trim() || "Custom theme",
        accent: roomThemeAccent,
        background: roomThemeBackground,
        buttonColor: roomThemeButtonColor,
      };
    }

    const presets: Record<string, { name: string; accent: string; background: string; buttonColor: string }> = {
      cinema: { name: "Cinema noir", accent: "#5eead4", background: "#0f172a", buttonColor: "#5eead4" },
      focus: { name: "Focus mode", accent: "#93c5fd", background: "#111827", buttonColor: "#93c5fd" },
      social: { name: "Social lounge", accent: "#f9a8d4", background: "#1f2937", buttonColor: "#f9a8d4" },
      gaming: { name: "Gaming arena", accent: "#a78bfa", background: "#140f2d", buttonColor: "#a78bfa" },
    };

    return presets[roomTheme] ?? presets.cinema;
  })();

  useEffect(() => {
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
        setRoomDisplayName(nextUser.name);
        window.localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(nextUser));

        const friendsResponse = await fetch(`${socketUrl}/api/friends`, { credentials: "include" });
        if (friendsResponse.ok) {
          const friendsPayload = (await friendsResponse.json()) as { friends?: FriendContact[] };
          setFriendContacts(friendsPayload.friends || []);
        }

        const dashboardResponse = await fetch(`${socketUrl}/api/dashboard`, { credentials: "include" });
        if (dashboardResponse.ok) {
          const dashboardPayload = (await dashboardResponse.json()) as { rooms?: Array<{ name: string; host: string; viewers: string; code: string; status: "Live" | "Idle" }> };
          setActiveRooms(dashboardPayload.rooms || []);
        }
      })
      .catch(() => router.replace("/"));
  }, [router]);

  function saveCustomRoomTheme() {
    const name = roomThemeCustom.trim();
    if (!name) {
      setRoomError("Give the custom theme a name before saving.");
      return;
    }

    const nextTheme: RoomThemePreset = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      accent: roomThemeAccent,
      background: roomThemeBackground,
      buttonColor: roomThemeButtonColor,
    };

    const nextThemes = [nextTheme, ...customRoomThemes].slice(0, 8);
    setCustomRoomThemes(nextThemes);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CUSTOM_ROOM_THEMES_KEY, JSON.stringify(nextThemes));
    }
    setRoomTheme(`saved:${nextTheme.id}`);
    setRoomError("");
  }

  function applySavedTheme(theme: RoomThemePreset) {
    setRoomTheme(`saved:${theme.id}`);
    setRoomThemeCustom(theme.name);
    setRoomThemeAccent(theme.accent);
    setRoomThemeBackground(theme.background);
    setRoomThemeButtonColor(theme.buttonColor || theme.accent);
  }

  function createRoom() {
    const name = roomDisplayName.trim();
    const title = roomTitle.trim();
    if (name.length < 2) {
      setRoomError("Add a valid display name first.");
      return;
    }
    if (title.length < 2) {
      setRoomError("Add a room title to create the room.");
      return;
    }

    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const theme = {
      name: selectedRoomTheme.name,
      accent: selectedRoomTheme.accent,
      background: selectedRoomTheme.background,
      buttonColor: selectedRoomTheme.buttonColor || selectedRoomTheme.accent,
    };
    const query = new URLSearchParams({
      linkVersion: "2",
      name,
      role: "host",
      action: "create",
      title,
      accent: theme.accent,
      background: theme.background,
      buttonColor: theme.buttonColor,
      schedule: roomSchedule,
    });

    router.push(`/room/${code}?${query.toString()}`);
  }

  async function joinRoom(codeOverride?: string) {
    const name = roomDisplayName.trim();
    const code = normalizeRoomCode(codeOverride ?? roomCode);

    if (name.length < 2) {
      setRoomError("Add a valid display name first.");
      return;
    }

    if (code.length < 4) {
      setRoomError("Room code needs at least 4 characters.");
      return;
    }

    if (!isRoomCodeValid(code)) {
      setRoomError("Invalid code, try again.");
      return;
    }

    if (codeOverride) {
      setRoomCode(code);
    }

    try {
      const response = await fetch(`${socketUrl}/api/rooms/${encodeURIComponent(code)}/exists`);
      const payload = (await response.json()) as { valid?: boolean };
      if (!response.ok || !payload.valid) {
        setRoomError("Invalid code, try again.");
        return;
      }
    } catch {
      setRoomError("Invalid code, try again.");
      return;
    }

    router.push(`/room/${code}?linkVersion=2&name=${encodeURIComponent(name)}&role=guest&action=join&title=${encodeURIComponent("Sykonyx shared room")}`);
  }

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
      onInbox={() => setIsInboxOpen((current) => !current)}
      onAccountSettings={() => setIsAccountSettingsOpen((current) => !current)}
      onCreateRoom={() => router.push("/dashboard/room?mode=create")}
      onJoinRoom={() => router.push("/dashboard/room?mode=join")}
      onHelp={() => router.push("/contact")}
      onLogout={signOut}
      hasUnread={false}
      isSettingsOpen={isAccountSettingsOpen}
      onDashboardClick={() => setIsAccountSettingsOpen(false)}
    >
      <section className={`mx-auto w-full pb-4 pt-2 ${mode === "create" ? "max-w-4xl" : "max-w-6xl"}`}>
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-emerald-600">Room flow</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.06em] text-[var(--foreground)]">
              {mode === "create" ? "Create a room" : "Join a room"}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="rounded-[14px] border border-[var(--border)] bg-[var(--soft-background)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--control-background-hover)]"
          >
            Back to dashboard
          </button>
        </div>

        <div className={`grid gap-5 ${mode === "join" ? "lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,360px)]" : ""}`}>
          <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-none">
            <div className={mode === "create" ? "grid grid-cols-1 gap-5 md:grid-cols-2" : "space-y-4"}>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-[var(--muted)]">Display name</span>
                <input value={roomDisplayName} onChange={(event) => setRoomDisplayName(event.target.value)} placeholder="Your display name" className="w-full rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-4 py-3 text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-emerald-400/60" />
              </label>

              {mode === "create" ? (
                <>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--muted)]">Room title</span>
                    <input value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} placeholder="Movie night, watch party, study session..." className="w-full rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-4 py-3 text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-emerald-400/60" />
                  </label>

                  <div className="grid min-w-0 gap-5 md:col-span-2 md:grid-cols-2">
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-[var(--muted)]">Room theme</span>
                      <select value={roomTheme} onChange={(event) => {
                        const value = event.target.value;
                        setRoomTheme(value);
                        if (value === "custom") {
                          setRoomThemeCustom("");
                          setRoomThemeAccent("#5eead4");
                          setRoomThemeBackground("#0f172a");
                          setRoomThemeButtonColor("#5eead4");
                          return;
                        }
                        if (value.startsWith("saved:")) {
                          const theme = customRoomThemes.find((item) => `saved:${item.id}` === value);
                          if (theme) applySavedTheme(theme);
                        }
                      }} className="w-full rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-4 py-3 text-base text-[var(--foreground)] outline-none focus:border-emerald-400/60">
                        {roomThemeOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-[var(--muted)]">Go live at</span>
                      <input type="datetime-local" value={roomSchedule} onChange={(event) => setRoomSchedule(event.target.value)} className="w-full rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-4 py-3 text-base text-[var(--foreground)] outline-none focus:border-emerald-400/60" />
                    </label>
                  </div>

                  {(roomTheme === "custom" || roomTheme.startsWith("saved:")) ? (
                    <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--soft-background)] p-4 md:col-span-2">
                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-[var(--muted)]">Theme name</span>
                        <input value={roomThemeCustom} onChange={(event) => setRoomThemeCustom(event.target.value)} placeholder="Midnight watch club" className="w-full rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-4 py-3 text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-emerald-400/60" />
                      </label>

                      <div className="grid gap-4 md:grid-cols-3">
                        <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-3 py-2.5 text-sm text-[var(--muted)]">
                          <span>Accent</span>
                          <input type="color" value={roomThemeAccent} onChange={(event) => setRoomThemeAccent(event.target.value)} className="h-10 w-16 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                        </label>

                        <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-3 py-2.5 text-sm text-[var(--muted)]">
                          <span>Background</span>
                          <input type="color" value={roomThemeBackground} onChange={(event) => setRoomThemeBackground(event.target.value)} className="h-10 w-16 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                        </label>

                        <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-3 py-2.5 text-sm text-[var(--muted)]">
                          <span>Buttons</span>
                          <input type="color" value={roomThemeButtonColor} onChange={(event) => setRoomThemeButtonColor(event.target.value)} className="h-10 w-16 cursor-pointer rounded-md border-0 bg-transparent p-0" />
                        </label>
                      </div>

                      <button type="button" onClick={saveCustomRoomTheme} className="w-full rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/15">
                        Save theme
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-[var(--muted)]">Room code</span>
                  <input value={roomCode} onChange={(event) => setRoomCode(event.target.value)} placeholder="Enter room code" className="w-full rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-4 py-3 text-base uppercase text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-emerald-400/60" />
                </label>
              )}

              {mode === "create" && friendContacts.length > 0 ? (
                <fieldset className="min-w-0 space-y-2 md:col-span-2">
                  <legend className="text-sm font-medium text-[var(--muted)]">Invite friends</legend>
                  <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                    {friendContacts.map((friend) => {
                      const isSelected = selectedInviteeIds.includes(friend.id);
                      return (
                        <label key={friend.id} className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--soft-background)] px-4 py-3 text-sm transition ${isSelected ? "bg-emerald-500/10 text-emerald-700" : "text-[var(--foreground)] hover:bg-[var(--control-background)]"}`}>
                          <input type="checkbox" checked={isSelected} onChange={() => setSelectedInviteeIds((current) => isSelected ? current.filter((id) => id !== friend.id) : [...current, friend.id])} className="h-4 w-4 shrink-0 accent-emerald-500" />
                          <span className="min-w-0 break-words">{friend.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}

              {roomError ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 md:col-span-full">{roomError}</div> : null}

              <button
                type="button"
                onClick={mode === "create" ? createRoom : () => void joinRoom()}
                className={`w-full rounded-2xl bg-emerald-500 px-6 py-3 font-semibold text-[#03150a] transition hover:bg-emerald-400 ${mode === "create" ? "md:col-span-2 md:w-auto md:min-w-48 md:justify-self-end" : ""}`}
              >
                {mode === "create" ? "Create room" : "Join room"}
              </button>
            </div>
          </div>

          {mode === "join" ? (
            <aside className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-none">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">Rooms</p>
                  <h4 className="mt-2 text-xl font-semibold text-[var(--foreground)]">Active rooms</h4>
                </div>
                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-600">Live</div>
              </div>

              <div className="space-y-3">
                {activeRooms.length > 0 ? activeRooms.map((room) => (
                  <div key={room.code} className="rounded-2xl border border-[var(--border)] bg-[var(--soft-background)] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-[var(--foreground)]">{room.name}</div>
                        <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Host: {room.host}</div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${room.status === "Live" ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-200 text-slate-700"}`}>
                        {room.status}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs text-[var(--muted)]">{room.viewers}</span>
                      <button
                        type="button"
                        onClick={() => { setRoomCode(room.code); void joinRoom(room.code); }}
                        className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-[#03150a] transition hover:bg-emerald-400"
                      >
                        Join
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--soft-background)] p-4 text-sm text-[var(--muted)]">
                    No active rooms are available right now.
                  </div>
                )}
              </div>
            </aside>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
