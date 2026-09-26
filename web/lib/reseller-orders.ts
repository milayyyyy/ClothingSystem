import { findSkuForOptionIds, skuOptionLabels, type ResellerProduct } from "@/lib/reseller-products";

export type ResellerOrderStatus = "pending" | "confirmed" | "cancelled";

export type ResellerOrderItem = {
  product_id: string;
  name: string;
  sku: string;
  option_labels: string[];
  qty: number;
  price: number;
};

export type ResellerOrder = {
  id: string;
  reseller_id: string;
  reseller_name: string;
  items: ResellerOrderItem[];
  notes: string;
  status: ResellerOrderStatus;
  created_at: string;
};

export function resellerOrdersTableMissing(message: string) {
  return /reseller_orders|schema cache|does not exist/i.test(message);
}

export function listedCatalog(products: ResellerProduct[]) {
  return products.filter((p) => p.status === "listed" && p.name.trim());
}

export function orderItemFromProduct(
  product: ResellerProduct,
  optionIds: string[] = [],
  qty = 1,
  amount?: number,
): ResellerOrderItem | null {
  const sku = findSkuForOptionIds(product, optionIds);
  if (!sku) return null;
  const n = Math.max(1, Math.floor(Number(qty) || 1));
  const price = Number.isFinite(Number(amount)) ? Number(amount) : Number(sku.price) || 0;
  return {
    product_id: product.id,
    name: product.name.trim(),
    sku: sku.sku || "",
    option_labels: skuOptionLabels(sku, product.variations),
    qty: n,
    price,
  };
}

export function orderLineTotal(item: ResellerOrderItem) {
  return (Number(item.price) || 0) * (Number(item.qty) || 0);
}

export function orderTotal(items: ResellerOrderItem[]) {
  return items.reduce((sum, item) => sum + orderLineTotal(item), 0);
}

function asItems(value: unknown): ResellerOrderItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const o = row as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name : "";
      if (!name) return null;
      return {
        product_id: typeof o.product_id === "string" ? o.product_id : "",
        name,
        sku: typeof o.sku === "string" ? o.sku : "",
        option_labels: Array.isArray(o.option_labels) ? o.option_labels.filter((x): x is string => typeof x === "string") : [],
        qty: Math.max(1, Math.floor(Number(o.qty) || 1)),
        price: Number(o.price) || 0,
      };
    })
    .filter((x): x is ResellerOrderItem => Boolean(x));
}

export function parseResellerOrder(row: Record<string, unknown>): ResellerOrder {
  const profile = row.profiles && typeof row.profiles === "object" ? (row.profiles as { full_name?: unknown; email?: unknown }) : null;
  const name =
    (typeof profile?.full_name === "string" && profile.full_name.trim()) ||
    (typeof profile?.email === "string" && profile.email) ||
    "Reseller";
  const status = row.status;
  return {
    id: String(row.id || ""),
    reseller_id: String(row.reseller_id || ""),
    reseller_name: name,
    items: asItems(row.items),
    notes: typeof row.notes === "string" ? row.notes : "",
    status: status === "confirmed" || status === "cancelled" ? status : "pending",
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}
