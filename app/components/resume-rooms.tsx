"use client";

export type ResumeRoom = { code: string; name: string; title: string; mediaType: string; position: number; playing: boolean };

export function ResumeRooms({ rooms, loading, onView, onCreate }: { rooms: ResumeRoom[]; loading: boolean; onView: (code: string) => void; onCreate: () => void }) {
  return <section className="rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-4">
    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-600">Your next watch</p>
    <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">Pick up where you left off</h2>
    <p className="mt-2 text-xs text-[var(--muted)]">Return to a room with media ready to play.</p>
    <div className="mt-4 space-y-3">
      {rooms.length ? rooms.map((room) => <button key={room.code} type="button" onClick={() => onView(room.code)} className="flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--soft-background)] p-3 text-left transition hover:border-emerald-500/50">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">{room.mediaType === "audio" ? "♫" : "▶"}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[var(--foreground)]">{room.title}</span><span className="mt-1 block truncate text-xs text-[var(--muted)]">{room.name}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{room.playing ? "Playing now" : `Paused at ${Math.floor(room.position / 60)}:${String(Math.floor(room.position % 60)).padStart(2, "0")}`}</span></span>
        <span className="text-xs font-semibold text-emerald-600">View →</span>
      </button>) : loading ? <p className="py-5 text-sm text-[var(--muted)]">Loading your rooms…</p> : <div className="rounded-2xl border border-dashed border-[var(--border)] p-5"><p className="text-sm font-medium text-[var(--foreground)]">Your next watch starts here</p><p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">Load a video or audio file in a room and it will appear here for your next visit.</p><button type="button" onClick={onCreate} className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#03150a]">Start a room</button></div>}
    </div>
  </section>;
}
