"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isRoomCodeValid, normalizeRoomCode } from "../lib/room-validation";

type AccountUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
};

type FriendItem = {
  name: string;
  status: "Online" | "In room" | "Away";
  mood: string;
  avatar: string;
  accent: string;
};

type FriendRequest = {
  name: string;
  note: string;
};

const ACTIVE_USER_KEY = "syncplay-active-user-v1";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: "▣" },
  { label: "Friends", href: "/friends", icon: "◫" },
  { label: "History", href: "/history", icon: "◌" },
];

const initialFriends: FriendItem[] = [
  { name: "Ava Brooks", status: "Online", mood: "Watching a new thriller", avatar: "AB", accent: "from-emerald-400 to-cyan-400" },
  { name: "Kai Chen", status: "In room", mood: "Anime Sync • 11:15 PM", avatar: "KC", accent: "from-violet-400 to-indigo-500" },
  { name: "Leo Grant", status: "Away", mood: "Queued a football match", avatar: "LG", accent: "from-amber-400 to-orange-500" },
  { name: "Nina Patel", status: "Online", mood: "Studying with a room open", avatar: "NP", accent: "from-pink-400 to-rose-500" },
];

const initialFriendRequests: FriendRequest[] = [
  { name: "Milo Reed", note: "Wants to join your watch list" },
  { name: "Sophie Nguyen", note: "Sent a room invite" },
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

export default function FriendsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [friends, setFriends] = useState<FriendItem[]>(initialFriends);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>(initialFriendRequests);
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
    setRoomDisplayName(activeUser.name);
  }, []);

  const filteredFriends = friends.filter((friend) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;

    return friend.name.toLowerCase().includes(query) || friend.mood.toLowerCase().includes(query);
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

  function handleJoinRoom() {
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

    closeRoomModal();
    router.push(`/room/${code}?name=${encodeURIComponent(name)}&role=guest&action=join`);
  }

  function handleAddFriend() {
    const nextName = `New Friend ${friends.length + 1}`;
    setFriendRequests((current) => [{ name: nextName, note: "Sent a watch invite" }, ...current]);
  }

  function acceptFriendRequest(name: string) {
    setFriendRequests((current) => current.filter((request) => request.name !== name));
    setFriends((current) => {
      if (current.some((friend) => friend.name === name)) {
        return current;
      }

      return [
        {
          name,
          status: "Online",
          mood: "Ready to watch together",
          avatar: name
            .split(" ")
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .slice(0, 2)
            .toUpperCase(),
          accent: "from-emerald-400 to-teal-500",
        },
        ...current,
      ];
    });
  }

  function ignoreFriendRequest(name: string) {
    setFriendRequests((current) => current.filter((request) => request.name !== name));
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
            <button
              type="button"
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left text-slate-300 transition hover:bg-white/4"
            >
              <span className="flex h-4 w-4 items-center justify-center text-[10px] text-slate-400">◌</span>
              <span className="text-[15px]">Logout</span>
            </button>
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
                placeholder="Search friends"
                className="w-full bg-transparent text-[13px] text-white outline-none placeholder:text-slate-500"
              />
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[9px] font-medium text-slate-300">⌘F</span>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base text-slate-200">✉</button>
              <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base text-slate-200">◔</button>
              <div className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-2 py-1">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#f2c0ad] to-[#cfa4d3] text-[11px] font-semibold text-[#0e151a]">{(user.name || "G").slice(0, 2).toUpperCase()}</div>
                <div className="pr-1">
                  <div className="text-[14px] font-medium text-white">{user.name}</div>
                  <div className="text-[10px] text-slate-400">{user.email}</div>
                </div>
              </div>
            </div>
          </header>

          <section className="space-y-5 pt-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Community</p>
                <h1 className="mt-2 text-[2.1rem] font-semibold tracking-[-0.06em] text-white">Friends</h1>
              </div>
              <button type="button" onClick={handleAddFriend} className="rounded-[14px] bg-emerald-500 px-4 py-2.5 text-[14px] font-medium text-[#03150a]">
                Add friend
              </button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[22px] border border-white/10 bg-[#111820] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[1.4rem] font-semibold tracking-[-0.04em] text-white">Your circle</h2>
                  <span className="text-xs text-slate-400">{filteredFriends.length} friends</span>
                </div>

                <div className="space-y-3">
                  {filteredFriends.map((friend) => (
                    <div key={friend.name} className="flex items-center justify-between rounded-2xl border border-white/8 bg-[#0d141a] p-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${friend.accent} text-sm font-semibold text-[#071016]`}>
                          {friend.avatar}
                        </div>
                        <div>
                          <div className="text-[15px] font-medium text-white">{friend.name}</div>
                          <div className="text-[12px] text-slate-400">{friend.mood}</div>
                        </div>
                      </div>

                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                        friend.status === "Online" || friend.status === "In room"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : "bg-amber-500/10 text-amber-300"
                      }`}>
                        {friend.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-[#111820] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[1.4rem] font-semibold tracking-[-0.04em] text-white">Requests</h2>
                </div>

                <div className="space-y-3">
                  {friendRequests.map((request) => (
                    <div key={request.name} className="rounded-2xl border border-white/8 bg-[#0d141a] p-3">
                      <div className="text-[15px] font-medium text-white">{request.name}</div>
                      <div className="mt-1 text-[12px] text-slate-400">{request.note}</div>
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => acceptFriendRequest(request.name)} className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-[#03150a]">
                          Accept
                        </button>
                        <button type="button" onClick={() => ignoreFriendRequest(request.name)} className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white">
                          Ignore
                        </button>
                      </div>
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
