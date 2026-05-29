"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function readSessionCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeSessionCache<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}

type Options<T> = {
  cacheKey: string;
  load: () => Promise<T>;
  /** Seed from server render when present (optional). */
  initial?: T | null;
};

/**
 * Loads page data on the client so route navigation shows the shell immediately.
 * Reuses sessionStorage for instant paint when revisiting a tab.
 */
export function useClientPageData<T>({ cacheKey, load, initial }: Options<T>) {
  const cached = readSessionCache<T>(cacheKey);
  const [data, setData] = useState<T | null>(() => initial ?? cached ?? null);
  const [loading, setLoading] = useState(() => (initial ?? cached) == null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const hasDataRef = useRef(data != null);
  hasDataRef.current = data != null;

  const refresh = useCallback(async () => {
    setError(null);
    if (!hasDataRef.current) setLoading(true);
    try {
      const next = await loadRef.current();
      setData(next);
      writeSessionCache(cacheKey, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [cacheKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh, setData };
}
