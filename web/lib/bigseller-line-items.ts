/** Extra marketplace product titles stored on orders.bigseller_line_items (Excel import rows 2+). */
export function parseBigSellerLineItems(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (typeof x === "string" ? x : typeof x === "object" && x && "title" in x ? String((x as { title?: string }).title) : ""))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}
