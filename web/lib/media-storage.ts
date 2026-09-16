export { ORDER_RECORD_BUCKET } from "@/lib/order-records";

export const EXPENSE_RECEIPTS_BUCKET = "expense-receipts";
export const JERSEY_DESIGNS_BUCKET = "jersey-designs";

export const TEAM_DESIGN_MAX = 24;

/** Object path inside a public/signed Supabase storage URL, or a raw path. */
export function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const s = String(url || "").trim();
  if (!s) return null;
  if (!s.includes("://")) {
    const path = s.replace(/^\/+/, "");
    return path || null;
  }
  try {
    const u = new URL(s);
    const markers = [`/object/public/${bucket}/`, `/object/sign/${bucket}/`, `/object/authenticated/${bucket}/`];
    for (const marker of markers) {
      const i = u.pathname.indexOf(marker);
      if (i >= 0) return decodeURIComponent(u.pathname.slice(i + marker.length));
    }
  } catch {
    return null;
  }
  return null;
}

export function sanitizeStorageSegment(value: string): string {
  const s = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
  return s || "item";
}

/** First unused `{orderId}/teams/{teamKey}/{n}.jpg` slot for this team's gallery. */
export function nextJerseyDesignPath(orderId: string, teamKey: string, existingUrls: string[]): string {
  const prefix = `${sanitizeStorageSegment(orderId)}/teams/${sanitizeStorageSegment(teamKey)}/`;
  const used = new Set(
    existingUrls
      .map((url) => storagePathFromPublicUrl(url, JERSEY_DESIGNS_BUCKET))
      .filter((p): p is string => Boolean(p && p.startsWith(prefix))),
  );
  for (let i = 0; i < TEAM_DESIGN_MAX; i++) {
    const path = `${prefix}${i}.jpg`;
    if (!used.has(path)) return path;
  }
  throw new Error(`At most ${TEAM_DESIGN_MAX} design photos per team.`);
}

export function expenseReceiptPath(expenseId: string, ext: "jpg" | "pdf"): string {
  return `${sanitizeStorageSegment(expenseId)}/receipt.${ext}`;
}
