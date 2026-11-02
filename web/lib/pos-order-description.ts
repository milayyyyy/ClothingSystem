/** Shared POS sale label used on the order, Sales list, finance, and daily records. */

export type PosDescItem = {
  product_name?: string | null;
  quantity?: number | null;
};

export function isPosOrderKind(order: { kind?: string | null; order_type?: string | null }): boolean {
  return String(order?.kind ?? order?.order_type ?? "").toLowerCase().trim() === "pos";
}

export function formatPosItemsSummary(items: PosDescItem[]): string {
  return (items || [])
    .map((i) => {
      const name = String(i.product_name || "").trim() || "Item";
      const q = Number(i.quantity);
      const qty = Number.isFinite(q) && q > 0 ? q : 1;
      const qtyLabel = Number.isInteger(qty) ? String(qty) : String(qty);
      return `${name} ×${qtyLabel}`;
    })
    .join(", ");
}

export function posSharedDescription(opts: {
  orderNo?: string | number | null;
  items?: PosDescItem[];
  extraNotes?: string | null;
}): string {
  const extra = String(opts.extraNotes || "").trim();
  if (/^POS\s+#/i.test(extra)) return extra;

  const no =
    opts.orderNo != null && String(opts.orderNo).trim() !== "" && String(opts.orderNo) !== "null"
      ? `#${opts.orderNo}`
      : null;
  const items = formatPosItemsSummary(opts.items || []);
  const head = [no ? `POS ${no}` : "POS", items || null].filter(Boolean).join(" — ");
  if (extra && extra !== head) return `${head}\n${extra}`;
  return head;
}

/** Prefer stored order notes so Sales list and POS orders stay identical. */
export function posDescriptionFromOrder(order: {
  order_no?: string | number | null;
  notes?: string | null;
  kind?: string | null;
  order_type?: string | null;
}): string {
  const notes = String(order.notes || "").trim();
  if (notes) return notes;
  if (!isPosOrderKind(order)) return notes;
  return posSharedDescription({ orderNo: order.order_no });
}
