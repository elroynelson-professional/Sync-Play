"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { socketUrl } from "../lib/socket";
import { isRoomCodeValid, normalizeRoomCode } from "../lib/room-validation";

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

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "▣" },
  { label: "Friends", href: "/friends", icon: "◫" },
  { label: "History", href: "/history", icon: "◌" },
];

const initialHistoryRows: HistoryRow[] = [
  { title: "Movie Night", room: "MOVIE7", date: "Sep 12, 2026", duration: "1h 22m", type: "Group watch" },
  { title: "Anime Sync", room: "ANIME9", date: "Sep 09, 2026", duration: "54m", type: "Anime binge" },
  { title: "Football Watch Party", room: "GOAL22", date: "Sep 04, 2026", duration: "2h 14m", type: "Live match" },
  { title: "Study Session", room: "STUDY5", date: "Sep 01, 2026", duration: "41m", type: "Focus session" },
];

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
  const pathname = usePathname();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>(initialHistoryRows);
  const [searchTerm, setSearchTerm] = useState("");
  const [roomModalMode, setRoomModalMode] = useState<"create" | "join" | null>(null);
  const [roomDisplayName, setRoomDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomError, setRoomError] = useState("");
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);

  useEffect(() => {
    const activeUser = readActiveUser() ?? {
      id: "guest-user",
      name: "Totok Michael",
      email: "tmichael20@mail.com",
      createdAt: new Date().toISOString(),
    };

    const invalidCodeMessage = typeof window !== "undefined" ? window.sessionStorage.getItem("syncplay-room-error") : null;
    if (invalidCodeMessage) {
      setRoomError(invalidCodeMessage);
      window.sessionStorage.removeItem("syncplay-room-error");
    }

    setUser(activeUser);
    setRoomDisplayName(activeUser.name);
  }, []);

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
        <aside className="hidden w-[240px] flex-col border-r border-white/10 bg-[#090909] px-4 py-5 md:flex">
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-base font-semibold text-emerald-300">◔</div>
            <div className="text-[1.7rem] font-semibold tracking-[-0.06em] text-white">SyncPlay</div>
          </div>

          <div className="space-y-1.5 text-sm">
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
              <button type="button" onClick={() => openRoomModal("create")} className="block w-full rounded-xl bg-emerald-500 px-3 py-2.5 text-center text-sm font-medium text-[#03150a]">
                Create room
              </button>
              <button type="button" onClick={() => openRoomModal("join")} className="block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-center text-sm font-medium text-white">
                Join room
              </button>
            </div>
          </div>

          <div className="mt-auto space-y-3 text-sm">
            <div className="mb-3 px-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">General</div>
            {[
              { label: "Account settings", action: () => setIsAccountSettingsOpen(true) },
              { label: "Help", action: () => undefined },
              { label: "Logout", action: signOut },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-slate-300 transition hover:bg-white/4"
              >
                <span className="flex h-4 w-4 items-center justify-center text-[10px] text-slate-400">◌</span>
                <span className="text-[15px]">{item.label}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col bg-[#050505] px-4 py-4 md:px-5 md:py-5">
          <header className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-[#0d0d0d] px-3 py-2.5 shadow-inner shadow-black/30">
              <span className="text-base text-slate-400">⌕</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search history"
                className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-slate-500"
              />
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-medium text-slate-300">⌘F</span>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base text-slate-200">✉</button>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base text-slate-200">◔</button>
              <button type="button" onClick={() => setIsAccountSettingsOpen(true)} className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 transition hover:bg-white/10">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111111] text-[11px] font-semibold text-white">{(user.name || "G").slice(0, 2).toUpperCase()}</div>
                <div className="pr-1 text-left">
                  <div className="text-[14px] font-medium text-white">{user.name}</div>
                  <div className="text-[10px] text-slate-400">{user.email}</div>
                </div>
              </button>
            </div>
          </header>

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

                {filteredHistoryRows.map((row) => (
                  <div key={`${row.title}-${row.room}-${row.date}`} className="grid grid-cols-[1.6fr_0.9fr_0.7fr_0.8fr] border-t border-white/10 bg-[#0d0d0d] px-4 py-3 text-sm text-slate-200">
                    <div>
                      <div className="font-medium text-white">{row.title}</div>
                      <div className="text-[11px] text-slate-400">{row.type}</div>
                    </div>
                    <div className="flex items-center">{row.room}</div>
                    <div className="flex items-center text-slate-300">{row.date}</div>
                    <div className="flex items-center justify-end text-emerald-300">{row.duration}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

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
