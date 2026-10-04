"use client";

import { useEffect, useId, useRef, useState } from "react";

const pad = (value: number) => String(value).padStart(2, "0");
function localDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function RoomSchedulePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selectedDay = value.split("T")[0];
  const time = value.split("T")[1] || "12:00";
  const [hour, minute] = time.split(":");
  const today = localDate(new Date());
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - first.getDay() + 1));

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function selectDay(day: Date) {
    onChange(`${localDate(day)}T${time}`);
    setMonth(new Date(day.getFullYear(), day.getMonth(), 1));
  }

  return <div ref={root} className="room-schedule-picker relative min-w-0 space-y-2" onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.preventDefault(); close(); }
  }} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <span id={`${id}-label`} className="block text-sm font-medium text-[var(--muted)]">Go live at</span>
    <button ref={trigger} type="button" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={`${id}-calendar`} onClick={() => {
      if (!open) {
        const date = value ? new Date(value) : new Date();
        setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
      }
      setOpen(!open);
    }} className="flex min-h-[54px] w-full items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--input-background)] px-4 py-3 text-left text-base text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-emerald-500">
      <span id={`${id}-value`} className={`min-w-0 truncate ${value ? "" : "text-[var(--muted)]"}`}>{value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Select date and time"}</span>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4M17 3v4M3 11h18" /></svg>
    </button>
    {open ? <div id={`${id}-calendar`} role="region" aria-label="Choose room date and time" className="absolute right-0 top-full z-30 mt-2 w-full min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--foreground)] shadow-xl shadow-black/15 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 aria-live="polite" className="text-sm font-semibold">{month.toLocaleDateString([], { month: "long", year: "numeric" })}</h3>
        <div className="flex gap-1">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="h-9 w-9 rounded-xl text-xl hover:bg-[var(--control-background)]">‹</button>
          <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="h-9 w-9 rounded-xl text-xl hover:bg-[var(--control-background)]">›</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span key={day} className="py-1 text-[10px] font-semibold uppercase text-[var(--muted)]">{day}</span>)}
        {days.map((day) => {
          const date = localDate(day);
          return <button key={date} type="button" aria-label={day.toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })} aria-pressed={selectedDay === date} aria-current={today === date ? "date" : undefined} onClick={() => selectDay(day)} className={`aspect-square min-w-0 rounded-xl text-xs font-medium focus-visible:outline-2 focus-visible:outline-emerald-500 ${selectedDay === date ? "bg-emerald-500 text-[#03150a]" : today === date ? "bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/40" : "hover:bg-[var(--control-background)]"} ${day.getMonth() !== month.getMonth() && selectedDay !== date ? "text-[var(--muted)] opacity-50" : ""}`}>{day.getDate()}</button>;
        })}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-3">
        <span className="text-xs text-[var(--muted)]">Time · 24-hour</span>
        <div className="flex items-center gap-1">
          <input aria-label="Hour" type="number" min="0" max="23" value={hour} onChange={(event) => { const next = event.target.value; if (next !== "" && Number(next) >= 0 && Number(next) <= 23) onChange(`${selectedDay || today}T${pad(Number(next))}:${minute}`); }} className="w-14 rounded-xl border border-[var(--border)] bg-[var(--input-background)] px-2 py-2 text-center text-sm focus-visible:outline-2 focus-visible:outline-emerald-500" />
          <span aria-hidden="true">:</span>
          <input aria-label="Minute" type="number" min="0" max="59" value={minute} onChange={(event) => { const next = event.target.value; if (next !== "" && Number(next) >= 0 && Number(next) <= 59) onChange(`${selectedDay || today}T${hour}:${pad(Number(next))}`); }} className="w-14 rounded-xl border border-[var(--border)] bg-[var(--input-background)] px-2 py-2 text-center text-sm focus-visible:outline-2 focus-visible:outline-emerald-500" />
        </div>
      </div>
      <p className="mt-2 text-[10px] text-[var(--muted)]">Your local time</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => { onChange(""); close(); }} className="rounded-xl px-3 py-2 text-xs text-[var(--muted)] hover:bg-[var(--control-background)]">Clear</button>
        <div className="flex gap-2">
          <button type="button" onClick={() => selectDay(new Date())} className="rounded-xl px-3 py-2 text-xs font-semibold hover:bg-[var(--control-background)]">Today</button>
          <button type="button" onClick={close} className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-[#03150a] hover:bg-emerald-400">Done</button>
        </div>
      </div>
    </div> : null}
  </div>;
}
