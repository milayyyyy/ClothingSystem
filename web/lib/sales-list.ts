import type { SalesChannel } from "@/lib/sales";
import { getOrderKind, isSalesRecognized, storeOrPlatform } from "@/lib/sales";

export type UnifiedSaleListRow = {
  key: string;
  /** YYYY-MM-DD for range checks (local calendar day for orders from updated_at) */
  dateKey: string;
  atMs: number;
  channel: SalesChannel;
  amount: number;
  orderNo?: number | null;
  customerOrTitle: string;
  storeOrNotes: string;
  status?: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function localDateKeyFromIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Completed orders only → unified rows for sales list browsing. */
export function unifiedRowsFromOrders(orders: any[]): UnifiedSaleListRow[] {
  const out: UnifiedSaleListRow[] = [];
  for (const o of orders || []) {
    if (!isSalesRecognized(o.status)) continue;
    const iso = String(o.updated_at || o.created_at || "");
    const dateKey = localDateKeyFromIso(iso);
    const atMs = new Date(iso || o.created_at).getTime();
    out.push({
      key: `o-${o.id}`,
      dateKey,
      atMs,
      channel: getOrderKind(o),
      amount: Number(o.total || 0),
      orderNo: o.order_no,
      customerOrTitle: String(o.customer_name || "—"),
      storeOrNotes: storeOrPlatform(o),
      status: String(o.status || ""),
    });
  }
  out.sort((a, b) => b.atMs - a.atMs);
  return out;
}

export function defaultSalesListDateRange(): { from: string; to: string } {
  const now = new Date();
  const to = localDateKeyFromIso(now.toISOString());
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = localDateKeyFromIso(first.toISOString());
  return { from, to };
}
