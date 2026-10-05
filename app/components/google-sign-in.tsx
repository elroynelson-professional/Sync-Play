"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { socketUrl } from "../lib/socket";

type GoogleUser = { id: string; name: string; email: string; createdAt: string; profileImage?: string | null };
type GoogleIdentity = { initialize: (options: { client_id: string; nonce: string; callback: (response: { credential: string }) => void; auto_select: boolean }) => void; renderButton: (element: HTMLElement, options: { type: string; theme: string; size: string; text: string; shape: string; width: number }) => void };
declare global { interface Window { google?: { accounts: { id: GoogleIdentity } } } }

export function GoogleSignIn({ onSuccess }: { onSuccess: (user: GoogleUser) => void }) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const successRef = useRef(onSuccess);
  const busyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [config, setConfig] = useState<{ clientId: string; nonce: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkCredential, setLinkCredential] = useState("");
  const [password, setPassword] = useState("");
  useEffect(() => { successRef.current = onSuccess; }, [onSuccess]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${socketUrl}/api/auth/google/config`, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Google sign-in is unavailable."); setConfig(payload); })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Google sign-in is unavailable."); });
    return () => controller.abort();
  }, [attempt]);
  const authenticate = useCallback(async (credential: string, accountPassword?: string) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`${socketUrl}/api/auth/google`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential, ...(accountPassword ? { password: accountPassword } : {}) }) });
      const payload = await response.json();
      if (!response.ok) {
        if (payload.code === "LINK_REQUIRED") setLinkCredential(credential);
        else setLinkCredential("");
        throw new Error(payload.error || "Google sign-in failed. Please try again.");
      }
      setLinkCredential(""); setPassword(""); successRef.current(payload.user);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Google sign-in failed. Please try again."); }
    finally { busyRef.current = false; setBusy(false); }
  }, []);
  useEffect(() => {
    if (!ready || !config || !buttonRef.current || !window.google) return;
    const element = buttonRef.current;
    window.google.accounts.id.initialize({ client_id: config.clientId, nonce: config.nonce, auto_select: false, callback: ({ credential }) => { void authenticate(credential); } });
    window.google.accounts.id.renderButton(element, { type: "standard", theme: "outline", size: "large", text: "continue_with", shape: "pill", width: Math.min(360, element.clientWidth || 280) });
    return () => { element.replaceChildren(); };
  }, [ready, config, authenticate]);
  function retry() { setConfig(null); setError(""); setPassword(""); setLinkCredential(""); setAttempt((value) => value + 1); }
  return <div className="mb-5 space-y-3">
    {config ? <Script key={attempt} src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setReady(true)} onError={() => setError("Google could not load. Check your connection and try again.")} /> : null}
    <div ref={buttonRef} className={busy || linkCredential ? "hidden" : "flex min-h-10 justify-center"} />
    {!config && !error ? <p role="status" className="text-center text-xs text-[var(--muted)]">Loading Google sign-in…</p> : null}
    {busy ? <p role="status" className="text-center text-sm text-[var(--muted)]">Signing in with Google…</p> : null}
    {linkCredential ? <form onSubmit={(event) => { event.preventDefault(); void authenticate(linkCredential, password); }} className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
      <label className="block text-sm text-[var(--foreground)]">Your existing Sykonyx password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--input-background)] px-3 py-2" /></label>
      <button disabled={busy || !password} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">Connect Google</button>
      <button type="button" disabled={busy} onClick={retry} className="ml-3 text-sm text-[var(--muted)]">Cancel</button>
    </form> : null}
    {error ? <div role="alert" className="text-center text-xs text-[var(--muted)]"><p>{error}</p>{!linkCredential ? <button type="button" onClick={retry} className="mt-2 underline">Try again</button> : null}</div> : null}
    <div className="flex items-center gap-3 text-xs text-[var(--muted)]"><span className="h-px flex-1 bg-[var(--border)]" />or continue with email<span className="h-px flex-1 bg-[var(--border)]" /></div>
  </div>;
}
