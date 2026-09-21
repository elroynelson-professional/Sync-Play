"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { socket, socketUrl } from "../lib/socket";
import { isRoomCodeValid, normalizeRoomCode } from "../lib/room-validation";
import { AppShell } from "../components/app-shell";
import { AuthPageLoading } from "../components/auth-page-loading";
import { RoomView } from "../components/room-view";

type AccountUser = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  profileImage?: string | null;
};

type FriendItem = {
  id: string;
  name: string;
  status: "Online" | "In room" | "Away";
  mood: string;
  avatar: string;
  accent: string;
  profileImage?: string | null;
};

type FriendRequest = {
  id: string;
  name: string;
  note: string;
  profileImage?: string | null;
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

export default function FriendsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(() => readActiveUser());
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [sentFriendRequests, setSentFriendRequests] = useState<FriendRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [roomModalMode, setRoomModalMode] = useState<"create" | "join" | null>(null);
  const [roomDisplayName, setRoomDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomTitle, setRoomTitle] = useState("");
  const [roomError, setRoomError] = useState("");
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false);
  const [friendEmail, setFriendEmail] = useState("");
  const [activeRoomSession, setActiveRoomSession] = useState<{ roomId: string; name: string; role: "host" | "guest"; action: "create" | "join"; title: string } | null>(null);

  async function refreshFriends() {
    const response = await fetch(`${socketUrl}/api/friends`, { credentials: "include" }).catch(() => null);
    if (!response?.ok) return;

    const payload = (await response.json()) as { friends?: FriendItem[]; requests?: FriendRequest[]; sentRequests?: FriendRequest[] };
    setFriends(payload.friends || []);
    setFriendRequests(payload.requests || []);
    setSentFriendRequests(payload.sentRequests || []);
  }

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
        const friendsResponse = await fetch(`${socketUrl}/api/friends`, { credentials: "include" });
        if (friendsResponse.ok) {
          const friendsPayload = (await friendsResponse.json()) as { friends?: FriendItem[]; requests?: FriendRequest[]; sentRequests?: FriendRequest[] };
          setFriends(friendsPayload.friends || []);
          setFriendRequests(friendsPayload.requests || []);
          setSentFriendRequests(friendsPayload.sentRequests || []);
        }
      })
      .catch(() => router.replace("/"));
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const currentUser = user;

    function handleFriendsChanged() {
      void refreshFriends();
    }

    function handleConnect() {
      socket.emit("identify", { userId: currentUser.id });
    }

    if (!socket.connected) socket.connect();
    socket.emit("identify", { userId: currentUser.id });
    socket.on("connect", handleConnect);
    socket.on("friends-changed", handleFriendsChanged);
    const refreshTimer = window.setInterval(handleFriendsChanged, 5000);

    return () => {
      window.clearInterval(refreshTimer);
      socket.off("connect", handleConnect);
      socket.off("friends-changed", handleFriendsChanged);
    };
  }, [user]);

  const filteredFriends = friends.filter((friend) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;

    return friend.name.toLowerCase().includes(query) || friend.mood.toLowerCase().includes(query);
  });

  function openRoomModal(mode: "create" | "join") {
    setRoomModalMode(mode);
    setRoomDisplayName(user?.name || "");
    setRoomCode("");
    setRoomTitle("");
    setRoomError("");
  }

  function closeRoomModal() {
    setRoomModalMode(null);
    setRoomDisplayName("");
    setRoomCode("");
    setRoomTitle("");
    setRoomError("");
  }

  function handleCreateRoom() {
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

    const code = makeRoomCode();
    closeRoomModal();
    setActiveRoomSession({ roomId: code, name, role: "host", action: "create", title });
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
    setActiveRoomSession({ roomId: code, name, role: "guest", action: "join", title: "Sykonyx shared room" });
  }

  async function handleAddFriend() {
    const response = await fetch(`${socketUrl}/api/friends/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email: friendEmail.trim().toLowerCase() }),
    });
    const payload = (await response.json()) as { error?: string; message?: string };
    setRoomError(payload.error || payload.message || "");
    if (response.ok) {
      setFriendEmail("");
      setIsAddFriendOpen(false);
    }
  }

  async function acceptFriendRequest(name: string) {
    const request = friendRequests.find((item) => item.name === name);
    if (!request) return;
    const response = await fetch(`${socketUrl}/api/friends/requests/${encodeURIComponent(request.id)}/accept`, { method: "POST", credentials: "include" });
    if (response.ok) {
      setFriendRequests((current) => current.filter((item) => item.name !== name));
    }
  }

  async function ignoreFriendRequest(name: string) {
    const request = friendRequests.find((item) => item.name === name);
    if (!request) return;
    const response = await fetch(`${socketUrl}/api/friends/requests/${encodeURIComponent(request.id)}/ignore`, { method: "POST", credentials: "include" });
    if (response.ok) {
      setFriendRequests((current) => current.filter((item) => item.name !== name));
    }
  }

  async function removeFriend(friend: FriendItem) {
    const response = await fetch(`${socketUrl}/api/friends/${encodeURIComponent(friend.id)}/remove`, {
      method: "POST",
      credentials: "include",
    });
    if (response.ok) {
      setFriends((current) => current.filter((item) => item.id !== friend.id));
    }
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

  if (activeRoomSession) {
    return (
      <AppShell
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        searchPlaceholder="Search friends"
        user={user}
        onInbox={() => router.push("/dashboard?inbox=1&returnTo=%2Ffriends")}
        onAccountSettings={() => router.push("/dashboard?settings=1")}
        onCreateRoom={() => openRoomModal("create")}
        onJoinRoom={() => openRoomModal("join")}
        onHelp={() => router.push("/contact")}
        onLogout={signOut}
        hasUnread={friendRequests.length > 0}
      >
        <RoomView
          roomId={activeRoomSession.roomId}
          initialName={activeRoomSession.name}
          initialRole={activeRoomSession.role}
          initialAction={activeRoomSession.action}
          initialTitle={activeRoomSession.title}
          onLeave={() => setActiveRoomSession(null)}
        />
      </AppShell>
    );
  }

  return (
    <>
    <AppShell
      searchTerm={searchTerm}
      onSearchTermChange={setSearchTerm}
      searchPlaceholder="Search friends"
      user={user}
      onInbox={() => router.push("/dashboard?inbox=1&returnTo=%2Ffriends")}
      onAccountSettings={() => router.push("/dashboard?settings=1")}
      onCreateRoom={() => openRoomModal("create")}
      onJoinRoom={() => openRoomModal("join")}
      onHelp={() => router.push("/contact")}
      onLogout={signOut}
      hasUnread={friendRequests.length > 0}
    >
          {roomModalMode ? (
            <section className="mx-auto mb-5 w-full max-w-3xl pt-2">
              <div className="rounded-[28px] border border-white/10 bg-[#0d0d0d] p-6 shadow-2xl shadow-black/40">
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

                  {roomModalMode === "create" ? (
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-200">Room title</span>
                      <input value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} placeholder="Movie night, watch party, study session..." className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none placeholder:text-zinc-500 focus:border-emerald-400/60" />
                    </label>
                  ) : null}

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
            </section>
          ) : null}

          <section className="space-y-5 pt-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Community</p>
                <h1 className="mt-2 text-[2.1rem] font-semibold tracking-[-0.06em] text-white">Friends</h1>
              </div>
              <button type="button" onClick={() => setIsAddFriendOpen(true)} className="rounded-[14px] bg-emerald-500 px-4 py-2.5 text-[14px] font-medium text-[#03150a]">
                Add friend
              </button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[22px] border border-white/10 bg-[#0d0d0d] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[1.4rem] font-semibold tracking-[-0.04em] text-white">Your circle</h2>
                  <span className="text-xs text-slate-400">{filteredFriends.length} friends</span>
                </div>

                <div className="space-y-3">
                  {filteredFriends.length > 0 ? filteredFriends.map((friend) => (
                    <div key={friend.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-[#0a0a0a] p-3">
                      <div className="flex items-center gap-3">
                        {friend.profileImage ? (
                          <img src={friend.profileImage} alt={friend.name} className="h-12 w-12 rounded-full object-cover ring-1 ring-white/10" />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1a1b1d] text-sm font-semibold text-slate-100 ring-1 ring-white/10">
                            {friend.avatar}
                          </div>
                        )}
                        <div>
                          <div className="text-[15px] font-medium text-white">{friend.name}</div>
                          <div className="text-[12px] text-slate-400">{friend.mood}</div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                          friend.status === "Online" || friend.status === "In room"
                            ? "bg-emerald-500/10 text-emerald-300"
                            : "bg-slate-200/80 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300"
                        }`}>
                          {friend.status}
                        </span>
                        <button type="button" onClick={() => void removeFriend(friend)} className="rounded-xl border border-white/10 px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-rose-400/40 hover:text-rose-300">
                          Remove
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-[#0a0a0a] p-5 text-sm text-slate-400">
                      You do not have any friends yet. Add friends to build your circle.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[22px] border border-white/10 bg-[#0d0d0d] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[1.4rem] font-semibold tracking-[-0.04em] text-white">Requests</h2>
                </div>

                <div className="space-y-3">
                  {friendRequests.length > 0 || sentFriendRequests.length > 0 ? (
                    <>
                      {friendRequests.map((request) => (
                        <div key={request.id} className="rounded-2xl border border-white/8 bg-[#0a0a0a] p-3">
                          <div className="flex items-center gap-3">
                            {request.profileImage ? (
                              <img src={request.profileImage} alt={request.name} className="h-10 w-10 rounded-full object-cover ring-1 ring-white/10" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1a1b1d] text-sm font-semibold text-slate-100 ring-1 ring-white/10">{request.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-[15px] font-medium text-white">{request.name}</div>
                              <div className="mt-1 text-[12px] text-slate-400">{request.note}</div>
                            </div>
                          </div>
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
                      {sentFriendRequests.map((request) => (
                        <div key={request.id} className="rounded-2xl border border-white/8 bg-[#0a0a0a] p-3">
                          <div className="flex items-center gap-3">
                            {request.profileImage ? (
                              <img src={request.profileImage} alt={request.name} className="h-10 w-10 rounded-full object-cover ring-1 ring-white/10" />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1a1b1d] text-sm font-semibold text-slate-100 ring-1 ring-white/10">{request.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-[15px] font-medium text-white">{request.name}</div>
                              <div className="mt-1 text-[12px] text-slate-400">{request.note}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-[#0a0a0a] p-5 text-sm text-slate-400">
                      No pending friend requests.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
    </AppShell>

      {isAddFriendOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <form onSubmit={(event) => { event.preventDefault(); void handleAddFriend(); }} className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#111214] p-6 shadow-2xl shadow-black/40">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Community</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Add a friend</h2>
              </div>
              <button type="button" onClick={() => setIsAddFriendOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg text-slate-300" aria-label="Close add friend dialog">×</button>
            </div>
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-100">Friend email</span>
              <input type="email" value={friendEmail} onChange={(event) => setFriendEmail(event.target.value)} placeholder="friend@example.com" autoFocus className="w-full rounded-2xl border border-slate-600/60 bg-[#1b1d22] px-4 py-3 text-white outline-none placeholder:text-slate-400 focus:border-emerald-400/80" />
            </label>
            <button type="submit" disabled={!friendEmail.trim()} className="mt-5 w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-[#03150a] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50">Send friend request</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
