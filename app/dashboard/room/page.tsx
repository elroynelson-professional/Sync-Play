"use client";

import { useRoomThemes } from "../../lib/use-room-themes";

import { RoomListCard, type ListedRoom } from "../../components/room-list-card";
import { RoomThemePicker } from "../../components/room-theme-picker";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "../../components/app-shell";
import { AuthPageLoading } from "../../components/auth-page-loading";
import { isRoomCodeValid, normalizeRoomCode } from "../../lib/room-validation";
import { socketUrl } from "../../lib/socket";

const ACTIVE_USER_KEY = "syncplay-active-user-v1";

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
  const [roomTheme, setRoomTheme] = useState("custom");
  const [roomThemeCustom, setRoomThemeCustom] = useState("");
  const [roomThemeAccent, setRoomThemeAccent] = useState("#5eead4");
  const [roomThemeBackground, setRoomThemeBackground] = useState("#0f172a");
  const [roomThemeButtonColor, setRoomThemeButtonColor] = useState("#5eead4");
  const [selectedInviteeIds, setSelectedInviteeIds] = useState<string[]>([]);
  const { themes: customRoomThemes, error: themeError, busy: themeBusy, save: saveTheme, remove: removeTheme } = useRoomThemes(user?.id);
  const [activeRooms, setActiveRooms] = useState<ListedRoom[]>([]);
  const [selectedRoomForPanel, setSelectedRoomForPanel] = useState<ListedRoom | null>(null);
  const [roomPanelMode, setRoomPanelMode] = useState<"view" | "edit" | null>(null);
  const [roomSettingsSaving, setRoomSettingsSaving] = useState(false);
  const [deletingRoomCode, setDeletingRoomCode] = useState<string | null>(null);
  const [roomSettingsNotice, setRoomSettingsNotice] = useState("");
  const [roomError, setRoomError] = useState("");
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);

  const mode = searchParams.get("mode") === "join" ? "join" : "create";


  const selectedRoomTheme = {
    name: roomThemeCustom.trim() || "Custom theme",
    accent: roomThemeAccent,
    background: roomThemeBackground,
    buttonColor: roomThemeButtonColor,
  };

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
          const dashboardPayload = (await dashboardResponse.json()) as { rooms?: ListedRoom[] };
          setActiveRooms(dashboardPayload.rooms || []);
        }
      })
      .catch(() => router.replace("/"));
  }, [router]);

  async function saveCustomRoomTheme() {
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

    if (!await saveTheme(nextTheme)) return;
    setRoomTheme(`saved:${nextTheme.id}`);
    setRoomError("");
  }

  async function removeSavedTheme(themeId: string) {
    if (!await removeTheme(themeId)) return;
    if (roomTheme === `saved:${themeId}`) setRoomTheme("custom");
    setRoomError("");
  }

  function applySavedTheme(theme: RoomThemePreset) {
    setRoomTheme(`saved:${theme.id}`);
    setRoomThemeCustom(theme.name);
    setRoomThemeAccent(theme.accent);
    setRoomThemeBackground(theme.background);
    setRoomThemeButtonColor(theme.buttonColor || theme.accent);
  }

  function openRoomPanel(room: ListedRoom, panelMode: "view" | "edit") {
    setSelectedRoomForPanel(room);
    setRoomPanelMode(panelMode);
    setRoomCode(room.code);
    setRoomTitle(room.name);
    setRoomTheme("custom");
    setRoomThemeCustom(room.theme?.name || room.name);
    setRoomThemeAccent(room.theme?.accent || "#5eead4");
    setRoomThemeBackground(room.theme?.background || "#0f172a");
    setRoomThemeButtonColor(room.theme?.buttonColor || room.theme?.accent || "#5eead4");
    setRoomError("");
    setRoomSettingsNotice("");
  }

  async function saveRoomSettings() {
    if (!selectedRoomForPanel || roomPanelMode !== "edit" || !selectedRoomForPanel.canEdit || roomSettingsSaving) return;

    const nextTitle = roomTitle.trim();
    if (nextTitle.length < 2 || nextTitle.length > 80) {
      setRoomError("Room title must be between 2 and 80 characters.");
      return;
    }

    const theme = {
      name: roomThemeCustom.trim() || "Custom theme",
      accent: roomThemeAccent,
      background: roomThemeBackground,
      buttonColor: roomThemeButtonColor,
    };

    setRoomSettingsSaving(true);
    setRoomError("");
    setRoomSettingsNotice("");
    try {
      const response = await fetch(`${socketUrl}/api/rooms/${encodeURIComponent(selectedRoomForPanel.code)}/settings`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle, theme }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not save this room.");
      }

      const updatedRoom: ListedRoom = {
        ...selectedRoomForPanel,
        name: payload.title,
        theme: payload.theme,
      };

      setActiveRooms((current) => current.map((room) => room.code === updatedRoom.code ? updatedRoom : room));
      setSelectedRoomForPanel(updatedRoom);
      setRoomTitle(payload.title);
      setRoomThemeCustom(payload.theme?.name || payload.title);
      setRoomThemeAccent(payload.theme?.accent || roomThemeAccent);
      setRoomThemeBackground(payload.theme?.background || roomThemeBackground);
      setRoomThemeButtonColor(payload.theme?.buttonColor || payload.theme?.accent || roomThemeButtonColor);
      setRoomSettingsNotice("Room settings updated.");
    } catch (failure) {
      setRoomError(failure instanceof Error ? failure.message : "Could not save this room. Please try again.");
    } finally {
      setRoomSettingsSaving(false);
    }
  }

  async function deleteSavedRoom(room: ListedRoom) {
    if (!room.canEdit || deletingRoomCode) return;

    setDeletingRoomCode(room.code);
    setRoomError("");
    setRoomSettingsNotice("");
    try {
      const response = await fetch(`${socketUrl}/api/rooms/${encodeURIComponent(room.code)}/remove`, {
        method: "POST",
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not remove this room.");
      }

      setActiveRooms((current) => current.filter((item) => item.code !== room.code));
      if (selectedRoomForPanel?.code === room.code) {
        setSelectedRoomForPanel(null);
        setRoomPanelMode(null);
        setRoomCode("");
      }
      setRoomSettingsNotice("Room removed from saved rooms.");
    } catch (failure) {
      setRoomError(failure instanceof Error ? failure.message : "Could not remove this room. Please try again.");
    } finally {
      setDeletingRoomCode(null);
    }
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
      themeKind: "custom",
      name,
      role: "host",
      action: "create",
      title,
      accent: theme.accent,
      background: theme.background,
      buttonColor: theme.buttonColor,
      themeName: theme.name,
      invitees: selectedInviteeIds.join(","),
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
                    <RoomThemePicker value={roomTheme} themes={customRoomThemes} onRemove={removeSavedTheme} onChange={(value) => {
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
                      }} />

                    <p className="self-end py-3 text-sm text-[var(--muted)]">Your room starts when you create it. Reuse its invite link next time.</p>
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

                      <button type="button" onClick={saveCustomRoomTheme} disabled={themeBusy} className="w-full rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/15">
                        {themeBusy ? "Saving…" : "Save theme"}
                      </button>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-[var(--muted)]">Room code</span>
                    <input value={roomCode} onChange={(event) => setRoomCode(event.target.value)} placeholder="Enter room code" className="w-full rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-4 py-3 text-base uppercase text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-emerald-400/60" />
                  </label>

                  {selectedRoomForPanel ? (
                    <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--soft-background)] p-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Room settings</p>
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {roomPanelMode === "edit" && selectedRoomForPanel.canEdit ? "You are editing your room settings." : "View only. Only the room owner can edit this room."}
                        </p>
                      </div>

                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-[var(--muted)]">Room title</span>
                        <input
                          value={roomTitle}
                          onChange={(event) => setRoomTitle(event.target.value)}
                          disabled={roomPanelMode !== "edit" || !selectedRoomForPanel.canEdit}
                          placeholder="Movie night, watch party, study session..."
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-4 py-3 text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-70"
                        />
                      </label>

                      <label className="block space-y-2">
                        <span className="text-sm font-medium text-[var(--muted)]">Theme name</span>
                        <input
                          value={roomThemeCustom}
                          onChange={(event) => setRoomThemeCustom(event.target.value)}
                          disabled={roomPanelMode !== "edit" || !selectedRoomForPanel.canEdit}
                          placeholder="Midnight watch club"
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-4 py-3 text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-70"
                        />
                      </label>

                      <div className="grid gap-4 md:grid-cols-3">
                        <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-3 py-2.5 text-sm text-[var(--muted)]">
                          <span>Accent</span>
                          <input type="color" value={roomThemeAccent} onChange={(event) => setRoomThemeAccent(event.target.value)} disabled={roomPanelMode !== "edit" || !selectedRoomForPanel.canEdit} className="h-10 w-16 cursor-pointer rounded-md border-0 bg-transparent p-0 disabled:cursor-not-allowed" />
                        </label>

                        <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-3 py-2.5 text-sm text-[var(--muted)]">
                          <span>Background</span>
                          <input type="color" value={roomThemeBackground} onChange={(event) => setRoomThemeBackground(event.target.value)} disabled={roomPanelMode !== "edit" || !selectedRoomForPanel.canEdit} className="h-10 w-16 cursor-pointer rounded-md border-0 bg-transparent p-0 disabled:cursor-not-allowed" />
                        </label>

                        <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-3 py-2.5 text-sm text-[var(--muted)]">
                          <span>Buttons</span>
                          <input type="color" value={roomThemeButtonColor} onChange={(event) => setRoomThemeButtonColor(event.target.value)} disabled={roomPanelMode !== "edit" || !selectedRoomForPanel.canEdit} className="h-10 w-16 cursor-pointer rounded-md border-0 bg-transparent p-0 disabled:cursor-not-allowed" />
                        </label>
                      </div>

                      {roomSettingsNotice ? <p className="text-sm text-emerald-700">{roomSettingsNotice}</p> : null}

                      <button
                        type="button"
                        onClick={() => void saveRoomSettings()}
                        disabled={roomPanelMode !== "edit" || !selectedRoomForPanel.canEdit || roomSettingsSaving}
                        className="w-full rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {roomSettingsSaving ? "Saving…" : "Save room changes"}
                      </button>
                    </div>
                  ) : null}
                </>
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

              {themeError ? <p role="alert" className="text-sm text-rose-600 md:col-span-full">{themeError}</p> : null}
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
                  <RoomListCard key={room.code} room={room} onView={() => openRoomPanel(room, "view")} onEdit={() => openRoomPanel(room, "edit")} onDelete={() => void deleteSavedRoom(room)} deleting={deletingRoomCode === room.code} />
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
