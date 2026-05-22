import type { SalesChannel } from "@/lib/sales";
import { getOrderKind, isBigSellerOnlineOrder, isSalesRecognized, storeOrPlatform } from "@/lib/sales";
import { mapRevenueChannelToKind } from "@/lib/revenue-excel-import";
import { resolveOnlineShop, resolveOthersListRow, type OnlineShopFilter, type OnlineShopKey } from "@/lib/online-shops";

export type ManualSaleRow = {
  id: string;
  sale_date: string;
  amount: number;
  description: string;
  channel: SalesChannel;
  revenue_channel?: string | null;
  product_service?: string | null;
  notes?: string | null;
  import_key?: string | null;
};

export type SalesTab = "all" | "walkin_online" | "online_shops" | "others" | "services" | "sublimation";

export type { OnlineShopFilter, OnlineShopKey };

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
  /** Bookkeeping / Excel revenue import (manual_sales). */
  isManualSale: boolean;
  manualSaleId: string;
  amount: number;
  /** Full order total (for context on deposit rows). */
  orderTotal: number;
  orderId: string;
  orderNo?: number | null;
  customerOrTitle: string;
  storeOrNotes: string;
  designRef: string;
  /** Human-readable description: notes, design ref, or deposit label */
  description: string;
  /** BigSeller-specific identifiers */
  waybillNo: string;
  externalOrderNo: string;
  skuCode: string;
  status?: string;
  /** Set when row belongs to a named online shop (Mensahe/Likha marketplace). */
  onlineShop: OnlineShopKey | null;
  /** Adjustments and misc revenue (separate Others tab, not Online Shops). */
  isOthersList: boolean;
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

/** Completed orders + deposit (down payment) rows → unified rows for sales list browsing. */
export function unifiedRowsFromOrders(orders: any[]): UnifiedSaleListRow[] {
  const out: UnifiedSaleListRow[] = [];
  for (const o of orders || []) {
    if (isBigSellerOnlineOrder(o)) continue;
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
    const isBigSeller = false;
    const hasTeamsSheet =
      channel === "sublimation" ||
      channel === "services" ||
      channel === "local" ||
      (channel === "online" && !isBigSeller);
    const orderTotal = Number(o.total || 0);

    const notes = String(o.notes || "").trim();
    const designRef = String(o.design_ref || "").trim();
    const storeLabel = storeOrPlatform(o);
    const onlineShop = resolveOnlineShop(storeLabel, { channel, isManualSale: false });
    const isOthersList = resolveOthersListRow(storeLabel, { channel, isManualSale: false });
    // Build description: prefer notes, fall back to design_ref
    const baseDesc = notes || designRef;

    if (recognized) {
      // Completed sale — show full total
      out.push({
        key: `o-${o.id}`,
        dateKey, atMs, channel, isBigSeller, hasTeamsSheet,
        isDeposit: false, isManualSale: false, manualSaleId: "", onlineShop, isOthersList,
        amount: orderTotal,
        orderTotal,
        orderId: String(o.id || ""),
        orderNo: o.order_no,
        customerOrTitle: String(o.customer_name || "—"),
        storeOrNotes: storeLabel,
        designRef,
        description: baseDesc,
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
        isDeposit: true, isManualSale: false, manualSaleId: "", onlineShop, isOthersList,
        amount: dp,
        orderTotal,
        orderId: String(o.id || ""),
        orderNo: o.order_no,
        customerOrTitle: String(o.customer_name || "—"),
        storeOrNotes: storeLabel,
        designRef,
        description: baseDesc,
        waybillNo: String(o.waybill_no || ""),
        externalOrderNo: String(o.external_order_no || ""),
        skuCode: String(o.sku_code || ""),
        status: String(o.status || ""),
      });
    }
  }
  return out;
}

/** Revenue workbook rows stored in manual_sales. */
export function unifiedRowsFromManualSales(manual: ManualSaleRow[]): UnifiedSaleListRow[] {
  const out: UnifiedSaleListRow[] = [];
  for (const m of manual || []) {
    const dateKey = String(m.sale_date || "").slice(0, 10);
    if (!dateKey) continue;
    const atMs = new Date(`${dateKey}T12:00:00`).getTime();
    const channel =
      (m.channel as SalesChannel) ||
      mapRevenueChannelToKind(String(m.revenue_channel || ""));
    const revenueChannel = String(m.revenue_channel || "").trim();
    const onlineShop = resolveOnlineShop(revenueChannel, { isManualSale: true, channel });
    const isOthersList = resolveOthersListRow(revenueChannel, { isManualSale: true, channel });
    const product = String(m.product_service || "").trim();
    const desc = String(m.description || "").trim();
    const notes = String(m.notes || "").trim();
    const description = [product, desc, notes].filter(Boolean).join(" · ") || "Revenue";

    out.push({
      key: `ms-${m.id}`,
      dateKey,
      atMs,
      channel,
      isBigSeller: false,
      hasTeamsSheet: false,
      isDeposit: false,
      isManualSale: true,
      manualSaleId: m.id,
      onlineShop,
      isOthersList,
      amount: Number(m.amount || 0),
      orderTotal: Number(m.amount || 0),
      orderId: "",
      orderNo: null,
      customerOrTitle: product || desc || "Revenue",
      storeOrNotes: revenueChannel || "—",
      designRef: "",
      description,
      waybillNo: "",
      externalOrderNo: "",
      skuCode: "",
    });
  }
  return out;
}

export function mergeUnifiedSaleRows(orders: any[], manual: ManualSaleRow[]): UnifiedSaleListRow[] {
  const combined = [...unifiedRowsFromOrders(orders), ...unifiedRowsFromManualSales(manual)];
  combined.sort((a, b) => b.atMs - a.atMs);
  return combined;
}

export function rowMatchesTab(
  r: UnifiedSaleListRow,
  tab: SalesTab,
  onlineShopFilter: OnlineShopFilter = "all",
): boolean {
  if (tab === "all") return true;
  if (tab === "walkin_online") {
    return (
      (r.channel === "local" || r.channel === "online") &&
      !r.isBigSeller &&
      r.onlineShop == null &&
      !r.isOthersList
    );
  }
  if (tab === "online_shops") {
    if (!r.onlineShop) return false;
    if (onlineShopFilter === "all") return true;
    return r.onlineShop === onlineShopFilter;
  }
  if (tab === "others") return r.isOthersList;
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
