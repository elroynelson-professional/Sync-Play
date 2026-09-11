"use client";

import { useEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "syncplay-theme";
const THEME_CHANGE_EVENT = "syncplay-theme-change";

function getThemeSnapshot(): Theme {
  return window.sessionStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
}

function getServerThemeSnapshot(): Theme {
  return "dark";
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, callback);

  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, callback);
  };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";

    window.sessionStorage.setItem(STORAGE_KEY, nextTheme);
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  const nextThemeLabel = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextThemeLabel} mode`}
      title={`Switch to ${nextThemeLabel} mode`}
      className="syncplay-theme-toggle"
    >
      <span aria-hidden="true" className="text-lg leading-none">
        {theme === "dark" ? "☾" : "☀"}
      </span>
    </button>
  );
}
