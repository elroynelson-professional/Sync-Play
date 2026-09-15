"use client";

import Link from "next/link";
import { useState } from "react";
import { socketUrl } from "../lib/socket";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [statusMessage, setStatusMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSending(true);
    setStatusMessage("");

    try {
      const response = await fetch(`${socketUrl}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      setStatusMessage(payload.error || payload.message || "Your message could not be sent.");
      if (response.ok) setForm({ name: "", email: "", message: "" });
    } catch {
      setStatusMessage("The contact service is unavailable. Please try again shortly.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-8 text-[var(--foreground)] sm:px-8 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border)] pb-5">
          <Link href="/" className="text-2xl font-semibold tracking-[-0.06em]">Sykonyx</Link>
          <Link href="/" className="rounded-xl border border-[var(--control-border)] bg-[var(--control-background)] px-4 py-2 text-sm font-semibold text-[var(--control-text)] transition hover:bg-[var(--control-background-hover)]">Back home</Link>
        </header>

        <div className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[0.85fr_1.15fr]">
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">Contact us</p>
            <h1 className="mt-4 max-w-lg text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Let&apos;s make watching together better.</h1>
            <p className="mt-5 max-w-md text-base leading-7 text-[var(--muted)]">Have a question, found something unexpected, or have an idea for Sykonyx? Send us a note and we&apos;ll get back to you.</p>
          </section>

          <form onSubmit={handleSubmit} className="rounded-[28px] border border-[var(--panel-border)] bg-[var(--panel-background)] p-5 shadow-2xl shadow-black/10 sm:p-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2"><span className="text-sm font-medium">Name</span><input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="syncplay-input w-full rounded-xl border px-3.5 py-3 text-sm outline-none" placeholder="Your name" /></label>
              <label className="space-y-2"><span className="text-sm font-medium">Email</span><input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="syncplay-input w-full rounded-xl border px-3.5 py-3 text-sm outline-none" placeholder="you@example.com" /></label>
            </div>
            <label className="mt-4 block space-y-2"><span className="text-sm font-medium">Message</span><textarea required minLength={10} rows={6} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} className="syncplay-input w-full resize-y rounded-xl border px-3.5 py-3 text-sm outline-none" placeholder="How can we help?" /></label>
            <button type="submit" disabled={isSending} className="syncplay-button-primary mt-5 rounded-xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">{isSending ? "Sending..." : "Send message"}</button>
            {statusMessage ? <p className="mt-4 text-sm text-[var(--muted)]" role="status">{statusMessage}</p> : null}
          </form>
        </div>
      </div>
    </main>
  );
}
