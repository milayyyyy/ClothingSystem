import * as XLSX from "xlsx";
import { formatExcelCellString } from "@/lib/bigseller-excel-import";
import { parseBigSellerDateTimeLabel } from "@/lib/bigseller-datetime";
import { normalizeImportDedupeKey } from "@/lib/bigseller-import-dedupe";
import { normalizeBigSellerStoreName } from "@/lib/bigseller-store-labels";

export type BigSellerReturnExcelRow = {
  platform: string;
  bigsellerStore: string;
  afterSalesType: string;
  packageNo: string;
  orderNo: string;
  afterSalesId: string;
  refunds: number;
  productName: string;
  sellingPrice: number;
  qty: number;
  stockInStatus: string;
  logistics: string;
  orderStatus: string;
  trackingNo: string;
  shippingLogisticsStatus: string;
  afterSalesStatus: string;
  returnReason: string;
  returnTrackingNo: string;
  returnStatus: string;
  orderTime: string;
  afterSalesRequestingTime: string;
  dueTime: string;
  shippingTime: string;
  buyer: string;
  variation?: string;
  warehouseArrival?: string;
  returnLogisticsStatus?: string;
  paymentMethod?: string;
  orderValue?: number;
};

export type BigSellerReturnExcelParseResult = {
  rows: BigSellerReturnExcelRow[];
  skippedRows: number;
  skipReasons: string[];
  sheetRows: number;
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function cellStr(row: Record<string, unknown>, key: string): string {
  if (!key) return "";
  const s = formatExcelCellString(row[key]);
  return s && s !== "--" ? s : "";
}

function cellNum(row: Record<string, unknown>, key: string): number {
  const s = cellStr(row, key);
  if (!s) return 0;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function isBigSellerReturnSheet(headerKeys: string[]): boolean {
  const h = new Set(headerKeys.map(normHeader));
  return h.has("after-sales id") && h.has("return status") && (h.has("package no") || h.has("order no"));
}

export function pickBigSellerReturnSheetName(wb: XLSX.WorkBook): string | null {
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (rows.length === 0) continue;
    const keys = Object.keys(rows[0] || {});
    if (isBigSellerReturnSheet(keys)) return name;
  }
  return wb.SheetNames[0] ?? null;
}

export function mapExcelReturnStatus(
  returnStatus: string,
  _stockInStatus?: string,
): "returning" | "returned" {
  const st = returnStatus.toLowerCase();
  if (st.includes("returned")) return "returned";
  return "returning";
}

export function parseBigSellerReturnExcelRows(
  rawRows: Record<string, unknown>[],
): BigSellerReturnExcelParseResult {
  if (rawRows.length === 0) {
    return { rows: [], skippedRows: 0, skipReasons: ["No data rows in sheet."], sheetRows: 0 };
  }

  const headerMap = new Map<string, string>();
  for (const key of Object.keys(rawRows[0] || {})) {
    headerMap.set(normHeader(key), key);
  }

  function col(...candidates: string[]): string {
    for (const c of candidates) {
      const k = headerMap.get(normHeader(c));
      if (k) return k;
    }
    return "";
  }

  if (!isBigSellerReturnSheet([...headerMap.keys()])) {
    return {
      rows: [],
      skippedRows: rawRows.length,
      skipReasons: ["Not a BigSeller Order-Return export (need After-sales ID, Return Status, and Package/Order No)."],
      sheetRows: rawRows.length,
    };
  }

  const kPlatform = col("Platform");
  const kStore = col("BigSeller Store", "BigSeller Store Nickname", "Marketplace Store");
  const kType = col("After Sales Type", "After-sales Type");
  const kPackage = col("Package No", "Package No.");
  const kOrderNo = col("Order No", "Order No.", "Order ID", "Order Id");
  const kAfterSalesId = col("After-sales ID", "After Sales ID", "After-sales Id");
  const kRefunds = col("Refunds", "Refund Value", "Refund Amount");
  const kOrderValue = col("Order Value", "Order Amount", "Order. Value");
  const kProduct = col("Product Name", "Item Name");
  const kPrice = col("Selling Price", "Selling. Price", "Selling.Price", "Unit Price");
  const kQty = col("Qty", "Quantity");
  const kStockIn = col("Stock-in Status", "Stock-In Status", "Stock in Status");
  const kLogistics = col("Logistics");
  const kOrderStatus = col("Order Status");
  const kTracking = col("Tracking No", "Tracking Number", "Tracking No.");
  const kShipLog = col("Shipping logistics status", "Shipping Logistics Status");
  const kAfterStatus = col("After Sales Status", "After-sales Status");
  const kReason = col("Return Reason");
  const kReasonDetails = col("Return Reason Details");
  const kReturnTracking = col("Return Tracking No", "Return Tracking Number");
  const kReturnStatus = col("Return Status");
  const kOrderTime = col("Order Time");
  const kRequestTime = col("After Sales Requesting Time", "After-sales Requesting Time");
  const kDue = col("Due Time", "Deadline");
  const kShipTime = col("Shipping Time");
  const kBuyer = col("Buyer", "Buyer Username", "Receiver Name");
  const kVariation = col("Variation", "Variation Name", "SKU Name", "Specification");
  const kWarehouse = col("Warehouse Arrival", "Warehouse Arrival Time");
  const kReturnLog = col("Return Logistics Status", "Return logistics status");
  const kPay = col("Payment Method", "Pay Method", "Payment Type", "Pay Type", "COD");

  const rows: BigSellerReturnExcelRow[] = [];
  let skippedRows = 0;
  const skipReasons: string[] = [];

  for (const raw of rawRows) {
    const afterSalesId = cellStr(raw, kAfterSalesId);
    const packageNo = cellStr(raw, kPackage);
    const orderNo = cellStr(raw, kOrderNo);
    if (!afterSalesId && !packageNo && !orderNo) {
      skippedRows += 1;
      continue;
    }
    if (!afterSalesId && !orderNo) {
      skippedRows += 1;
      skipReasons.push("Row missing After-sales ID and Order No.");
      continue;
    }

    const reason = cellStr(raw, kReason);
    const details = cellStr(raw, kReasonDetails);
    const returnReason = reason && details && details.toLowerCase() !== reason.toLowerCase()
      ? `${reason} — ${details}`
      : reason || details;

    const payRaw = cellStr(raw, kPay);
    const payLower = payRaw.toLowerCase();
    const paymentMethod =
      payLower === "true" || payLower === "1" || payLower === "yes" || payLower === "cod"
        ? "COD"
        : payLower.includes("prepaid")
          ? "Prepaid"
          : payLower.includes("cod")
            ? "COD"
            : payRaw;

    rows.push({
      platform: cellStr(raw, kPlatform),
      bigsellerStore: normalizeBigSellerStoreName(cellStr(raw, kStore)),
      afterSalesType: cellStr(raw, kType),
      packageNo,
      orderNo,
      afterSalesId,
      refunds: cellNum(raw, kRefunds),
      productName: cellStr(raw, kProduct),
      sellingPrice: cellNum(raw, kPrice),
      qty: cellNum(raw, kQty) || 1,
      stockInStatus: cellStr(raw, kStockIn),
      logistics: cellStr(raw, kLogistics),
      orderStatus: cellStr(raw, kOrderStatus),
      trackingNo: cellStr(raw, kTracking),
      shippingLogisticsStatus: cellStr(raw, kShipLog),
      afterSalesStatus: cellStr(raw, kAfterStatus),
      returnReason,
      returnTrackingNo: cellStr(raw, kReturnTracking),
      returnStatus: cellStr(raw, kReturnStatus),
      orderTime: cellStr(raw, kOrderTime),
      afterSalesRequestingTime: cellStr(raw, kRequestTime),
      dueTime: cellStr(raw, kDue),
      shippingTime: cellStr(raw, kShipTime),
      buyer: cellStr(raw, kBuyer),
      variation: cellStr(raw, kVariation),
      warehouseArrival: cellStr(raw, kWarehouse),
      returnLogisticsStatus: cellStr(raw, kReturnLog),
      paymentMethod,
      orderValue: cellNum(raw, kOrderValue),
    });
  }

  return { rows, skippedRows, skipReasons, sheetRows: rawRows.length };
}

export type ReturnStatusChange = {
  from: string;
  to: string;
  trackingNo: string;
  changedAt: string;
  checked: boolean;
};

export type StoredReturnImport = {
  fileName?: string;
  importedAt?: string;
  rows: BigSellerReturnExcelRow[];
  statusChange?: ReturnStatusChange | null;
};

function asStatusChange(raw: unknown): ReturnStatusChange | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.to !== "string" || typeof o.from !== "string") return null;
  return {
    from: o.from,
    to: o.to,
    trackingNo: typeof o.trackingNo === "string" ? o.trackingNo : "",
    changedAt: typeof o.changedAt === "string" ? o.changedAt : "",
    checked: o.checked === true,
  };
}

function normReturnStatusLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function returnRowTrackingKeys(
  row: Pick<BigSellerReturnExcelRow, "trackingNo" | "returnTrackingNo">,
): string[] {
  return [row.returnTrackingNo, row.trackingNo].map(normalizeImportDedupeKey).filter(Boolean);
}

export function storedReturnTrackingKeys(raw: unknown): string[] {
  const stored = parseStoredReturnImport(raw);
  if (!stored) return [];
  const keys: string[] = [];
  for (const r of stored.rows) keys.push(...returnRowTrackingKeys(r));
  return keys;
}

function sameReturnRow(a: BigSellerReturnExcelRow, b: BigSellerReturnExcelRow): boolean {
  const aid = normalizeImportDedupeKey(a.afterSalesId);
  const bid = normalizeImportDedupeKey(b.afterSalesId);
  if (aid && bid && aid === bid) return true;
  const aKeys = returnRowTrackingKeys(a);
  const bKeys = returnRowTrackingKeys(b);
  if (!aKeys.length || !bKeys.length) return false;
  return aKeys.some((k) => bKeys.includes(k));
}

export function parseStoredReturnImport(raw: unknown): StoredReturnImport | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { rows?: unknown; fileName?: unknown; importedAt?: unknown; statusChange?: unknown };
  if (!Array.isArray(o.rows) || o.rows.length === 0) return null;
  return {
    fileName: typeof o.fileName === "string" ? o.fileName : undefined,
    importedAt: typeof o.importedAt === "string" ? o.importedAt : undefined,
    rows: o.rows as BigSellerReturnExcelRow[],
    statusChange: asStatusChange(o.statusChange),
  };
}

export function pendingReturnStatusChange(raw: unknown): ReturnStatusChange | null {
  const sc = parseStoredReturnImport(raw)?.statusChange;
  if (!sc || sc.checked) return null;
  return sc;
}

export type ReturnListTab = "returning" | "to_check" | "returned";

export function orderRecordReturnTab(
  returnStatus: string | null | undefined,
  returnImport: unknown,
): ReturnListTab {
  if (pendingReturnStatusChange(returnImport)) return "to_check";
  const excel = (returnImportPrimary(returnImport)?.returnStatus || "").toLowerCase();
  if (excel.includes("returned") || returnStatus === "returned") return "returned";
  return "returning";
}

export function markReturnStatusChecked(existing: unknown): StoredReturnImport | null {
  const prev = parseStoredReturnImport(existing);
  if (!prev) return null;
  if (!prev.statusChange) return prev;
  return { ...prev, statusChange: { ...prev.statusChange, checked: true } };
}

function blankReturnExcelRow(partial: Partial<BigSellerReturnExcelRow> = {}): BigSellerReturnExcelRow {
  return {
    platform: "",
    bigsellerStore: "",
    afterSalesType: "",
    packageNo: "",
    orderNo: "",
    afterSalesId: "",
    refunds: 0,
    productName: "",
    sellingPrice: 0,
    qty: 0,
    stockInStatus: "",
    logistics: "",
    orderStatus: "",
    trackingNo: "",
    shippingLogisticsStatus: "",
    afterSalesStatus: "",
    returnReason: "",
    returnTrackingNo: "",
    returnStatus: "",
    orderTime: "",
    afterSalesRequestingTime: "",
    dueTime: "",
    shippingTime: "",
    buyer: "",
    ...partial,
  };
}

/** Manually flag a return as To be checked (pending status change). */
export function forwardReturnToCheck(existing: unknown, trackingNo = ""): StoredReturnImport {
  const prev = parseStoredReturnImport(existing);
  const row = prev?.rows[0];
  const from = (row?.returnStatus || prev?.statusChange?.from || "Returning").trim() || "Returning";
  const tracking =
    trackingNo.trim() ||
    (prev?.statusChange?.trackingNo || "").trim() ||
    (row?.returnTrackingNo || "").trim() ||
    (row?.trackingNo || "").trim();
  const rows =
    prev?.rows?.length
      ? prev.rows
      : [blankReturnExcelRow({ trackingNo: tracking, returnStatus: from })];
  return {
    fileName: prev?.fileName,
    importedAt: prev?.importedAt,
    rows,
    statusChange: {
      from,
      to: "Returned",
      trackingNo: tracking,
      changedAt: new Date().toISOString(),
      checked: false,
    },
  };
}

/** Manually move a return to Returned to seller. */
export function forwardReturnToSeller(existing: unknown): StoredReturnImport | null {
  const prev = parseStoredReturnImport(existing);
  if (!prev) return null;
  return {
    ...prev,
    rows: prev.rows.map((r) => ({
      ...r,
      returnStatus: /returned/i.test(r.returnStatus || "") ? r.returnStatus : "Returned",
    })),
    statusChange: prev.statusChange
      ? {
          ...prev.statusChange,
          to: /returned/i.test(prev.statusChange.to) ? prev.statusChange.to : "Returned",
          checked: true,
        }
      : prev.statusChange,
  };
}

export function afterSalesIdsFromImport(raw: unknown): string[] {
  const stored = parseStoredReturnImport(raw);
  if (!stored) return [];
  return stored.rows.map((r) => normalizeImportDedupeKey(r.afterSalesId)).filter(Boolean);
}

export function matchReturnImportToOrder<
  T extends {
    sku_code?: string | null;
    external_order_no?: string | null;
    waybill_no?: string | null;
    return_import?: unknown;
  },
>(row: BigSellerReturnExcelRow, orders: T[]): T | null {
  const trackKeys = new Set(returnRowTrackingKeys(row));
  if (trackKeys.size) {
    const hit = orders.find((o) => {
      const way = normalizeImportDedupeKey(o.waybill_no);
      if (way && trackKeys.has(way)) return true;
      return storedReturnTrackingKeys(o.return_import).some((k) => trackKeys.has(k));
    });
    if (hit) return hit;
  }
  const pkg = normalizeImportDedupeKey(row.packageNo);
  if (pkg) {
    const hit = orders.find((o) => normalizeImportDedupeKey(o.sku_code) === pkg);
    if (hit) return hit;
  }
  const ext = normalizeImportDedupeKey(row.orderNo);
  if (ext) {
    const hit = orders.find((o) => normalizeImportDedupeKey(o.external_order_no) === ext);
    if (hit) return hit;
  }
  const aid = normalizeImportDedupeKey(row.afterSalesId);
  if (aid) {
    const hit = orders.find((o) => afterSalesIdsFromImport(o.return_import).includes(aid));
    if (hit) return hit;
  }
  return null;
}

export function mergeReturnImport(
  existing: unknown,
  incoming: BigSellerReturnExcelRow[],
  fileName: string,
): StoredReturnImport {
  const prev = parseStoredReturnImport(existing);
  const rows = [...(prev?.rows ?? [])];
  let statusChange = prev?.statusChange ?? null;
  for (const row of incoming) {
    const idx = rows.findIndex((r) => sameReturnRow(r, row));
    if (idx >= 0) {
      const oldStatus = rows[idx].returnStatus || "";
      const newStatus = row.returnStatus || "";
      if (oldStatus && newStatus && normReturnStatusLabel(oldStatus) !== normReturnStatusLabel(newStatus)) {
        statusChange = {
          from: oldStatus,
          to: newStatus,
          trackingNo: row.returnTrackingNo || row.trackingNo || returnRowTrackingKeys(rows[idx])[0] || "",
          changedAt: new Date().toISOString(),
          checked: false,
        };
      }
      rows[idx] = { ...rows[idx], ...row };
    } else {
      rows.push(row);
    }
  }
  return {
    fileName: fileName || prev?.fileName,
    importedAt: new Date().toISOString(),
    rows,
    statusChange,
  };
}

export function returnImportPrimary(raw: unknown): BigSellerReturnExcelRow | null {
  const stored = parseStoredReturnImport(raw);
  return stored?.rows[0] ?? null;
}

export function orderTimeIsoFromReturn(row: BigSellerReturnExcelRow): string | null {
  return (
    parseBigSellerDateTimeLabel(row.afterSalesRequestingTime) ||
    parseBigSellerDateTimeLabel(row.orderTime) ||
    parseBigSellerDateTimeLabel(row.shippingTime)
  );
}

export const RETURN_ORDER_SELECT =
  "id,order_no,customer_name,kind,order_type,source,stage,status,total,down_payment,return_status,return_reason,return_inventory_type,return_inventory_ref,return_import,waybill_no,external_order_no,sku_code,updated_at,created_at";
export const RETURN_ORDER_SELECT_BASE =
  "id,order_no,customer_name,kind,order_type,source,stage,status,total,down_payment,return_status,return_reason,return_inventory_type,return_inventory_ref,waybill_no,external_order_no,sku_code,updated_at,created_at";

