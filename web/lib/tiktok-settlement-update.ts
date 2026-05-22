import { BIGSELLER_ORDERS_OR_FILTER } from "@/lib/bigseller-orders-query";
import { normalizeImportDedupeKey } from "@/lib/bigseller-import-dedupe";

export type TikTokOrderForSettlement = {
  id: string;
  external_order_no: string | null;
  sku_code: string | null;
  unit_price: number | null;
  total: number | null;
  notes: string | null;
  customer_name: string | null;
};

/** Resolve settlement amount for a DB row (Order ID = external_order_no or sku_code). */
export function settlementAmountForOrder(
  order: Pick<TikTokOrderForSettlement, "external_order_no" | "sku_code">,
  settlementByOrderId: Map<string, number>,
): number | undefined {
  const ext = normalizeImportDedupeKey(order.external_order_no);
  if (ext) {
    const fromExt = settlementByOrderId.get(ext);
    if (fromExt != null && fromExt > 0) return fromExt;
  }
  const sku = normalizeImportDedupeKey(order.sku_code);
  if (sku) {
    const fromSku = settlementByOrderId.get(sku);
    if (fromSku != null && fromSku > 0) return fromSku;
  }
  return undefined;
}

export type TikTokSettlementPlannedUpdate = {
  orderId: string;
  externalOrderNo: string;
  customerName: string | null;
  previousAmount: number;
  newAmount: number;
};

export function isTikTokShopOrderNotes(notes: string | null | undefined): boolean {
  const n = (notes || "").toLowerCase();
  return n.includes("tiktok shop");
}

/** Order imported from TikTok Excel but settlement not applied yet. */
export function isTikTokSettlementPending(
  notes: string | null | undefined,
  unitPrice: number | null | undefined,
): boolean {
  if (!isTikTokShopOrderNotes(notes)) return false;
  const n = (notes || "").toLowerCase();
  if (!n.includes("pending tiktok settlement")) return false;
  return (Number(unitPrice) || 0) <= 0;
}

export function applySettlementToOrderNotes(notes: string | null, fileName: string): string {
  const base = (notes || "").trim();
  const withoutPending = base.replace(/\s*Unit price pending TikTok settlement import\./gi, "").trim();
  const marker = `Unit price from settlement file (${fileName || "settlement"}).`;
  if (withoutPending.toLowerCase().includes("unit price from settlement file")) {
    return withoutPending;
  }
  return withoutPending ? `${withoutPending} ${marker}` : marker;
}

/** Match settlement file Order/Adjustment ID → orders.external_order_no (Order ID). */
export function planTikTokSettlementUpdates(
  orders: TikTokOrderForSettlement[],
  settlementByOrderId: Map<string, number>,
): {
  updates: TikTokSettlementPlannedUpdate[];
  unmatchedSettlementCount: number;
  ordersWithoutSettlement: number;
  matchedOrderCount: number;
} {
  const updates: TikTokSettlementPlannedUpdate[] = [];
  const matchedSettlementKeys = new Set<string>();
  let matchedOrderCount = 0;

  for (const order of orders) {
    const amount = settlementAmountForOrder(order, settlementByOrderId);
    if (amount == null) continue;

    matchedOrderCount += 1;
    const ext = normalizeImportDedupeKey(order.external_order_no) || normalizeImportDedupeKey(order.sku_code);
    if (ext) matchedSettlementKeys.add(ext);

    const prev = Number(order.unit_price) || Number(order.total) || 0;
    const next = Math.round(amount * 100) / 100;
    if (Math.abs(prev - next) < 0.005) continue;

    updates.push({
      orderId: order.id,
      externalOrderNo: String(order.external_order_no || order.sku_code || "").trim(),
      customerName: order.customer_name,
      previousAmount: prev,
      newAmount: next,
    });
  }

  let unmatchedSettlementCount = 0;
  for (const key of settlementByOrderId.keys()) {
    if (!matchedSettlementKeys.has(key)) unmatchedSettlementCount += 1;
  }

  const ordersWithId = orders.filter(
    (o) => normalizeImportDedupeKey(o.external_order_no) || normalizeImportDedupeKey(o.sku_code),
  );
  const ordersWithoutSettlement = ordersWithId.filter(
    (o) => settlementAmountForOrder(o, settlementByOrderId) == null,
  ).length;

  return { updates, unmatchedSettlementCount, ordersWithoutSettlement, matchedOrderCount };
}

/** Paginated load of marketplace orders with Order ID (external_order_no) for settlement matching. */
export async function fetchTikTokOrdersForSettlement(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ orders: TikTokOrderForSettlement[]; error: string | null }> {
  const all: TikTokOrderForSettlement[] = [];
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("orders")
      .select("id,external_order_no,sku_code,unit_price,total,notes,customer_name")
      .or(BIGSELLER_ORDERS_OR_FILTER)
      .range(from, from + pageSize - 1);

    if (error) return { orders: [], error: error.message };
    const batch = (data || []) as TikTokOrderForSettlement[];
    for (const o of batch) {
      if (normalizeImportDedupeKey(o.external_order_no) || normalizeImportDedupeKey(o.sku_code)) {
        all.push(o);
      }
    }
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return { orders: all, error: null };
}
