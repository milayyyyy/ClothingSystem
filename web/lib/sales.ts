export type SalesChannel = "local" | "online" | "sublimation" | "services";

export const SALES_CHANNELS: readonly SalesChannel[] = ["local", "online", "sublimation", "services"];

/** Order is finished enough to count in revenue / channel sales (matches Reports “completed”). */
const RECOGNIZED_SALES_STATUSES = new Set(["delivered", "ready"]);

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

/** True when this order’s value counts toward completed sales totals. */
export function isSalesRecognized(status: string | null | undefined) {
  return RECOGNIZED_SALES_STATUSES.has(String(status || "").toLowerCase());
}

/** In-progress pipeline: not cancelled and not yet recognized as completed sale. */
export function isPendingPipelineOrder(status: string | null | undefined) {
  if (isOrderCancelled(status)) return false;
  return !isSalesRecognized(status);
}

/** @alias for “counts in completed sales aggregates” */
export function countsTowardSales(status: string | null | undefined) {
  return isSalesRecognized(status);
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
