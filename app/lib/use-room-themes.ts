"use client";

import { useEffect, useState } from "react";
import { socketUrl } from "./socket";

export type SavedRoomTheme = { id: string; name: string; accent: string; background: string; buttonColor?: string };
const LEGACY_KEY = "syncplay-custom-room-themes-v1";

async function requestThemes(body?: object) {
  const response = await fetch(`${socketUrl}/api/room-themes`, {
    credentials: "include", method: body ? "POST" : "GET",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Could not update themes. Please try again.");
  return payload as { themes: SavedRoomTheme[]; migrated: boolean };
}

export function useRoomThemes(userId?: string) {
  const [themes, setThemes] = useState<SavedRoomTheme[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function load() {
      try {
        let payload = await requestThemes();
        if (!payload.migrated) {
          let legacy: SavedRoomTheme[] = [];
          try { legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]"); } catch { /* No legacy themes. */ }
          payload = await requestThemes({ action: "migrate", themes: Array.isArray(legacy) ? legacy : [] });
          try { localStorage.removeItem(LEGACY_KEY); } catch { /* Account storage is already saved. */ }
        }
        if (!cancelled) { setThemes(payload.themes); setError(""); }
      } catch (failure) { if (!cancelled) setError(failure instanceof Error ? failure.message : "Could not load saved themes."); }
    }
    void load();
    return () => { cancelled = true; };
  }, [userId]);
  async function update(body: object) {
    if (busy) return false;
    setBusy(true);
    try {
      const payload = await requestThemes(body);
      setThemes(payload.themes); setError(""); return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update themes."); return false;
    } finally { setBusy(false); }
  }
  return { themes, error, busy, save: (theme: SavedRoomTheme) => update({ action: "save", theme }), remove: (id: string) => update({ action: "remove", id }) };
}
