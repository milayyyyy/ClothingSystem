/** Local / online order fulfillment pipeline (stored in `orders.stage`). */
export const ORDER_SERVICE_STAGES = [
  "design_layout",
  "printing",
  "qc_packaging",
  "for_pickup",
  "completed",
] as const;

export type OrderServiceStage = (typeof ORDER_SERVICE_STAGES)[number];

export const ORDER_SERVICE_LABEL: Record<string, string> = {
  design_layout: "Design & Layout",
  printing: "Printing",
  qc_packaging: "QC & Packaging",
  for_pickup: "For Pick up",
  completed: "Completed",
  // legacy keys (pre-migration or old data)
  preparing: "Design & Layout",
  packing_qc: "QC & Packaging",
  shipped: "Completed",
  complete: "Completed",
};

export function normalizeOrderServiceStage(raw: string | null | undefined): OrderServiceStage {
  const s = String(raw || "").trim();
  const map: Record<string, OrderServiceStage> = {
    preparing: "design_layout",
    packing_qc: "qc_packaging",
    shipped: "completed",
    complete: "completed",
  };
  if (map[s]) return map[s];
  if ((ORDER_SERVICE_STAGES as readonly string[]).includes(s)) return s as OrderServiceStage;
  return "design_layout";
}

/** Next pipeline step, or `null` if already at the terminal stage (`completed`). */
export function nextOrderServiceStage(raw: string | null | undefined): OrderServiceStage | null {
  const s = normalizeOrderServiceStage(raw);
  const idx = (ORDER_SERVICE_STAGES as readonly string[]).indexOf(s);
  if (idx < 0) return ORDER_SERVICE_STAGES[0] ?? null;
  if (idx >= ORDER_SERVICE_STAGES.length - 1) return null;
  return ORDER_SERVICE_STAGES[idx + 1]!;
}

/** If a sublimation order has no `stage` yet, map `sub_stage` to the closest Services step. */
export function defaultServiceStageFromSubStage(sub: string | null | undefined): OrderServiceStage {
  const s = String(sub || "").trim();
  if (s === "quality_control") return "qc_packaging";
  if (s === "for_pickup") return "for_pickup";
  if (["heatpress", "cut_sew", "reprint_error", "printing"].includes(s)) return "printing";
  if (s === "design_layout") return "design_layout";
  return "design_layout";
}
