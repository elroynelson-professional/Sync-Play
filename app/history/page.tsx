"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { socketUrl } from "../lib/socket";
import { isRoomCodeValid, normalizeRoomCode } from "../lib/room-validation";
import { TopBar } from "../components/top-bar";
import { AppSidebar } from "../components/app-sidebar";
import { AccountDialog, HelpDialog } from "../components/account-dialogs";

type AccountUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type HistoryRow = {
  title: string;
  room: string;
  date: string;
  duration: string;
  type: string;
};

const ACTIVE_USER_KEY = "syncplay-active-user-v1";

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function readActiveUser(): AccountUser | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(ACTIVE_USER_KEY);
    return raw ? (JSON.parse(raw) as AccountUser) : null;
  } catch {
    return null;
  }
}

export default function HistoryPage() {
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [roomModalMode, setRoomModalMode] = useState<"create" | "join" | null>(null);
  const [roomDisplayName, setRoomDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomError, setRoomError] = useState("");
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  useEffect(() => {
    const invalidCodeMessage = typeof window !== "undefined" ? window.sessionStorage.getItem("syncplay-room-error") : null;
    if (invalidCodeMessage) {
      setRoomError(invalidCodeMessage);
      window.sessionStorage.removeItem("syncplay-room-error");
    }

    fetch(`${socketUrl}/api/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          router.replace("/");
          return;
        }

        const payload = (await response.json()) as { user?: AccountUser };
        if (!payload.user) {
          router.replace("/");
          return;
        }

        setUser(payload.user);
        setRoomDisplayName(payload.user.name);
        window.localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(payload.user));
        const historyResponse = await fetch(`${socketUrl}/api/history`, { credentials: "include" });
        if (historyResponse.ok) {
          const historyPayload = (await historyResponse.json()) as { history?: HistoryRow[] };
          setHistoryRows(historyPayload.history || []);
        }
      })
      .catch(() => router.replace("/"));
  }, [router]);

  const filteredHistoryRows = historyRows.filter((row) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;

    return row.title.toLowerCase().includes(query) || row.room.toLowerCase().includes(query) || row.type.toLowerCase().includes(query);
  });

  function openRoomModal(mode: "create" | "join") {
    setRoomModalMode(mode);
    setRoomDisplayName(user?.name || "");
    setRoomCode("");
    setRoomError("");
  }

  function closeRoomModal() {
    setRoomModalMode(null);
    setRoomDisplayName("");
    setRoomCode("");
    setRoomError("");
  }

  function handleCreateRoom() {
    const name = roomDisplayName.trim();
    if (name.length < 2) {
      setRoomError("Add a valid display name first.");
      return;
    }

    const code = makeRoomCode();
    closeRoomModal();
    router.push(`/room/${code}?name=${encodeURIComponent(name)}&role=host&action=create`);
  }

  async function handleJoinRoom() {
    const name = roomDisplayName.trim();
    const code = normalizeRoomCode(roomCode);

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

    closeRoomModal();
    router.push(`/room/${code}?name=${encodeURIComponent(name)}&role=guest&action=join`);
  }

  function exportHistory() {
    const csv = [
      ["Title", "Room", "Date", "Duration", "Type"],
      ...historyRows.map((row) => [row.title, row.room, row.date, row.duration, row.type]),
    ]
      .map((values) => values.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "syncplay-history.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function signOut() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACTIVE_USER_KEY);
    }

    setUser(null);
    router.push("/");
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-black p-0 text-white">
      <div className="mx-auto flex h-screen max-h-screen w-full overflow-hidden bg-[#050505]">
        <AppSidebar
          onCreateRoom={() => openRoomModal("create")}
          onJoinRoom={() => openRoomModal("join")}
          onAccountSettings={() => setIsAccountSettingsOpen(true)}
          onHelp={() => setIsHelpOpen(true)}
          onLogout={signOut}
        />

        <div className="flex min-h-0 flex-1 flex-col bg-[#050505] px-4 py-4 md:px-5 md:py-5">
          <TopBar
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            searchPlaceholder="Search history"
            user={user}
            onInbox={() => router.push("/dashboard?inbox=1")}
            onActivity={() => router.push("/history")}
            onAccountSettings={() => setIsAccountSettingsOpen(true)}
          />

          <section className="space-y-5 pt-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Activity</p>
                <h1 className="mt-2 text-[2.1rem] font-semibold tracking-[-0.06em] text-white">History</h1>
              </div>
              <button type="button" onClick={exportHistory} className="rounded-[14px] border border-white/10 bg-white/5 px-4 py-2.5 text-[14px] font-medium text-white">
                Export
              </button>
            </div>

            <div className="rounded-[22px] border border-white/10 bg-[#0d0d0d] p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[1.4rem] font-semibold tracking-[-0.04em] text-white">Recent sessions</h2>
                <span className="text-xs text-slate-400">{filteredHistoryRows.length} records</span>
              </div>

              <div className="overflow-hidden rounded-2xl border border-white/10">
                <div className="grid grid-cols-[1.6fr_0.9fr_0.7fr_0.8fr] bg-[#0a0a0a] px-4 py-3 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                  <span>Title</span>
                  <span>Room</span>
                  <span>Date</span>
                  <span>Duration</span>
                </div>

                {filteredHistoryRows.length > 0 ? filteredHistoryRows.map((row) => (
                  <div key={`${row.title}-${row.room}-${row.date}`} className="grid grid-cols-[1.6fr_0.9fr_0.7fr_0.8fr] border-t border-white/10 bg-[#0d0d0d] px-4 py-3 text-sm text-slate-200">
                    <div>
                      <div className="font-medium text-white">{row.title}</div>
                      <div className="text-[11px] text-slate-400">{row.type}</div>
                    </div>
                    <div className="flex items-center">{row.room}</div>
                    <div className="flex items-center text-slate-300">{row.date}</div>
                    <div className="flex items-center justify-end text-emerald-300">{row.duration}</div>
                  </div>
                )) : (
                  <div className="border-t border-white/10 bg-[#0d0d0d] px-4 py-8 text-center text-sm text-slate-400">
                    No watch or room activity has been recorded for this account yet.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {isAccountSettingsOpen && user ? <AccountDialog user={user} onClose={() => setIsAccountSettingsOpen(false)} /> : null}
      {isHelpOpen ? <HelpDialog onClose={() => setIsHelpOpen(false)} /> : null}

      {roomModalMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl shadow-black/40">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{roomModalMode === "create" ? "Create room" : "Join room"}</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  {roomModalMode === "create" ? "Start a room" : "Enter room details"}
                </h3>
              </div>
              <button type="button" onClick={closeRoomModal} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg text-slate-300 transition hover:bg-white/10">×</button>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Display name</span>
                <input value={roomDisplayName} onChange={(event) => setRoomDisplayName(event.target.value)} placeholder="Your display name" className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400/60" />
              </label>

              {roomModalMode === "join" ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-200">Room code</span>
                  <input value={roomCode} onChange={(event) => setRoomCode(event.target.value)} placeholder="Enter room code" className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white uppercase outline-none placeholder:text-zinc-500 focus:border-emerald-400/60" />
                </label>
              ) : null}

              {roomError ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{roomError}</div> : null}

              <button type="button" onClick={roomModalMode === "create" ? handleCreateRoom : handleJoinRoom} className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-black transition hover:bg-emerald-400">
                {roomModalMode === "create" ? "Create room" : "Join room"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
