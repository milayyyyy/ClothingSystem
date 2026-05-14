export type SalesChannel = "local" | "online" | "sublimation" | "services";

export const SALES_CHANNELS: readonly SalesChannel[] = ["local", "online", "sublimation", "services"];

/** Legacy order_status enum values that count as a completed sale. */
const RECOGNIZED_SALES_STATUSES = new Set(["delivered", "ready"]);

/** Pipeline `stage` values that count as a completed sale.
 *  The order forward/bulk-forward flow only writes `stage`, never `status`,
 *  so we must check both fields. */
const RECOGNIZED_SALES_STAGES = new Set(["completed", "for_pickup"]);

export function parseSalesChannel(raw: string | null | undefined): SalesChannel {
  const s = String(raw || "local").toLowerCase().trim();
  if (s === "online" || s === "sublimation" || s === "services") return s;
  return "local";
}

export function getOrderKind(order: { kind?: string; order_type?: string }): SalesChannel {
  return parseSalesChannel(order?.kind ?? order?.order_type);
}

export function isOrderCancelled(status: string | null | undefined) {
  return String(status || "").toLowerCase() === "cancelled";
}

/** True when this order counts toward completed sales totals.
 *  Accepts either a raw status string or a full order object so callers
 *  do not need to know which field to check.
 *  Orders with a return_status ('returning' or 'returned') are excluded. */
export function isSalesRecognized(
  statusOrOrder: string | null | undefined | { status?: string | null; stage?: string | null; return_status?: string | null },
  stage?: string | null,
): boolean {
  if (statusOrOrder !== null && typeof statusOrOrder === "object") {
    const o = statusOrOrder as { status?: string | null; stage?: string | null; return_status?: string | null };
    // Exclude returned/returning orders from sales
    if (o.return_status) return false;
    if (RECOGNIZED_SALES_STATUSES.has(String(o.status || "").toLowerCase())) return true;
    if (RECOGNIZED_SALES_STAGES.has(String(o.stage || "").toLowerCase())) return true;
    return false;
  }
  const s = String(statusOrOrder || "").toLowerCase();
  if (RECOGNIZED_SALES_STATUSES.has(s)) return true;
  if (stage != null && RECOGNIZED_SALES_STAGES.has(String(stage || "").toLowerCase())) return true;
  return false;
}

/** In-progress pipeline: not cancelled and not yet a completed sale. */
export function isPendingPipelineOrder(
  statusOrOrder: string | null | undefined | { status?: string | null; stage?: string | null },
) {
  if (statusOrOrder !== null && typeof statusOrOrder === "object") {
    const o = statusOrOrder as { status?: string | null; stage?: string | null };
    if (isOrderCancelled(o.status)) return false;
    return !isSalesRecognized(o);
  }
  const s = statusOrOrder as string | null | undefined;
  if (isOrderCancelled(s)) return false;
  return !isSalesRecognized(s);
}

/** @alias */
export function countsTowardSales(
  statusOrOrder: string | null | undefined | { status?: string | null; stage?: string | null },
) {
  return isSalesRecognized(statusOrOrder);
}

export function storeOrPlatform(o: { source?: string | null }) {
  const s = String(o.source || "").trim();
  return s || "—";
}

export function orderTypeLabel(k: SalesChannel) {
  if (k === "online") return "Online";
  if (k === "sublimation") return "Sublimation";
  if (k === "services") return "Services";
  return "Walk in";
}

export function formatSalesDateTime(d: string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
