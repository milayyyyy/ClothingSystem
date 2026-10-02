import { findSkuForOptionIds, skuOptionLabels, type ResellerProduct } from "@/lib/reseller-products";

export type ResellerOrderStatus = "pending" | "confirmed" | "cancelled";
export type ResellerPaymentStatus = "pending_review" | "approved" | "rejected";
export type ResellerOrderProcess =
  | "draft"
  | "pending_checking"
  | "processing"
  | "ready_to_ship"
  | "completed"
  | "cancelled";

export const DEFAULT_RESELLER_DOWNPAYMENT_PERCENT = 30;

export const RESELLER_ORDER_PROCESSES: { value: ResellerOrderProcess; label: string }[] = [
  { value: "draft", label: "Draft order" },
  { value: "pending_checking", label: "Pending/checking" },
  { value: "processing", label: "Processing order" },
  { value: "ready_to_ship", label: "Ready for ship" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Canceled/failed" },
];

export const RESELLER_PROCESS_FLOW: ResellerOrderProcess[] = [
  "draft",
  "pending_checking",
  "processing",
  "ready_to_ship",
  "completed",
];

export type ResellerDeskAccount = {
  id: string;
  full_name: string;
  email: string;
  role: string;
};

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
  process: ResellerOrderProcess;
  assigned_to: string;
  assigned_name: string;
  downpayment_percent: number;
  downpayment_amount: number;
  receipt_path: string;
  payment_status: ResellerPaymentStatus;
  created_at: string;
};

export function clampDownpaymentPercent(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_RESELLER_DOWNPAYMENT_PERCENT;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

export function downpaymentDue(total: number, percent: number) {
  const pct = clampDownpaymentPercent(percent);
  const amount = Number(total) || 0;
  if (amount <= 0 || pct <= 0) return 0;
  return Math.round(amount * (pct / 100) * 100) / 100;
}

export function parseResellerOrderProcess(value: unknown, status?: unknown): ResellerOrderProcess {
  if (
    value === "draft" ||
    value === "pending_checking" ||
    value === "processing" ||
    value === "ready_to_ship" ||
    value === "completed" ||
    value === "cancelled"
  ) {
    return value;
  }
  if (status === "cancelled") return "cancelled";
  if (status === "confirmed") return "processing";
  return "pending_checking";
}

export function resellerProcessLabel(process: ResellerOrderProcess) {
  return RESELLER_ORDER_PROCESSES.find((row) => row.value === process)?.label || process;
}

export function resellerProcessNeedsAccount(process: ResellerOrderProcess) {
  return process === "processing" || process === "ready_to_ship" || process === "completed";
}

export function resellerProcessBadge(process: ResellerOrderProcess): "muted" | "amber" | "blue" | "teal" | "green" | "red" {
  if (process === "completed") return "green";
  if (process === "ready_to_ship") return "teal";
  if (process === "processing") return "blue";
  if (process === "pending_checking") return "amber";
  if (process === "cancelled") return "red";
  return "muted";
}

export function resellerProcessAccent(process: ResellerOrderProcess) {
  if (process === "completed") return "border-l-emerald-500";
  if (process === "ready_to_ship") return "border-l-teal-500";
  if (process === "processing") return "border-l-blue-500";
  if (process === "pending_checking") return "border-l-amber-500";
  if (process === "cancelled") return "border-l-red-500";
  return "border-l-border";
}

export function resellerOrdersTableMissing(message: string) {
  return /reseller_orders|schema cache|does not exist/i.test(message);
}

export const RESELLER_ORDER_SELECT =
  "*, profiles!reseller_id(full_name,email), assignee:assigned_to(full_name,email)";
export const RESELLER_ORDER_SELECT_BASE = "*, profiles!reseller_id(full_name,email)";

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
  const assignee =
    row.assignee && typeof row.assignee === "object"
      ? (row.assignee as { full_name?: unknown; email?: unknown })
      : null;
  const name =
    (typeof profile?.full_name === "string" && profile.full_name.trim()) ||
    (typeof profile?.email === "string" && profile.email) ||
    "Reseller";
  const assignedName =
    (typeof assignee?.full_name === "string" && assignee.full_name.trim()) ||
    (typeof assignee?.email === "string" && assignee.email) ||
    "";
  const status = row.status;
  const payment = row.payment_status;
  const process = parseResellerOrderProcess(row.process, status);
  return {
    id: String(row.id || ""),
    reseller_id: String(row.reseller_id || ""),
    reseller_name: name,
    items: asItems(row.items),
    notes: typeof row.notes === "string" ? row.notes : "",
    status: status === "confirmed" || status === "cancelled" ? status : "pending",
    process,
    assigned_to: typeof row.assigned_to === "string" ? row.assigned_to : "",
    assigned_name: assignedName,
    downpayment_percent: clampDownpaymentPercent(row.downpayment_percent),
    downpayment_amount: Number(row.downpayment_amount) || 0,
    receipt_path: typeof row.receipt_path === "string" ? row.receipt_path : "",
    payment_status:
      payment === "approved" || payment === "rejected" || payment === "pending_review" ? payment : "pending_review",
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}
