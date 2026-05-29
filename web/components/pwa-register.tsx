"use client";

import { useEffect } from "react";

/** Registers the service worker (required for installability on Android / desktop Chrome). */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  }, []);

  return null;
}
