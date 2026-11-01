"use client";

import { useCallback, useSyncExternalStore } from "react";
import { PRIVACY_COOKIE } from "@/lib/privacy";

function read(): boolean {
  return document.documentElement.classList.contains("privacy");
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Montos ocultos (****) o visibles. El estado vive en la clase `privacy` de <html>. */
export function usePrivacy() {
  const hidden = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    const next = !read();
    document.documentElement.classList.toggle("privacy", next);
    document.cookie = `${PRIVACY_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return { hidden, toggle };
}
