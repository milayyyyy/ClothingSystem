/** Canonical labels as they appear on BigSeller buyer message lines (reference for Stores → PDF label). */
export const BIGSELLER_KNOWN_STORE_NAMES = [
  "Likha. Tiktok",
  "Likha. Shopee",
  "Mensahe. Shopee",
  "Mensahe. Tiktok",
  "Padayon. Tiktok",
  "Padayon. Shopee",
  "Drips. Shopee",
  "Drips. Tiktok",
] as const;

export const BIGSELLER_KNOWN_STORES_SORTED = [...BIGSELLER_KNOWN_STORE_NAMES].sort((a, b) => b.length - a.length);

/** Excel / UI labels often use a comma (`Likha, Shopee`) instead of the canonical period. */
export function normalizeBigSellerStoreName(raw: string): string {
  const n = raw.trim();
  if (!n) return n;
  const compact = n.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  for (const known of BIGSELLER_KNOWN_STORE_NAMES) {
    const k = known.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
    if (compact === k) return known;
  }
  return n;
}
