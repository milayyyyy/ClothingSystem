/** Drop per-tab page caches so a new login cannot reuse another user's shell or data. */
export function clearClientAuthCache() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.clear();
  } catch {
    /* private mode */
  }
}
