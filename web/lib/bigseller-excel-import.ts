import { parseBigSellerDateTimeLabel } from "@/lib/bigseller-datetime";

export type BigSellerExcelLine = {
  title: string;
  variation: string;
  quantity: number;
  merchantSku?: string;
};

export type BigSellerExcelGroupedOrder = {
  packageNo: string;
  externalOrderNo: string;
  orderSuffix: string;
  orderTotal: number;
  /** Order line count from export (`Number of Items in Order`), or summed SKU rows. */
  orderQuantity: number;
  storeName: string;
  receiverName?: string;
  waybillNo?: string;
  courier?: string;
  printedAtIso: string | null;
  completedAtIso: string | null;
  orderTimeIso: string | null;
  lineItems: BigSellerExcelLine[];
};

export type BigSellerExcelFormat = "bigseller_order_sku" | "shopee_order_completed" | "unknown";

export type BigSellerExcelParseResult = {
  orders: BigSellerExcelGroupedOrder[];
  skippedRows: number;
  skipReasons: string[];
  format: BigSellerExcelFormat;
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatExcelCellString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v) || Math.abs(v) >= 1e11) return String(Math.trunc(v));
  }
  let s = String(v).trim();
  if (s.startsWith("'")) s = s.slice(1).trim();
  if (/^\d+(?:\.\d+)?[eE][+-]?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = String(Math.trunc(n));
  }
  return s;
}

function cellStr(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    const s = formatExcelCellString(v);
    if (s && s !== "--") return s;
  }
  return "";
}

function cellNum(row: Record<string, unknown>, ...keys: string[]): number {
  const s = cellStr(row, ...keys);
  if (!s) return 0;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function orderSuffixFromExternalNo(externalOrderNo: string): string {
  const t = externalOrderNo.trim();
  if (t.length >= 4) return t.slice(-4);
  return t || "????";
}

function normalizeShirtType(raw: string): "White shirt" | "Black shirt" | undefined {
  const x = raw.toLowerCase();
  if (x.includes("white shirt") || x.includes("white")) return "White shirt";
  if (x.includes("black shirt") || x.includes("black")) return "Black shirt";
  return undefined;
}

function normalizeShirtSize(raw: string): "small" | "medium" | "large" | "xlarge" | "2xlarge" | "3xlarge" | undefined {
  const x = raw.toLowerCase().replace(/\s+/g, "");
  if (x.includes("small") && !x.includes("x-small")) return "small";
  if (x.includes("medium")) return "medium";
  if (x.includes("3x-large") || x.includes("3xlarge") || x.includes("xxxl")) return "3xlarge";
  if (x.includes("2x-large") || x.includes("2xlarge") || x.includes("xxl")) return "2xlarge";
  if (x.includes("x-large") || x.includes("xlarge") || x.includes("xl")) return "xlarge";
  if (x.includes("large")) return "large";
  return undefined;
}

function detectExcelFormat(headerKeys: string[]): BigSellerExcelFormat {
  const h = new Set(headerKeys.map(normHeader));
  if (h.has("package no")) return "bigseller_order_sku";
  if (h.has("order id") && (h.has("grand total") || h.has("order complete time"))) return "shopee_order_completed";
  if (h.has("order no") && h.has("order total")) return "bigseller_order_sku";
  return "unknown";
}

/** Map raw `sheet_to_json` rows (string keys from Excel headers) into grouped historical orders. */
export function parseBigSellerExcelRows(rawRows: Record<string, unknown>[]): BigSellerExcelParseResult {
  if (rawRows.length === 0) {
    return { orders: [], skippedRows: 0, skipReasons: ["No data rows in sheet."], format: "unknown" };
  }

  const headerMap = new Map<string, string>();
  for (const key of Object.keys(rawRows[0] || {})) {
    headerMap.set(normHeader(key), key);
  }

  const format = detectExcelFormat([...headerMap.keys()]);

  function col(...candidates: string[]): string {
    for (const c of candidates) {
      const k = headerMap.get(normHeader(c));
      if (k) return k;
    }
    return "";
  }

  const kOrderNo = col(
    "Order No",
    "Order No.",
    "Order ID",
    "Order Id",
    "Ordersn",
    "Order SN",
    "Order Sn",
    "Platform Order No",
    "Platform Order ID",
  );
  const kPackageNo = col("Package No", "Package No.");
  const kOrderStatus = col("Order Status", "Marketplace Status");
  const kStore = col("BigSeller Store Nickname", "Marketplace Store", "Marketplace");
  const kReceiver = col("Receiver Name", "Customer Name");
  const kTracking = col("Tracking Number", "Tracking Number*", "Tracking No");
  const kCourier = col("Shipping Option", "Buyer Designed Logistics", "Shipment Method");
  const kOrderTotal = col("Order Total", "Grand Total");
  const kBuyerProductPrice = col("Products' Price Paid by Buyer (PHP)");
  const kProduct = col("Product Name", "Title");
  const kVariation = col("Variation Name");
  const kQty = col("Quantity");
  const kItemsInOrder = col("Number of Items in Order");
  const kMerchantSku = col("Merchant SKU", "SKU", "SKU Reference No.", "Parent SKU Reference No.");
  const kPrinted = col("Printed Time", "Ship Time");
  const kCompleted = col("Completed Time", "Order Complete Time");
  const kOrderTime = col("Order Time", "Order Paid Time", "Order Creation Date", "Order Paid Time");

  const groups = new Map<string, BigSellerExcelGroupedOrder>();
  let skippedRows = 0;
  const skipReasons: string[] = [];

  for (const raw of rawRows) {
    const externalOrderNo = cellStr(raw, kOrderNo);
    const packageNo = cellStr(raw, kPackageNo) || externalOrderNo;
    const status = cellStr(raw, kOrderStatus).toLowerCase();
    const productTitle = cellStr(raw, kProduct);

    if (!externalOrderNo) {
      skippedRows += 1;
      if (!skipReasons.includes("Missing order number")) skipReasons.push("Missing order number");
      continue;
    }
    if (status && status !== "completed") {
      skippedRows += 1;
      if (!skipReasons.includes("Not completed status")) skipReasons.push("Not completed status");
      continue;
    }

    const existing = groups.get(packageNo);

    // Same order id, row 2+: only product name (and optional variation) — no duplicate order totals.
    if (existing) {
      if (!productTitle) {
        skippedRows += 1;
        if (!skipReasons.includes("Missing product name on extra row")) {
          skipReasons.push("Missing product name on extra row");
        }
        continue;
      }
      existing.lineItems.push({
        title: productTitle,
        variation: cellStr(raw, kVariation),
        quantity: Math.max(1, Math.round(cellNum(raw, kQty) || 1)),
        merchantSku: cellStr(raw, kMerchantSku) || undefined,
      });
      continue;
    }

    // First row for this order: full marketplace fields + buyer product total.
    let rowAmount = cellNum(raw, kBuyerProductPrice);
    if (rowAmount <= 0) {
      rowAmount = cellNum(raw, kOrderTotal) || cellNum(raw, col("Product Subtotal"));
    }
    if (rowAmount <= 0) {
      skippedRows += 1;
      if (!skipReasons.includes("Invalid order total")) skipReasons.push("Invalid order total");
      continue;
    }

    const lineQty = Math.max(1, Math.round(cellNum(raw, kQty) || 1));
    const itemsInOrder = Math.round(cellNum(raw, kItemsInOrder));
    const rowOrderQty = itemsInOrder > 0 ? itemsInOrder : lineQty;

    const line: BigSellerExcelLine = {
      title: productTitle || "BigSeller item",
      variation: cellStr(raw, kVariation),
      quantity: lineQty,
      merchantSku: cellStr(raw, kMerchantSku) || undefined,
    };

    groups.set(packageNo, {
      packageNo,
      externalOrderNo,
      orderSuffix: orderSuffixFromExternalNo(externalOrderNo),
      orderTotal: rowAmount,
      orderQuantity: rowOrderQty,
      storeName: cellStr(raw, kStore),
      receiverName: cellStr(raw, kReceiver) || undefined,
      waybillNo: cellStr(raw, kTracking) || undefined,
      courier: cellStr(raw, kCourier) || undefined,
      printedAtIso: parseBigSellerDateTimeLabel(raw[kPrinted]),
      completedAtIso: parseBigSellerDateTimeLabel(raw[kCompleted]),
      orderTimeIso: parseBigSellerDateTimeLabel(raw[kOrderTime]),
      lineItems: [line],
    });
  }

  const parsed = [...groups.values()];
  if (parsed.length === 0 && format === "unknown") {
    skipReasons.push(
      "Unrecognized columns — use BigSeller Order-SKU export or Shopee Order.completed export.",
    );
  }

  return {
    orders: parsed,
    skippedRows,
    skipReasons,
    format,
  };
}

export function buildHistoricalBigSellerOrderPayload(
  order: BigSellerExcelGroupedOrder,
  opts: { fileName: string; storeId: string | null; storeLabel: string | null },
) {
  const firstVar = order.lineItems[0]?.variation || "";
  const shirtType = normalizeShirtType(firstVar);
  const shirtSize = normalizeShirtSize(firstVar);
  const primary = order.lineItems[0];
  const designRef = primary?.title || `BigSeller #${order.orderSuffix}`;
  const extraLineTitles = order.lineItems.slice(1).map((l) => l.title.trim()).filter(Boolean);

  const variations = [...new Set(order.lineItems.map((l) => l.variation).filter(Boolean))];
  const variationField = variations.length ? variations.join("; ").slice(0, 500) : null;

  const quantity = Math.max(1, Math.round(order.orderQuantity) || 1);
  const unitPrice = Math.round(order.orderTotal * 100) / 100;
  const orderTotal = unitPrice;
  let notes = `Imported from BigSeller marketplace Excel (historical, completed + withdrawn) (${opts.fileName || "file"}).`;
  if (order.storeName && !opts.storeId) {
    notes += ` Store "${order.storeName}" — set PDF label under Admin → Stores to link.`;
  }
  if (extraLineTitles.length > 0) {
    notes += ` ${1 + extraLineTitles.length} product line(s) in export.`;
  }

  const ts = order.completedAtIso || order.orderTimeIso || order.printedAtIso;

  return {
    customer_name: order.receiverName || `BigSeller #${order.orderSuffix}`,
    customer_social: `BS-${order.orderSuffix}`,
    external_order_no: order.externalOrderNo,
    waybill_no: order.waybillNo || null,
    courier: order.courier || null,
    sku_code: order.packageNo,
    variation: variationField,
    ...(shirtType ? { shirt_type: shirtType } : {}),
    ...(shirtSize ? { shirt_size: shirtSize } : {}),
    ...(opts.storeId ? { store_id: opts.storeId } : {}),
    kind: "online" as const,
    order_type: "online" as const,
    source: "BigSeller",
    stage: "completed" as const,
    status: "delivered" as const,
    quantity,
    unit_price: unitPrice,
    total: orderTotal,
    down_payment: orderTotal,
    design_ref: designRef,
    bigseller_line_items: extraLineTitles,
    notes,
    bigseller_printed_at: order.printedAtIso,
    ...(ts ? { created_at: ts, updated_at: ts } : {}),
  };
}
