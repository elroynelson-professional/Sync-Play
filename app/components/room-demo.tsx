"use client";

import { useEffect, useState } from "react";

export function RoomDemo() {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [view, setView] = useState<"playback" | "call">("playback");
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setPosition((value) => (value + 1) % 60), 1000);
    return () => clearInterval(timer);
  }, [playing]);
  return <div className="mt-7">
    <button type="button" onClick={() => { setOpen(!open); if (open) setPlaying(false); }} aria-expanded={open} aria-controls="room-demo" className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-3 font-semibold text-[var(--foreground)]">{open ? "Close preview" : "Try a room — interactive demo"}</button>
    {open ? <section id="room-demo" aria-label="Interactive room preview" className="mt-4 overflow-hidden rounded-3xl border border-emerald-500/30 bg-[#0f172a] p-4 text-white">
      <div className="flex flex-wrap justify-between gap-2 text-xs"><span>FRIDAY WATCH CLUB</span><span className="text-emerald-300">Demo · simulated participants</span></div>
      <div className="my-4 flex min-h-40 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-900 via-slate-900 to-violet-950 p-4">
        {view === "playback" ? <div className="w-full text-center"><span className="text-4xl" aria-hidden="true">{playing ? "♫" : "▶"}</span><p className="mt-3 text-sm">{playing ? "Everyone’s timeline moves together" : "Press play to preview shared playback"}</p><progress aria-label="Demo playback position" value={position} max={60} className="mt-4 h-2 w-full accent-emerald-400" /></div> : <div className="grid w-full grid-cols-3 gap-2">{["You", "Alex", "Sam"].map((name) => <div key={name} className="flex aspect-square flex-col items-center justify-center rounded-xl bg-white/10"><span className="text-2xl">{name[0]}</span><span className="mt-2 text-xs">{name}</span></div>)}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setPlaying(!playing)} className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950">{playing ? "Pause demo" : "Play demo"}</button>
        <button type="button" onClick={() => setPosition((value) => (value + 10) % 60)} className="rounded-xl bg-white/10 px-3 py-2 text-sm">+10s</button>
        <button type="button" onClick={() => setView(view === "call" ? "playback" : "call")} className="rounded-xl bg-white/10 px-3 py-2 text-sm">{view === "call" ? "Playback view" : "Video call view"}</button>
        <span className="text-xs text-emerald-200">0:{String(position).padStart(2, "0")} · Synced in preview</span>
      </div>
      <p className="mt-4 text-xs text-slate-300">Interactive preview only. No room, camera access, or live participants.</p>
    </section> : null}
  </div>;
}
