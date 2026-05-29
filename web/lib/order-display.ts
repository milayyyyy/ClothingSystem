import { getOrderKind, isOrderCancelled } from "@/lib/sales";
import {
  ORDER_SERVICE_LABEL,
  normalizeOrderServiceStage,
  type OrderServiceStage,
} from "@/lib/order-services";

export type OrderStatusFields = {
  status?: string | null;
  stage?: string | null;
  sub_stage?: string | null;
  kind?: string | null;
  order_type?: string | null;
};

const SUBLIMATION_SUB_STAGE_LABELS: Record<string, string> = {
  design_layout: "Design & Layout",
  printing: "Printing",
  heatpress: "Heatpress",
  cut_sew: "Cut & Sew",
  reprint_error: "Reprint Error",
  quality_control: "Packaging & Quality Control",
  for_pickup: "For pick up",
};

export type OrderStatusBadgeVariant = "outline" | "amber" | "blue" | "green" | "red" | "teal";

/** Human-readable status for lists (dashboard, employee views). Prefers pipeline `stage` over legacy `status`. */
export function orderDisplayStatusLabel(order: OrderStatusFields): string {
  if (isOrderCancelled(order.status)) return "Cancelled";

  const kind = getOrderKind({
    kind: order.kind ?? undefined,
    order_type: order.order_type ?? undefined,
  });
  if (kind === "sublimation") {
    const sub = String(order.sub_stage || "").trim().toLowerCase();
    if (sub && SUBLIMATION_SUB_STAGE_LABELS[sub]) return SUBLIMATION_SUB_STAGE_LABELS[sub];
  }

  const stageRaw = String(order.stage || "").trim();
  if (stageRaw) {
    return ORDER_SERVICE_LABEL[normalizeOrderServiceStage(stageRaw)] || stageRaw.replace(/_/g, " ");
  }

  const status = String(order.status || "pending").toLowerCase();
  if (status === "delivered") return "Delivered";
  if (status === "ready") return "Ready";
  return String(order.status || "pending").replace(/_/g, " ");
}

export function orderDisplayStatusVariant(order: OrderStatusFields): OrderStatusBadgeVariant {
  if (isOrderCancelled(order.status)) return "red";

  const kind = getOrderKind({
    kind: order.kind ?? undefined,
    order_type: order.order_type ?? undefined,
  });
  if (kind === "sublimation") {
    const sub = String(order.sub_stage || "").toLowerCase().trim();
    if (sub === "for_pickup") return "green";
    if (sub === "quality_control") return "teal";
    if (sub === "reprint_error") return "red";
    if (sub === "printing" || sub === "heatpress" || sub === "cut_sew") return "blue";
    if (sub === "design_layout") return "amber";
    return "outline";
  }

  const stage = normalizeOrderServiceStage(order.stage) as OrderServiceStage;
  if (stage === "completed") return "green";
  if (stage === "for_pickup") return "teal";
  if (stage === "printing" || stage === "qc_packaging") return "blue";
  if (stage === "design_layout") return "amber";

  const status = String(order.status || "").toLowerCase();
  if (status === "ready" || status === "delivered") return "green";
  return "amber";
}
