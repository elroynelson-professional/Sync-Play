"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { socketUrl } from "../lib/socket";
import { isRoomCodeValid, normalizeRoomCode } from "../lib/room-validation";

type AccountUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

const ACTIVE_USER_KEY = "syncplay-active-user-v1";

function readActiveUser(): AccountUser | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(ACTIVE_USER_KEY);
    return raw ? (JSON.parse(raw) as AccountUser) : null;
  } catch {
    return null;
  }
}

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "▣" },
  { label: "Friends", href: "/friends", icon: "◫" },
  { label: "History", href: "/history", icon: "◌" },
];

const metricCards = [
  { label: "Active rooms", value: "12", change: "6 created today" },
  { label: "Live viewers", value: "340", change: "+28% this week" },
  { label: "Watch time", value: "8h 42m", change: "Across 24 sessions" },
];

const roomList = [
  { name: "Movie Night", host: "Ava", viewers: "18 online", status: "Live", code: "MOVIE7" },
  { name: "Anime Sync", host: "Kai", viewers: "11 online", status: "Live", code: "ANIME9" },
  { name: "Football Watch Party", host: "Leo", viewers: "25 online", status: "Live", code: "GOAL22" },
  { name: "Study Session", host: "Nina", viewers: "7 online", status: "Idle", code: "STUDY5" },
];

const activityBars = [
  { label: "Mon", value: 40 },
  { label: "Tue", value: 52 },
  { label: "Wed", value: 66 },
  { label: "Thu", value: 71 },
  { label: "Fri", value: 82 },
  { label: "Sat", value: 64 },
  { label: "Sun", value: 76 },
];

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roomModalMode, setRoomModalMode] = useState<"create" | "join" | null>(null);
  const [roomDisplayName, setRoomDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomError, setRoomError] = useState("");

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
  }, []);

  const filteredRooms = roomList.filter((room) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;

    return (
      room.name.toLowerCase().includes(query) ||
      room.host.toLowerCase().includes(query) ||
      room.code.toLowerCase().includes(query)
    );
  });

  function signOut() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ACTIVE_USER_KEY);
    }

    setUser(null);
    router.push("/");
  }

  function openRoomModal(mode: "create" | "join", prefilledCode = "") {
    setRoomModalMode(mode);
    setRoomDisplayName(user?.name || "");
    setRoomCode(prefilledCode);
    setRoomError("");
  }

  function closeRoomModal() {
    setRoomModalMode(null);
    setRoomDisplayName("");
    setRoomCode("");
    setRoomError("");
  }

  function submitCreateRoom() {
    const name = roomDisplayName.trim();
    if (name.length < 2) {
      setRoomError("Add a valid display name first.");
      return;
    }

    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    closeRoomModal();
    router.push(`/room/${code}?name=${encodeURIComponent(name)}&role=host&action=create`);
  }

  async function submitJoinRoom() {
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

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#070b0d] p-0 text-white">
      <div className="mx-auto flex h-screen max-h-screen w-full overflow-hidden bg-[#0b1014]">
        <aside className="hidden w-[220px] flex-col border-r border-white/10 bg-[#0d1217] px-4 py-5 md:flex">
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
              <button
                type="button"
                onClick={() => openRoomModal("create")}
                className="w-full rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-medium text-[#03150a]"
              >
                Create room
              </button>
              <button
                type="button"
                onClick={() => openRoomModal("join")}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-medium text-white"
              >
                Join room
              </button>
            </div>
          </div>

          <div className="mt-auto space-y-3 text-sm">
            <div className="mb-3 px-2 text-[9px] font-semibold uppercase tracking-[0.24em] text-slate-400">General</div>
            {['Help', 'Logout'].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  if (item === "Logout") {
                    signOut();
                  }
                }}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-slate-300 transition hover:bg-white/4"
              >
                <span className="flex h-4 w-4 items-center justify-center text-[10px] text-slate-400">◌</span>
                <span className="text-[15px]">{item}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex-1 bg-[#0a0f12] px-4 py-4 md:px-5 md:py-5">
          <header className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-[#111820] px-3 py-2.5 shadow-inner shadow-black/30">
              <span className="text-base text-slate-400">⌕</span>
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search room"
                className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-slate-500"
              />
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-medium text-slate-300">⌘F</span>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base text-slate-200">✉</button>
              <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-2 py-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#f2c0ad] to-[#cfa4d3] text-[11px] font-semibold text-[#0e151a]">{(user.name || "G").slice(0, 2).toUpperCase()}</div>
                <div className="pr-1">
                  <div className="text-[14px] font-medium text-white">{user.name}</div>
                  <div className="text-[10px] text-slate-400">{user.email}</div>
                </div>
              </div>
            </div>
          </header>

          <section className="pt-5 pb-2">
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-emerald-300">Overview</p>
                <h1 className="mt-2 text-[2.1rem] font-semibold tracking-[-0.06em] text-white">Welcome back</h1>
              </div>

              <div className="flex items-center gap-2.5">
                <button type="button" onClick={() => openRoomModal("create")} className="rounded-[14px] bg-emerald-500 px-4 py-2.5 text-[14px] font-medium text-[#03150a] shadow-sm shadow-emerald-900/40">Create room</button>
                <button type="button" onClick={() => openRoomModal("join")} className="rounded-[14px] border border-white/10 bg-white/5 px-4 py-2.5 text-[14px] font-medium text-white">Join room</button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {metricCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-[20px] border border-white/10 bg-[#111820] p-4"
                >
                  <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-slate-400">{card.label}</div>
                  <div className="mt-3 text-[2.2rem] font-semibold tracking-[-0.06em] text-white">{card.value}</div>
                  <div className="mt-2 text-[12px] text-slate-400">{card.change}</div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[1.5fr_0.9fr]">
              <div className="rounded-[22px] border border-white/10 bg-[#111820] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[1.4rem] font-semibold tracking-[-0.04em] text-white">Live rooms</h2>
                  <Link href="/friends" className="text-xs font-medium text-emerald-300">View all</Link>
                </div>

                <div className="space-y-2.5">
                  {filteredRooms.length > 0 ? (
                    filteredRooms.map((room) => (
                      <button
                        key={room.name}
                        type="button"
                        onClick={() => openRoomModal("join", room.code)}
                        className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-[#0d141a] p-3 text-left transition hover:border-emerald-400/30 hover:bg-[#101a22]"
                      >
                        <div>
                          <div className="text-[14px] font-medium text-white">{room.name}</div>
                          <div className="text-[11px] text-slate-400">Host: {room.host}</div>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[11px] text-slate-400">{room.viewers}</span>
                          <span className={`rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${room.status === "Live" ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
                            {room.status}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-[#0d141a] p-4 text-sm text-slate-400">
                      No rooms match your search.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-[#111820] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[1.2rem] font-semibold tracking-[-0.04em] text-white">Activity</h3>
                </div>

                <div className="flex h-40 items-end justify-between gap-2">
                  {activityBars.map((bar) => (
                    <div key={bar.label} className="flex flex-1 flex-col items-center gap-2">
                      <div className="flex w-full items-end justify-center rounded-t-xl bg-white/6" style={{ height: `${bar.value}%` }}>
                        <div className="w-full rounded-t-xl bg-emerald-500" style={{ height: "100%" }} />
                      </div>
                      <span className="text-[10px] uppercase text-slate-400">{bar.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {roomModalMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#111820] p-6 shadow-2xl shadow-black/40">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{roomModalMode === "create" ? "Create room" : "Join room"}</p>
                <h3 className="mt-2 text-2xl font-semibold text-white">
                  {roomModalMode === "create" ? "Start a room" : "Enter room details"}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeRoomModal}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg text-slate-200"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-200">Display name</span>
                <input
                  value={roomDisplayName}
                  onChange={(event) => setRoomDisplayName(event.target.value)}
                  placeholder="Your display name"
                  className="w-full rounded-2xl border border-white/10 bg-[#0d141a] px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                />
              </label>

              {roomModalMode === "join" ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-200">Room code</span>
                  <input
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value)}
                    placeholder="Enter room code"
                    className="w-full rounded-2xl border border-white/10 bg-[#0d141a] px-4 py-3 text-white uppercase outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                  />
                </label>
              ) : null}

              {roomError ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{roomError}</div>
              ) : null}

              <button
                type="button"
                onClick={roomModalMode === "create" ? submitCreateRoom : submitJoinRoom}
                className="w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-[#03150a] transition hover:bg-emerald-400"
              >
                {roomModalMode === "create" ? "Create room" : "Join room"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
