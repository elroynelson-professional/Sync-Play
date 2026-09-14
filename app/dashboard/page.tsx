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

type DirectMessage = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  text: string;
  createdAt: number;
  read: boolean;
};

type DashboardRoom = {
  name: string;
  host: string;
  viewers: string;
  status: "Live" | "Idle";
  code: string;
};

type DashboardData = {
  metrics: {
    activeRooms: number;
    liveViewers: number;
    watchTime: string;
  };
  rooms: DashboardRoom[];
  activityBars: { label: string; value: number }[];
};

const ACTIVE_USER_KEY = "syncplay-active-user-v1";
const INBOX_MESSAGES_KEY = "syncplay-inbox-messages-v1";

const initialInboxMessages: DirectMessage[] = [
  {
    id: "message-ava-1",
    senderId: "friend-ava",
    senderName: "Ava Brooks",
    recipientId: "guest-user",
    text: "Movie night is starting soon. Want to join us?",
    createdAt: Date.now() - 1000 * 60 * 18,
    read: false,
  },
  {
    id: "message-kai-1",
    senderId: "friend-kai",
    senderName: "Kai Chen",
    recipientId: "guest-user",
    text: "I found a great episode for our next watch party.",
    createdAt: Date.now() - 1000 * 60 * 95,
    read: true,
  },
];

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

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roomModalMode, setRoomModalMode] = useState<"create" | "join" | null>(null);
  const [roomDisplayName, setRoomDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomError, setRoomError] = useState("");
  const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [inboxMessages, setInboxMessages] = useState<DirectMessage[]>(initialInboxMessages);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageRecipient, setMessageRecipient] = useState("Ava Brooks");
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [preferences, setPreferences] = useState({
    emailAlerts: true,
    pushNotifications: true,
    twoFactor: false,
    sessionActivity: true,
  });

  useEffect(() => {
    const invalidCodeMessage = typeof window !== "undefined" ? window.sessionStorage.getItem("syncplay-room-error") : null;
    if (invalidCodeMessage) {
      setRoomError(invalidCodeMessage);
      window.sessionStorage.removeItem("syncplay-room-error");
    }

    const storedMessages = window.localStorage.getItem(INBOX_MESSAGES_KEY);
    if (storedMessages) {
      try {
        setInboxMessages(JSON.parse(storedMessages) as DirectMessage[]);
      } catch {
        window.localStorage.setItem(INBOX_MESSAGES_KEY, JSON.stringify(initialInboxMessages));
      }
    } else {
      window.localStorage.setItem(INBOX_MESSAGES_KEY, JSON.stringify(initialInboxMessages));
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
        window.localStorage.setItem(ACTIVE_USER_KEY, JSON.stringify(payload.user));
        const dashboardResponse = await fetch(`${socketUrl}/api/dashboard`, { credentials: "include" });
        if (dashboardResponse.ok) {
          setDashboardData((await dashboardResponse.json()) as DashboardData);
        }
      })
      .catch(() => router.replace("/"));
  }, [router]);

  const filteredRooms = (dashboardData?.rooms ?? []).filter((room) => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return true;

    return (
      room.name.toLowerCase().includes(query) ||
      room.host.toLowerCase().includes(query) ||
      room.code.toLowerCase().includes(query)
    );
  });

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

  function openInbox() {
    setIsInboxOpen(true);
    setSelectedConversation(null);
    setInboxMessages((current) => {
      const nextMessages = current.map((message) => (
        message.recipientId === user?.id ? { ...message, read: true } : message
      ));
      window.localStorage.setItem(INBOX_MESSAGES_KEY, JSON.stringify(nextMessages));
      return nextMessages;
    });
  }

  function sendDirectMessage() {
    const text = messageDraft.trim();
    if (!text || !user) return;

    const friend = messageRecipient === "Kai Chen"
      ? { id: "friend-kai", name: "Kai Chen" }
      : { id: "friend-ava", name: "Ava Brooks" };
    const nextMessage: DirectMessage = {
      id: `message-${Date.now()}`,
      senderId: user.id,
      senderName: user.name,
      recipientId: friend.id,
      text,
      createdAt: Date.now(),
      read: true,
    };
    setInboxMessages((current) => {
      const nextMessages = [...current, nextMessage];
      window.localStorage.setItem(INBOX_MESSAGES_KEY, JSON.stringify(nextMessages));
      return nextMessages;
    });
    setMessageDraft("");
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
    <main className="min-h-screen bg-black p-0 text-white">
      <div className="mx-auto flex h-screen max-h-screen w-full overflow-hidden bg-[#050505]">
        <aside className="hidden w-[220px] flex-col border-r border-white/10 bg-[#090909] px-4 py-5 md:flex">
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
          <header className="relative flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-[#0d0d0d] px-3 py-2.5 shadow-inner shadow-black/30">
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
              <button
                type="button"
                onClick={() => isInboxOpen ? setIsInboxOpen(false) : openInbox()}
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-base text-slate-200 transition hover:bg-white/10"
                aria-label="Open inbox"
              >
                ✉
                {inboxMessages.some((message) => !message.read && message.recipientId === user.id) ? (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#050505] bg-emerald-400" />
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => setIsAccountSettingsOpen(true)}
                className="flex items-center gap-2.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 transition hover:bg-white/10"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111111] text-[11px] font-semibold text-white">{(user.name || "G").slice(0, 2).toUpperCase()}</div>
                <div className="pr-1">
                  <div className="text-[14px] font-medium text-white">{user.name}</div>
                  <div className="text-[10px] text-slate-400">{user.email}</div>
                </div>
              </button>
            </div>
          </header>

          <div className="mt-4 flex-1 overflow-y-auto pr-1 pb-2">
          {isInboxOpen ? (
            <section className="fixed inset-0 z-50 flex justify-end bg-black/70">
              <div className="flex h-full min-h-[560px] w-full max-w-[820px] flex-col overflow-hidden rounded-l-[22px] border-y border-l border-white/10 bg-[#0b0b0c] shadow-2xl shadow-black/60 md:flex-row">
                <aside className="w-full border-b border-white/10 bg-[#101011] md:w-[310px] md:border-b-0 md:border-r">
                  <div className="flex items-center gap-2 border-b border-white/10 p-4">
                    <div className="flex flex-1 items-center gap-2 rounded-xl bg-[#1a1a1c] px-3 py-2.5">
                      <span className="text-slate-500">⌕</span>
                      <input placeholder="Search" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
                    </div>
                    <button type="button" onClick={() => setSelectedConversation("Ava Brooks")} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg text-slate-300" aria-label="New message">
                      +
                    </button>
                  </div>

                  <div className="p-4 pb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Messages</div>
                  <div className="space-y-1 px-2 pb-4">
                    {["Ava Brooks", "Kai Chen"].map((friendName) => {
                      const friendId = friendName === "Ava Brooks" ? "friend-ava" : "friend-kai";
                      const friendMessages = inboxMessages.filter((message) => message.senderName === friendName || (message.senderId === user.id && message.recipientId === friendId));
                      const latestMessage = friendMessages[friendMessages.length - 1];
                      const unread = inboxMessages.some((message) => message.senderName === friendName && !message.read);

                      return (
                        <button
                          key={friendName}
                          type="button"
                          onClick={() => {
                            setSelectedConversation(friendName);
                            setMessageRecipient(friendName);
                            setInboxMessages((current) => {
                              const nextMessages = current.map((message) => message.senderName === friendName ? { ...message, read: true } : message);
                              window.localStorage.setItem(INBOX_MESSAGES_KEY, JSON.stringify(nextMessages));
                              return nextMessages;
                            });
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${selectedConversation === friendName ? "bg-emerald-500/15" : "hover:bg-white/5"}`}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-sm font-semibold text-[#03150a]">{friendName.split(" ").map((part) => part[0]).join("")}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-sm font-semibold text-white">{friendName}</span>
                              {latestMessage ? <span className="text-[10px] text-slate-500">{new Date(latestMessage.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}</span> : null}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-xs text-slate-400">{latestMessage?.text || "Start a conversation"}</p>
                              {unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" /> : null}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                <div className="flex min-w-0 flex-1 flex-col bg-[#0b0b0c]">
                  <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                    {selectedConversation ? (
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-sm font-semibold text-[#03150a]">{selectedConversation.split(" ").map((part) => part[0]).join("")}</div>
                        <div>
                          <h2 className="font-semibold text-white">{selectedConversation}</h2>
                          <p className="text-xs text-emerald-300">Friend</p>
                        </div>
                      </div>
                    ) : <h2 className="text-lg font-semibold text-white">Messages</h2>}
                    <button type="button" onClick={() => setIsInboxOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-full text-2xl text-slate-400 transition hover:bg-white/5 hover:text-white" aria-label="Close inbox">×</button>
                  </div>

                  {selectedConversation ? (
                    <>
                      <div className="flex-1 space-y-3 overflow-y-auto p-5">
                        {inboxMessages
                          .filter((message) => message.senderName === selectedConversation || (message.senderId === user.id && message.recipientId === (selectedConversation === "Ava Brooks" ? "friend-ava" : "friend-kai")))
                          .map((message) => (
                            <div key={message.id} className={`flex ${message.senderId === user.id ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${message.senderId === user.id ? "bg-emerald-500 text-[#03150a]" : "bg-[#181819] text-slate-200"}`}>
                                {message.text}
                              </div>
                            </div>
                          ))}
                      </div>
                      <div className="border-t border-white/10 p-4">
                        <div className="flex gap-2">
                          <input value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") sendDirectMessage(); }} placeholder="Write a message..." className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#121212] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/50" />
                          <button type="button" onClick={sendDirectMessage} className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-[#03150a] transition hover:bg-emerald-400">Send</button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-2xl text-slate-400">✉</div>
                      <h2 className="mt-4 text-lg font-semibold text-white">Select a chat to start messaging</h2>
                      <p className="mt-2 max-w-sm text-sm text-slate-500">Choose a friend from your messages to view the conversation.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : isAccountSettingsOpen ? (
            <section className="pt-5 pb-2">
              <div className="mx-auto max-w-[1280px] overflow-hidden rounded-[28px] border border-white/10 bg-[#0b0b0c] p-4 sm:p-5">
                <div className="mb-7 flex items-center justify-between gap-4 border-b border-white/10 pb-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-[radial-gradient(circle_at_30%_30%,_#f3d6b1,_#b4815d_38%,_#2d2b2b_100%)] text-[2rem] font-semibold text-white shadow-inner shadow-black/40 sm:h-[72px] sm:w-[72px]">
                      {(user.name || "G").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-[2.7rem] font-semibold tracking-[-0.06em] text-white sm:text-[3rem]">{user.name}</h2>
                      <p className="text-[1.7rem] leading-none text-slate-300 sm:text-[1.9rem]">Account owner</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAccountSettingsOpen(false)}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#121212] text-[1.8rem] text-white transition hover:bg-white/5"
                    aria-label="Close account settings"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-10">
                  <section className="space-y-5">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">Profile</p>
                      <h3 className="mt-1 text-[1.7rem] font-semibold tracking-[-0.04em] text-white">Personal information</h3>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm text-slate-400">First name</span>
                        <input value={user.name.split(" ")[0] || user.name} readOnly className="w-full rounded-2xl border border-white/10 bg-[#121212] px-4 py-3 text-white outline-none" />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm text-slate-400">Last name</span>
                        <input value={user.name.split(" ").slice(1).join(" ") || "Not set"} readOnly className="w-full rounded-2xl border border-white/10 bg-[#121212] px-4 py-3 text-white outline-none" />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm text-slate-400">Email address</span>
                        <input value={user.email} readOnly className="w-full rounded-2xl border border-white/10 bg-[#121212] px-4 py-3 text-white outline-none" />
                      </label>
                      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#121212] px-4 py-3">
                        <span className="text-sm text-slate-400">Member since</span>
                        <span className="text-sm text-white">
                          {new Date(user.createdAt || Date.now()).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-5 border-t border-white/10 pt-8">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">Security</p>
                      <h3 className="mt-1 text-[1.7rem] font-semibold tracking-[-0.04em] text-white">Change password</h3>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {[
                        { label: "Current password", key: "currentPassword", visible: showCurrentPassword, toggle: setShowCurrentPassword },
                        { label: "New password", key: "newPassword", visible: showNewPassword, toggle: setShowNewPassword },
                      ].map((field) => (
                        <label key={field.key} className="space-y-2">
                          <span className="text-sm text-slate-400">{field.label}</span>
                          <span className="flex items-center rounded-2xl border border-white/10 bg-[#121212] px-4 py-3 focus-within:border-emerald-400/50">
                            <input
                              type={field.visible ? "text" : "password"}
                              value={passwordForm[field.key as keyof typeof passwordForm]}
                              onChange={(event) => setPasswordForm((current) => ({ ...current, [field.key]: event.target.value }))}
                              className="w-full bg-transparent text-white outline-none"
                            />
                            <button type="button" onClick={() => field.toggle((value) => !value)} className="ml-2 text-slate-400 hover:text-white" aria-label={`Show ${field.label.toLowerCase()}`}>
                              {field.visible ? "◉" : "◌"}
                            </button>
                          </span>
                        </label>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (passwordForm.currentPassword && passwordForm.newPassword.length >= 8) {
                          setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
                          setShowCurrentPassword(false);
                          setShowNewPassword(false);
                        }
                      }}
                      className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-[#03150a] transition hover:bg-emerald-400"
                    >
                      Change password
                    </button>
                  </section>

                  <section className="space-y-5 border-t border-white/10 pt-8">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">Preferences</p>
                      <h3 className="mt-1 text-[1.7rem] font-semibold tracking-[-0.04em] text-white">Notifications and privacy</h3>
                    </div>
                    <div className="space-y-3">
                      {[
                        { key: "emailAlerts", label: "Email alerts", description: "Receive account and product updates." },
                        { key: "pushNotifications", label: "Push notifications", description: "Get alerts for room activity and mentions." },
                        { key: "twoFactor", label: "Two-factor authentication", description: "Add another layer of account security." },
                      ].map((item) => {
                        const enabled = preferences[item.key as keyof typeof preferences];
                        return (
                          <div key={item.key} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#121212] p-4">
                            <div>
                              <p className="font-medium text-white">{item.label}</p>
                              <p className="mt-1 text-sm text-slate-400">{item.description}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPreferences((current) => ({ ...current, [item.key]: !enabled }))}
                              className={`relative h-7 w-12 shrink-0 rounded-full border transition ${enabled ? "border-emerald-400/50 bg-emerald-500/20" : "border-white/10 bg-white/5"}`}
                              aria-label={`Toggle ${item.label}`}
                            >
                              <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${enabled ? "left-6" : "left-1"}`} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="border-t border-white/10 pt-8">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-slate-300">Account status</div>
                      <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200">Active</span>
                    </div>
                  </section>
                </div>
              </div>
            </section>
          ) : (
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
                {[
                  { label: "Active rooms", value: String(dashboardData?.metrics.activeRooms ?? 0), change: "Rooms you created or joined" },
                  { label: "Live viewers", value: String(dashboardData?.metrics.liveViewers ?? 0), change: "Currently in your rooms" },
                  { label: "Watch time", value: dashboardData?.metrics.watchTime ?? "0h 0m", change: "From your watch sessions" },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="rounded-[20px] border border-white/10 bg-[#0d0d0d] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
                  >
                    <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-slate-400">{card.label}</div>
                    <div className="mt-3 text-[2.2rem] font-semibold tracking-[-0.06em] text-white">{card.value}</div>
                    <div className="mt-2 text-[12px] text-slate-400">{card.change}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[1.5fr_0.9fr]">
                <div className="rounded-[22px] border border-white/10 bg-[#0d0d0d] p-4">
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
                          className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-[#0a0a0a] p-3 text-left transition hover:border-emerald-400/30 hover:bg-[#111111]"
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
                      <div className="rounded-2xl border border-dashed border-white/10 bg-[#0a0a0a] p-4 text-sm text-slate-400">
                        {dashboardData ? "You have not created or joined any rooms yet." : "Loading your rooms..."}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[22px] border border-white/10 bg-[#0d0d0d] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[1.2rem] font-semibold tracking-[-0.04em] text-white">Activity</h3>
                  </div>

                  <div className="flex h-40 items-end justify-between gap-2">
                    {(dashboardData?.activityBars ?? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => ({ label, value: 0 }))).map((bar) => (
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
          )}
          </div>
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
                  className="w-full rounded-2xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
                />
              </label>

              {roomModalMode === "join" ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-200">Room code</span>
                  <input
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value)}
                    placeholder="Enter room code"
                    className="w-full rounded-2xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-white uppercase outline-none placeholder:text-slate-500 focus:border-emerald-400/60"
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
