"use client";

export type ListedRoom = {
  name: string;
  host: string;
  viewers: string;
  code: string;
  status: "Live" | "Idle";
  canEdit: boolean;
  theme?: { name: string; accent: string; background: string; buttonColor: string };
};

export function RoomListCard({ room, onView, onEdit, onDelete, deleting }: { room: ListedRoom; onView: () => void; onEdit: () => void; onDelete: () => void; deleting?: boolean }) {

  return <article className="rounded-2xl border border-[var(--border)] bg-[var(--soft-background)] p-3" aria-label={room.name}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><h3 className="break-words text-lg font-semibold text-[var(--foreground)]">{room.name}</h3><p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Host: {room.host}</p></div>
      <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${room.status === "Live" ? "bg-emerald-500/10 text-emerald-600" : "bg-[var(--control-background)] text-[var(--muted)]"}`}>{room.status}</span>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-[var(--muted)]">{room.viewers}</span>
      <div className="ml-auto flex gap-2">
        <button type="button" disabled={!room.canEdit || deleting} title={room.canEdit ? "Delete saved room" : "Only the room owner can delete this room"} onClick={onDelete} className="rounded-xl border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40" aria-label={`Delete ${room.name}`}>
          {deleting ? "..." : "Trash"}
        </button>
        <button type="button" disabled={!room.canEdit} title={room.canEdit ? "Edit room" : "Only the room owner can edit"} onClick={onEdit} className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--control-background)] disabled:cursor-not-allowed disabled:opacity-40">Edit</button>
        <button type="button" onClick={onView} className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-[#03150a] transition hover:bg-emerald-400">View</button>
      </div>
    </div>
  </article>;
}
