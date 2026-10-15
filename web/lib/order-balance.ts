/** Amount already collected on an order (down payment / payments). */
export function orderPaidAmount(order: { down_payment?: number | null }): number {
  return Math.max(0, Number(order?.down_payment || 0));
}

/** Finance money-flow `notes` prefix for goodwill write-offs (no account, no In/Out). */
export const UNCOLLECTED_GOODWILL_TX_NOTE_PREFIX = "uncollected_goodwill:";

export function isUncollectedGoodwillFinanceTx(
  notes?: string | null,
  description?: string | null,
): boolean {
  if (String(notes || "").startsWith(UNCOLLECTED_GOODWILL_TX_NOTE_PREFIX)) return true;
  return String(description || "").toLowerCase().includes("uncollected / goodwill");
}

/** Amount the owner chose not to collect (goodwill / write-off). */
export function orderUncollectedAmount(order: { uncollected_amount?: number | null }): number {
  return Math.max(0, Number(order?.uncollected_amount || 0));
}

/** Still collectible: total − paid − uncollected (never negative). */
export function orderCollectibleBalance(order: {
  total?: number | null;
  down_payment?: number | null;
  uncollected_amount?: number | null;
}): number {
  const total = Number(order?.total || 0);
  return Math.max(0, total - orderPaidAmount(order) - orderUncollectedAmount(order));
}

export function orderIdFromFinanceTx(tx: {
  order_id?: string | null;
  notes?: string | null;
}): string | null {
  if (tx.order_id) return String(tx.order_id);
  const m = String(tx.notes || "").match(
    /order:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return m?.[1] ?? null;
}

export function pesoAmountFromText(text?: string | null): number {
  const s = String(text || "");
  const m = s.match(/₱\s*([\d,]+(?:\.\d+)?)/) || s.match(/PHP\s*([\d,]+(?:\.\d+)?)/i);
  if (!m) return 0;
  const n = Number(String(m[1]).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Reverse paid / uncollected on the order when its finance money-flow row is deleted. */
export function orderPatchAfterDeletingFinanceTx(
  order: { down_payment?: number | null; uncollected_amount?: number | null },
  tx: {
    direction?: string | null;
    amount?: number | null;
    notes?: string | null;
    description?: string | null;
  },
): Record<string, unknown> | null {
  if (isUncollectedGoodwillFinanceTx(tx.notes, tx.description)) {
    const writeOff =
      pesoAmountFromText(tx.description) ||
      Number(tx.amount || 0) ||
      orderUncollectedAmount(order);
    const next = Math.max(0, orderUncollectedAmount(order) - writeOff);
    const patch: Record<string, unknown> = { uncollected_amount: next };
    if (next <= 0) patch.uncollected_note = null;
    return patch;
  }
  if (String(tx.direction || "").toLowerCase() === "in") {
    const amt = Number(tx.amount || 0);
    if (amt <= 0) return null;
    return { down_payment: Math.max(0, orderPaidAmount(order) - amt) };
  }
  return null;
}
