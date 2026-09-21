"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { socketUrl } from "../lib/socket";

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function normalizeRoomCode(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
}

export function SyncPlayLanding() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [message, setMessage] = useState("Create a private room or join an invite link.");
  const [authMode, setAuthMode] = useState<"login" | "signup">("signup");
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isOtpPending, setIsOtpPending] = useState(false);
  const [authMessage, setAuthMessage] = useState("Create your account to start watching together.");
  const [activeUser, setActiveUser] = useState<{ id: string; name: string; email: string; createdAt: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [roomModalMode, setRoomModalMode] = useState<"create" | "join" | null>(null);
  const [roomModalDisplayName, setRoomModalDisplayName] = useState("");
  const [roomModalCode, setRoomModalCode] = useState("");
  const [roomModalError, setRoomModalError] = useState("");

  useEffect(() => {
    fetch(`${socketUrl}/api/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return;

        const payload = (await response.json()) as { user?: { id: string; name: string; email: string; createdAt: string } };
        if (!payload.user) return;

        setActiveUser(payload.user);
        setDisplayName(payload.user.name);
        setAuthMessage(`Welcome back, ${payload.user.name}.`);
        window.localStorage.setItem("syncplay-active-user-v1", JSON.stringify(payload.user));
        router.replace("/dashboard");
      })
      .catch(() => undefined);
  }, [router]);

  useEffect(() => {
    if (activeUser) {
      router.replace("/dashboard");
    }
  }, [activeUser, router]);

  const canSubmit = useMemo(() => displayName.trim().length >= 2, [displayName]);
  const canAuthSubmit = useMemo(() => {
    const trimmedEmail = emailInput.trim();
    const trimmedPassword = passwordInput.trim();

    if (authMode === "login") {
      return trimmedEmail.length > 0 && trimmedPassword.length > 0;
    }

    return (
      nameInput.trim().length >= 2 &&
      trimmedEmail.length > 0 &&
      trimmedPassword.length >= 6 &&
      confirmPasswordInput === trimmedPassword &&
      otpInput.trim().length === 6
    );
  }, [authMode, confirmPasswordInput, emailInput, nameInput, otpInput, passwordInput]);

  function storeActiveUser(user: { id: string; name: string; email: string; createdAt: string } | null, token?: string) {
    if (typeof window === "undefined") return;

    if (user) {
      window.localStorage.setItem("syncplay-active-user-v1", JSON.stringify(user));
      if (token) {
        window.localStorage.setItem("syncplay-auth-token-v1", token);
      }
      return;
    }

    window.localStorage.removeItem("syncplay-active-user-v1");
    window.localStorage.removeItem("syncplay-auth-token-v1");
  }

  async function signOut() {
    await fetch(`${socketUrl}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);

    setActiveUser(null);
    setDisplayName("");
    setMessage("Signed out. Log in to continue to a room.");
    setAuthMessage("Create your account to start watching together.");
    storeActiveUser(null);
    router.replace("/");
  }

  async function requestVerificationCode() {
    setIsOtpPending(true);
    try {
      const response = await fetch(`${socketUrl}/api/auth/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: emailInput.trim().toLowerCase() }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      setAuthMessage(payload.error || payload.message || "Verification code sent.");
      if (response.ok) setIsOtpSent(true);
    } catch {
      setAuthMessage("The authentication server is unavailable. Try again shortly.");
    } finally {
      setIsOtpPending(false);
    }
  }

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setAuthMessage(authMode === "login" ? "Signing you in..." : "Creating your account...");

    try {
      const response = await fetch(`${socketUrl}/api/auth/${authMode === "login" ? "login" : "signup"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: nameInput.trim(),
          email: emailInput.trim().toLowerCase(),
          password: passwordInput,
          otp: otpInput,
        }),
      });
      const payload = (await response.json()) as { user?: { id: string; name: string; email: string; createdAt: string }; error?: string };

      if (!response.ok || !payload.user) {
        setAuthMessage(payload.error || "We could not authenticate you. Try again.");
        return;
      }

      setActiveUser(payload.user);
      setDisplayName(payload.user.name);
      setAuthMessage(`Welcome back, ${payload.user.name}.`);
      setMessage(`Welcome ${payload.user.name}. You can create or join a room now.`);
      setNameInput("");
      setEmailInput("");
      setPasswordInput("");
      setConfirmPasswordInput("");
      setOtpInput("");
      setIsOtpSent(false);
      storeActiveUser(payload.user);
      router.replace("/dashboard");
    } catch {
      setAuthMessage("The authentication server is unavailable. Start the SyncPlay server and try again.");
    }
  }

  function goToRoom(code: string, role: "host" | "guest", action: "create" | "join") {
    const normalizedName = encodeURIComponent(displayName.trim() || activeUser?.name || "Guest");
    router.push(`/room/${code}?name=${normalizedName}&role=${role}&action=${action}`);
  }

  function openRoomModal(mode: "create" | "join") {
    setRoomModalMode(mode);
    setRoomModalDisplayName(displayName.trim() || activeUser?.name || "");
    setRoomModalCode(roomCode);
    setRoomModalError("");
  }

  function closeRoomModal() {
    setRoomModalMode(null);
    setRoomModalDisplayName("");
    setRoomModalCode("");
    setRoomModalError("");
  }

  function handleCreateRoom() {
    const targetName = roomModalDisplayName.trim() || displayName.trim() || activeUser?.name?.trim() || "";

    if (targetName.length < 2) {
      setRoomModalError("Add a display name first.");
      return;
    }

    setDisplayName(targetName);
    const code = makeRoomCode();
    setRoomCode(code);
    setMessage(`Room ${code} created. Opening the shared room...`);
    closeRoomModal();

    startTransition(() => {
      goToRoom(code, "host", "create");
    });
  }

  function handleJoinRoom() {
    const targetName = roomModalDisplayName.trim() || displayName.trim() || activeUser?.name?.trim() || "";
    const code = normalizeRoomCode(roomModalCode || roomCode);

    if (targetName.length < 2) {
      setRoomModalError("Add a display name first.");
      return;
    }

    if (code.length < 4) {
      setRoomModalError("Room codes need at least four characters.");
      return;
    }

    setDisplayName(targetName);
    setRoomCode(code);
    setMessage(`Joining room ${code}...`);
    closeRoomModal();

    startTransition(() => {
      goToRoom(code, "guest", "join");
    });
  }

  return (
    <main className="syncplay-landing relative min-h-screen overflow-hidden px-5 py-8 text-white sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <section className="syncplay-panel syncplay-landing-hero flex flex-col justify-center gap-8 rounded-3xl p-7 sm:p-9 lg:p-11">
            <div className="syncplay-caps flex items-center gap-3 text-xs text-zinc-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Sykonyx
            </div>

            <div className="space-y-4">
              <h1 className="syncplay-hero-title max-w-xl text-4xl text-white sm:text-5xl lg:text-6xl">
                Watch together.
                <span className="mt-1 block text-zinc-300">Same moment. Same room.</span>
              </h1>
              <p className="syncplay-landing-copy max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Create a private room, share the code, and keep YouTube playback in sync across browsers.
                Chat, talk, and see each other while you share the moment.
              </p>
            </div>

          </section>

          <section className="syncplay-panel syncplay-landing-entry rounded-3xl p-6 sm:p-7 lg:p-9">
            <div className="syncplay-entry-card rounded-[28px] bg-white/5 p-6 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="syncplay-caps text-xs text-slate-400">Account</div>
                  <h2 className="syncplay-hero-title mt-2 text-3xl text-white sm:text-4xl">
                    {activeUser ? "Your account" : authMode === "login" ? "Log in" : "Create account"}
                  </h2>
                </div>
                {activeUser ? (
                  <button
                    type="button"
                    onClick={signOut}
                    className="syncplay-button-secondary rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
                  >
                    Sign out
                  </button>
                ) : null}
              </div>

              {activeUser ? (
                <div className="mt-6 space-y-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4">
                  <p className="text-sm text-emerald-200">Signed in as</p>
                  <div>
                    <p className="text-xl font-semibold text-white">{activeUser.name}</p>
                    <p className="text-sm text-slate-300">{activeUser.email}</p>
                  </div>
                </div>
              ) : (
                <form className="mt-6 space-y-4" onSubmit={handleAuthSubmit}>
                  <div className="flex rounded-2xl border border-white/10 bg-black/20 p-1">
                    <button
                      type="button"
                      onClick={() => setAuthMode("signup")}
                      className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                        authMode === "signup" ? "bg-emerald-500 text-black" : "text-slate-300"
                      }`}
                    >
                      Sign up
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode("login")}
                      className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                        authMode === "login" ? "bg-emerald-500 text-black" : "text-slate-300"
                      }`}
                    >
                      Log in
                    </button>
                  </div>

                  {authMode === "signup" ? (
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-200">Full name</span>
                      <input
                        value={nameInput}
                        onChange={(event) => setNameInput(event.target.value)}
                        placeholder="Your name"
                        className="syncplay-input w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-white/30"
                      />
                    </label>
                  ) : null}

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-200">Email</span>
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(event) => setEmailInput(event.target.value)}
                      placeholder="you@example.com"
                      className="syncplay-input w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-white/30"
                    />
                  </label>

                  {authMode === "signup" ? (
                    <div className="space-y-2">
                      <span className="text-sm font-medium text-slate-200">Email verification</span>
                      <div className="flex gap-2">
                        <input
                          value={otpInput}
                          onChange={(event) => setOtpInput(event.target.value.replace(/\D/g, "").slice(0, 6))}
                          inputMode="numeric"
                          placeholder="6-digit code"
                          className="syncplay-input min-w-0 flex-1 rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-white/30"
                        />
                        <button
                          type="button"
                          onClick={requestVerificationCode}
                          disabled={isOtpPending || !/^\S+@\S+\.\S+$/.test(emailInput.trim())}
                          className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isOtpPending ? "Sending..." : isOtpSent ? "Resend code" : "Send code"}
                        </button>
                      </div>
                      <p className="text-xs text-slate-400">We will send a verification code to confirm this email belongs to you.</p>
                    </div>
                  ) : null}

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-slate-200">Password</span>
                    <input
                      type="password"
                      value={passwordInput}
                      onChange={(event) => setPasswordInput(event.target.value)}
                      placeholder={authMode === "login" ? "Your password" : "At least 6 characters"}
                      className="syncplay-input w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-white/30"
                    />
                  </label>

                  {authMode === "signup" ? (
                    <label className="block space-y-2">
                      <span className="text-sm font-medium text-slate-200">Confirm password</span>
                      <input
                        type="password"
                        value={confirmPasswordInput}
                        onChange={(event) => setConfirmPasswordInput(event.target.value)}
                        placeholder="Repeat your password"
                        className="syncplay-input w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-white/30"
                      />
                    </label>
                  ) : null}

                  <button
                    type="submit"
                    disabled={!canAuthSubmit}
                    className="syncplay-button-primary w-full rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {authMode === "login" ? "Log in" : "Create account"}
                  </button>

                </form>
              )}

              <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                {authMessage}
              </p>

            </div>

            <div className="syncplay-note mt-6 rounded-[24px] bg-white/5 p-5 text-sm leading-7 text-slate-300">
              Private rooms, shared playback, and live chat, voice, and video stay together in one space.
            </div>
          </section>
        </div>
      </div>

    </main>
  );
}
