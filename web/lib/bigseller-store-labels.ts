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
