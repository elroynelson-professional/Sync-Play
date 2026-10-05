"use client";

import { useState } from "react";
import { socketUrl } from "../lib/socket";

export type ListedRoom = {
  name: string;
  host: string;
  viewers: string;
  code: string;
  status: "Live" | "Idle";
  canEdit: boolean;
  theme?: { name: string; accent: string; background: string; buttonColor: string };
};

export function RoomListCard({ room, onView, onSaved }: { room: ListedRoom; onView: () => void; onSaved: (room: ListedRoom) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(room.name);
  const [theme, setTheme] = useState(room.theme ?? { name: "Custom theme", accent: "#5eead4", background: "#0f172a", buttonColor: "#5eead4" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!room.canEdit || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`${socketUrl}/api/rooms/${encodeURIComponent(room.code)}/settings`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), theme }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save this room.");
      onSaved({ ...room, name: payload.title, theme: payload.theme });
      setEditing(false); setNotice("Room updated.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save this room. Please try again."); }
    finally { setSaving(false); }
  }

  return <article className="rounded-2xl border border-[var(--border)] bg-[var(--soft-background)] p-3" aria-label={room.name}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="break-words text-lg font-semibold text-[var(--foreground)]">{room.name}</h3><p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Host: {room.host}</p></div>
      <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${room.status === "Live" ? "bg-emerald-500/10 text-emerald-600" : "bg-[var(--control-background)] text-[var(--muted)]"}`}>{room.status}</span>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-[var(--muted)]">{room.viewers}</span>
      <div className="ml-auto flex gap-2">
        <button type="button" disabled={!room.canEdit || saving} title={room.canEdit ? "Edit room" : "Only the room owner can edit"} onClick={() => { setTitle(room.name); if (room.theme) setTheme(room.theme); setError(""); setNotice(""); setEditing(true); }} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--control-background)] disabled:cursor-not-allowed disabled:opacity-40">Edit</button>
        <button type="button" onClick={onView} className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-[#03150a] transition hover:bg-emerald-400">View</button>
      </div>
    </div>
    {notice ? <p role="status" className="mt-3 text-xs text-[var(--muted)]">{notice}</p> : null}
    {editing ? <form onSubmit={save} className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
      <label className="block text-xs text-[var(--muted)]">Room title<input required minLength={2} maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--input-background)] px-3 py-2 text-sm text-[var(--foreground)]" /></label>
      {([['accent', 'Accent'], ['background', 'Background'], ['buttonColor', 'Buttons']] as const).map(([key, label]) => <label key={key} className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">{label}<input type="color" value={theme[key]} onChange={(event) => setTheme({ ...theme, [key]: event.target.value })} className="h-9 w-14 cursor-pointer rounded border border-[var(--border)] bg-transparent p-1" /></label>)}
      {error ? <p role="alert" className="text-xs text-rose-600">{error}</p> : null}
      <div className="flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setEditing(false)} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--foreground)]">Cancel</button><button disabled={saving} className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-[#03150a] disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button></div>
    </form> : null}
  </article>;
}
