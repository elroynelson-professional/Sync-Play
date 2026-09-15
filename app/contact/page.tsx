"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { socketUrl } from "../lib/socket";
import { AppShell } from "../components/app-shell";
import { AuthPageLoading } from "../components/auth-page-loading";

type ContactUser = { id: string; name: string; email: string; createdAt: string };

const ACTIVE_USER_KEY = "syncplay-active-user-v1";

export default function ContactPage() {
  const router = useRouter();
  const [user, setUser] = useState<ContactUser | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(window.localStorage.getItem(ACTIVE_USER_KEY) || "null") as ContactUser | null;
    } catch {
      return null;
    }
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [statusMessage, setStatusMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    fetch(`${socketUrl}/api/auth/me`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          router.replace("/");
          return;
        }
        const payload = (await response.json()) as { user?: ContactUser };
        if (payload.user) setUser(payload.user);
      })
      .catch(() => router.replace("/"));
  }, [router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const signedInEmail = user?.email || "";
    setIsSending(true);
    setStatusMessage("");

    try {
      const response = await fetch(`${socketUrl}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, email: signedInEmail }),
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

  if (!user) return <AuthPageLoading />;

  async function signOut() {
    await fetch(`${socketUrl}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => undefined);
    window.localStorage.removeItem(ACTIVE_USER_KEY);
    router.replace("/");
  }

  return (
    <AppShell searchTerm={searchTerm} onSearchTermChange={setSearchTerm} searchPlaceholder="Search contact" user={user} onInbox={() => router.push("/dashboard?inbox=1&returnTo=%2Fcontact")} onAccountSettings={() => router.push("/dashboard?settings=1")} onCreateRoom={() => router.push("/dashboard")} onJoinRoom={() => router.push("/dashboard")} onHelp={() => router.push("/contact")} onLogout={signOut}>
      <div className="mx-auto grid max-w-5xl items-center gap-10 py-12 lg:grid-cols-[0.85fr_1.15fr]">
          <section>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--accent-strong)]">Contact us</p>
            <h1 className="mt-4 max-w-lg text-4xl font-semibold tracking-[-0.06em] sm:text-5xl">Let&apos;s make watching together better.</h1>
            <p className="mt-5 max-w-md text-base leading-7 text-[var(--muted)]">Have a question, found something unexpected, or have an idea for Sykonyx? Send us a note and we&apos;ll get back to you.</p>
          </section>

          <form onSubmit={handleSubmit} className="rounded-[28px] border border-[var(--panel-border)] bg-[var(--panel-background)] p-5 shadow-2xl shadow-black/10 sm:p-7">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2"><span className="text-sm font-medium">Name</span><input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="syncplay-input w-full rounded-xl border px-3.5 py-3 text-sm outline-none" placeholder="Your name" /></label>
              <label className="space-y-2"><span className="text-sm font-medium">Email</span><input required type="email" value={user.email} readOnly className="syncplay-input w-full cursor-not-allowed rounded-xl border px-3.5 py-3 text-sm outline-none opacity-75" aria-describedby="contact-email-note" /><span id="contact-email-note" className="block text-xs text-[var(--muted)]">Using your signed-in email</span></label>
            </div>
            <label className="mt-4 block space-y-2"><span className="text-sm font-medium">Message</span><textarea required minLength={10} rows={6} value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} className="syncplay-input w-full resize-y rounded-xl border px-3.5 py-3 text-sm outline-none" placeholder="How can we help?" /></label>
            <button type="submit" disabled={isSending} className="syncplay-button-primary mt-5 rounded-xl px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">{isSending ? "Sending..." : "Send message"}</button>
            {statusMessage ? <p className="mt-4 text-sm text-[var(--muted)]" role="status">{statusMessage}</p> : null}
          </form>
      </div>
    </AppShell>
  );
}
