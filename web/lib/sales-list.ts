import type { SalesChannel } from "@/lib/sales";
import { getOrderKind, isSalesRecognized, storeOrPlatform } from "@/lib/sales";

export type SalesTab = "all" | "walkin_online" | "bigseller" | "services" | "sublimation";

export type UnifiedSaleListRow = {
  key: string;
  /** YYYY-MM-DD for range checks (local calendar day for orders from updated_at) */
  dateKey: string;
  atMs: number;
  channel: SalesChannel;
  /** True when the order came from a BigSeller PDF import. */
  isBigSeller: boolean;
  /** True for order types that support a Teams & Jerseys sheet. */
  hasTeamsSheet: boolean;
  /** True when this row represents a recorded down payment on a pending order. */
  isDeposit: boolean;
  amount: number;
  /** Full order total (for context on deposit rows). */
  orderTotal: number;
  orderId: string;
  orderNo?: number | null;
  customerOrTitle: string;
  storeOrNotes: string;
  designRef: string;
  /** BigSeller-specific identifiers */
  waybillNo: string;
  externalOrderNo: string;
  skuCode: string;
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

function detectBigSeller(o: any): boolean {
  if (getOrderKind(o) !== "online") return false;
  const src = String(o?.source || "").toLowerCase();
  if (src.includes("bigseller")) return true;
  const notes = String(o?.notes || "").toLowerCase();
  if (notes.includes("imported from bigseller pdf")) return true;
  if (notes.includes("bigseller") && notes.includes("pdf") && notes.includes("import")) return true;
  return false;
}

/** Completed orders + deposit (down payment) rows → unified rows for sales list browsing. */
export function unifiedRowsFromOrders(orders: any[]): UnifiedSaleListRow[] {
  const out: UnifiedSaleListRow[] = [];
  for (const o of orders || []) {
    const recognized = isSalesRecognized(o);
    const dp = Number(o.down_payment || 0);

    // Skip entirely if not recognized and no down payment
    if (!recognized && dp <= 0) continue;
    // Skip returned/returning orders
    if (o.return_status) continue;

    const iso = String(o.updated_at || o.created_at || "");
    const dateKey = localDateKeyFromIso(iso);
    const atMs = new Date(iso || o.created_at).getTime();
    const channel = getOrderKind(o);
    const isBigSeller = detectBigSeller(o);
    const hasTeamsSheet =
      channel === "sublimation" ||
      channel === "services" ||
      channel === "local" ||
      (channel === "online" && !isBigSeller);
    const orderTotal = Number(o.total || 0);

    if (recognized) {
      // Completed sale — show full total
      out.push({
        key: `o-${o.id}`,
        dateKey, atMs, channel, isBigSeller, hasTeamsSheet,
        isDeposit: false,
        amount: orderTotal,
        orderTotal,
        orderId: String(o.id || ""),
        orderNo: o.order_no,
        customerOrTitle: String(o.customer_name || "—"),
        storeOrNotes: storeOrPlatform(o),
        designRef: String(o.design_ref || ""),
        waybillNo: String(o.waybill_no || ""),
        externalOrderNo: String(o.external_order_no || ""),
        skuCode: String(o.sku_code || ""),
        status: String(o.status || ""),
      });
    } else if (dp > 0) {
      // Pending order with a recorded down payment — show as deposit row
      out.push({
        key: `dp-${o.id}`,
        dateKey, atMs, channel, isBigSeller, hasTeamsSheet,
        isDeposit: true,
        amount: dp,
        orderTotal,
        orderId: String(o.id || ""),
        orderNo: o.order_no,
        customerOrTitle: String(o.customer_name || "—"),
        storeOrNotes: storeOrPlatform(o),
        designRef: String(o.design_ref || ""),
        waybillNo: String(o.waybill_no || ""),
        externalOrderNo: String(o.external_order_no || ""),
        skuCode: String(o.sku_code || ""),
        status: String(o.status || ""),
      });
    }
  }
  out.sort((a, b) => b.atMs - a.atMs);
  return out;
}

export function rowMatchesTab(r: UnifiedSaleListRow, tab: SalesTab): boolean {
  if (tab === "all") return true;
  if (tab === "bigseller") return r.isBigSeller;
  if (tab === "walkin_online") return (r.channel === "local" || r.channel === "online") && !r.isBigSeller;
  if (tab === "services") return r.channel === "services";
  if (tab === "sublimation") return r.channel === "sublimation";
  return true;
}

export function defaultSalesListDateRange(): { from: string; to: string } {
  const now = new Date();
  const to = localDateKeyFromIso(now.toISOString());
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = localDateKeyFromIso(first.toISOString());
  return { from, to };
}
