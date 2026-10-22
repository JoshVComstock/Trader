"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_THEME, THEME_COOKIE, type Theme } from "@/lib/theme";

export type { Theme };

function readTheme(): Theme {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function persistTheme(theme: Theme) {
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  // Equivalente a disableTransitionOnChange: sin transiciones durante el cambio.
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none!important}";
  document.head.appendChild(style);

  el.classList.remove("light", "dark");
  el.classList.add(theme);
  el.style.colorScheme = theme;

  window.getComputedStyle(document.body);
  setTimeout(() => style.remove(), 1);
}

/**
 * Migra a la cookie el tema que next-themes guardaba en localStorage
 * (solo pasa una vez, para usuarios que ya tenían "light").
 */
export function migrateLegacyTheme() {
  try {
    if (document.cookie.split("; ").some((c) => c.startsWith(`${THEME_COOKIE}=`))) return;
    const legacy = localStorage.getItem("theme");
    if (legacy === "light" || legacy === "dark") {
      persistTheme(legacy);
      applyTheme(legacy);
    }
  } catch {}
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => DEFAULT_THEME);

  const setTheme = useCallback((next: Theme) => {
    persistTheme(next);
    applyTheme(next);
  }, []);

  return { theme, resolvedTheme: theme, setTheme };
}
