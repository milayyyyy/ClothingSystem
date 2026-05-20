export type BigSellerDuplicateField = "waybill" | "order_no" | "bigseller_code";

export const BIGSELLER_DUPLICATE_FIELD_LABELS: Record<BigSellerDuplicateField, string> = {
  waybill: "Waybill",
  order_no: "Order no.",
  bigseller_code: "BigSeller code",
};

export type BigSellerIdentifiableOrder = {
  id: string;
  waybill_no?: string | null;
  external_order_no?: string | null;
  sku_code?: string | null;
};

export type BigSellerDuplicateGroup<T extends BigSellerIdentifiableOrder = BigSellerIdentifiableOrder> = {
  field: BigSellerDuplicateField;
  label: string;
  value: string;
  orders: T[];
};

export type BigSellerOrderDuplicateInfo = {
  isDuplicate: boolean;
  reasons: BigSellerDuplicateField[];
};

function normKey(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function pushToMap<T>(map: Map<string, T[]>, key: string, item: T) {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

/** Groups of BigSeller orders that share the same waybill, marketplace order no., or BigSeller code. */
export function buildBigSellerDuplicateGroups<T extends BigSellerIdentifiableOrder>(
  orders: T[],
): BigSellerDuplicateGroup<T>[] {
  const waybillMap = new Map<string, T[]>();
  const externalMap = new Map<string, T[]>();
  const skuMap = new Map<string, T[]>();

  for (const o of orders) {
    const wb = normKey(o.waybill_no);
    const ext = normKey(o.external_order_no);
    const sku = normKey(o.sku_code);
    if (wb) pushToMap(waybillMap, wb, o);
    if (ext) pushToMap(externalMap, ext, o);
    if (sku) pushToMap(skuMap, sku, o);
  }

  const groups: BigSellerDuplicateGroup<T>[] = [];
  const seen = new Set<string>();

  for (const [k, list] of waybillMap) {
    if (list.length > 1 && !seen.has(`w:${k}`)) {
      seen.add(`w:${k}`);
      groups.push({
        field: "waybill",
        label: BIGSELLER_DUPLICATE_FIELD_LABELS.waybill,
        value: String(list[0].waybill_no || "").trim(),
        orders: list,
      });
    }
  }
  for (const [k, list] of externalMap) {
    if (list.length > 1 && !seen.has(`e:${k}`)) {
      seen.add(`e:${k}`);
      groups.push({
        field: "order_no",
        label: BIGSELLER_DUPLICATE_FIELD_LABELS.order_no,
        value: String(list[0].external_order_no || "").trim(),
        orders: list,
      });
    }
  }
  for (const [k, list] of skuMap) {
    if (list.length > 1 && !seen.has(`s:${k}`)) {
      seen.add(`s:${k}`);
      groups.push({
        field: "bigseller_code",
        label: BIGSELLER_DUPLICATE_FIELD_LABELS.bigseller_code,
        value: String(list[0].sku_code || "").trim(),
        orders: list,
      });
    }
  }

  return groups;
}

export function buildBigSellerDuplicateIndex<T extends BigSellerIdentifiableOrder>(
  orders: T[],
): { groups: BigSellerDuplicateGroup<T>[]; byOrderId: Map<string, BigSellerOrderDuplicateInfo> } {
  const groups = buildBigSellerDuplicateGroups(orders);
  const byOrderId = new Map<string, BigSellerOrderDuplicateInfo>();
  for (const o of orders) {
    byOrderId.set(String(o.id), { isDuplicate: false, reasons: [] });
  }
  for (const g of groups) {
    for (const o of g.orders) {
      const info = byOrderId.get(String(o.id));
      if (!info) continue;
      info.isDuplicate = true;
      if (!info.reasons.includes(g.field)) info.reasons.push(g.field);
    }
  }
  return { groups, byOrderId };
}

export function formatBigSellerDuplicateReasons(reasons: BigSellerDuplicateField[]): string {
  return reasons.map((r) => BIGSELLER_DUPLICATE_FIELD_LABELS[r]).join(", ");
}
