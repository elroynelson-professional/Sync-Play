"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdOverlay } from "./ad-overlay";

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
  const [isPending, startTransition] = useTransition();
  const [isAdOpen, setIsAdOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const canSubmit = useMemo(() => displayName.trim().length >= 2, [displayName]);

  function goToRoom(code: string, role: "host" | "guest", action: "create" | "join") {
    const normalizedName = encodeURIComponent(displayName.trim());
    router.push(`/room/${code}?name=${normalizedName}&role=${role}&action=${action}`);
  }

  function triggerAd(action: () => void) {
    setPendingAction(() => action);
    setIsAdOpen(true);
  }

  function handleAdComplete() {
    const nextAction = pendingAction;
    setPendingAction(null);
    setIsAdOpen(false);
    nextAction?.();
  }

  function handleCreateRoom() {
    if (!canSubmit || isAdOpen) {
      if (!canSubmit) {
        setMessage("Add a display name first.");
      }
      return;
    }

    const code = makeRoomCode();
    setMessage(`Room ${code} created. Opening the shared room...`);

    triggerAd(() => {
      startTransition(() => {
        goToRoom(code, "host", "create");
      });
    });
  }

  function handleJoinRoom() {
    const code = normalizeRoomCode(roomCode);

    if (!canSubmit || isAdOpen) {
      if (!canSubmit) {
        setMessage("Add a display name first.");
      }
      return;
    }

    if (code.length < 4) {
      setMessage("Room codes need at least four characters.");
      return;
    }

    setMessage(`Joining room ${code}...`);

    triggerAd(() => {
      startTransition(() => {
        goToRoom(code, "guest", "join");
      });
    });
  }

  return (
    <main className="syncplay-landing relative min-h-screen overflow-hidden px-5 py-8 text-white sm:px-8 sm:py-10 lg:px-12 lg:py-12">
      <AdOverlay
        isOpen={isAdOpen}
        onSkip={handleAdComplete}
      />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <section className="syncplay-panel syncplay-landing-hero flex flex-col justify-center gap-8 rounded-3xl p-7 sm:p-9 lg:p-11">
            <div className="syncplay-caps flex items-center gap-3 text-xs text-zinc-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              SyncPlay v0.1
            </div>

            <div className="space-y-4">
              <h1 className="syncplay-hero-title max-w-xl text-4xl text-white sm:text-5xl lg:text-6xl">
                Watch together.
                <span className="mt-1 block text-zinc-300">Same moment. Same room.</span>
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                Create a private room, share the code, and keep YouTube playback in sync across browsers.
                Chat, talk, and see each other while you share the moment.
              </p>
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-slate-300">
              <span>Create or join</span>
              <span>Synced YouTube playback</span>
              <span>Chat + voice + video</span>
            </div>
          </section>

          <section className="syncplay-panel syncplay-landing-entry rounded-3xl p-6 sm:p-7 lg:p-9">
            <div className="syncplay-entry-card rounded-[28px] bg-white/5 p-6 sm:p-7">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="syncplay-caps text-xs text-slate-400">Entry point</div>
                  <h2 className="syncplay-hero-title mt-2 text-3xl text-white sm:text-4xl">
                    Start a shared room
                  </h2>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-zinc-300">
                  Live room state
                </div>
              </div>

              <div className="mt-8 space-y-5">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-200">Display name</span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Your name"
                    className="syncplay-input w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-white/30"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-200">Room code</span>
                  <input
                    value={roomCode}
                    onChange={(event) => setRoomCode(normalizeRoomCode(event.target.value))}
                    placeholder="ABC123"
                    className="syncplay-input w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 uppercase tracking-[0.22em] text-white outline-none transition placeholder:text-zinc-500 focus:border-white/30"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleCreateRoom}
                    disabled={isPending || isAdOpen || !canSubmit}
                    className="syncplay-button-primary rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Create room
                  </button>
                  <button
                    type="button"
                    onClick={handleJoinRoom}
                    disabled={isPending || isAdOpen || !canSubmit}
                    className="syncplay-button-secondary rounded-2xl border border-white/12 bg-white/6 px-4 py-3 font-semibold text-slate-100 transition hover:border-emerald-300/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Join room
                  </button>
                </div>

                <p className="syncplay-message rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
                  {message}
                </p>
              </div>
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
