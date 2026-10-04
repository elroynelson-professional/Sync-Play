"use client";

import { useEffect, useId, useRef, useState } from "react";

type SavedTheme = { id: string; name: string; accent: string; background: string; buttonColor?: string };

export function RoomThemePicker({ value, themes, onChange, onRemove }: {
  value: string;
  themes: SavedTheme[];
  onChange: (value: string) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = themes.find((theme) => `saved:${theme.id}` === value);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <div ref={root} className="relative min-w-0 space-y-2" onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    }} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <span id={`${id}-label`} className="block text-sm font-medium text-[var(--muted)]">Room theme</span>
      <button ref={trigger} type="button" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={`${id}-menu`} onClick={() => setOpen(!open)} className="room-theme-trigger flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-4 py-3 text-left text-base text-[var(--foreground)] outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border)]" style={{ background: selected?.background || "var(--soft-background)" }} aria-hidden="true">
          {selected ? <span className="h-3 w-3 rounded-full" style={{ background: selected.accent }} /> : "+"}
        </span>
        <span id={`${id}-value`} className="min-w-0 flex-1 truncate">{selected?.name || "Custom theme"}</span>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={open ? "rotate-180" : ""}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open ? (
        <div id={`${id}-menu`} role="region" aria-label="Room theme choices" className="room-theme-menu absolute inset-x-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl shadow-black/15">
          <button type="button" onClick={() => choose("custom")} aria-pressed={!selected} className={`room-theme-option flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium ${!selected ? "bg-emerald-500/10 text-[var(--foreground)]" : "text-[var(--muted)] hover:bg-[var(--control-background)]"}`}>
            <span aria-hidden="true" className="text-lg text-emerald-500">+</span>
            <span className="flex-1">Custom theme</span>
            {!selected ? <span aria-hidden="true" className="text-emerald-500">✓</span> : null}
          </button>
          {themes.length ? <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">Saved themes</p> : null}
          {themes.map((theme) => (
            <div key={theme.id} className={`flex items-center gap-1 rounded-xl ${value === `saved:${theme.id}` ? "bg-emerald-500/10" : "hover:bg-[var(--control-background)]"}`}>
              <button type="button" onClick={() => choose(`saved:${theme.id}`)} aria-pressed={value === `saved:${theme.id}`} className="room-theme-option flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-[var(--foreground)]">
                <span aria-hidden="true" className="flex shrink-0 -space-x-1">
                  {[theme.background, theme.accent, theme.buttonColor || theme.accent].map((color, index) => <span key={index} className="h-4 w-4 rounded-full border border-[var(--border)]" style={{ background: color }} />)}
                </span>
                <span className="min-w-0 flex-1 truncate">{theme.name}</span>
                {value === `saved:${theme.id}` ? <span aria-hidden="true" className="text-emerald-500">✓</span> : null}
              </button>
              <button type="button" aria-label={`Delete saved theme ${theme.name}`} title={`Delete ${theme.name}`} onClick={() => { onRemove(theme.id); trigger.current?.focus(); }} className="room-theme-delete mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--muted)] transition hover:bg-rose-500/10 hover:text-rose-500 focus-visible:outline-2 focus-visible:outline-emerald-500">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
