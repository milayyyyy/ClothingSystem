import * as XLSX from "xlsx";
import { formatExcelCellString } from "@/lib/bigseller-excel-import";
import { parseBigSellerDateTimeLabel } from "@/lib/bigseller-datetime";
import { normalizeImportDedupeKey } from "@/lib/bigseller-import-dedupe";

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
  const kRefunds = col("Refunds");
  const kProduct = col("Product Name");
  const kPrice = col("Selling Price", "Selling. Price", "Selling.Price");
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
  const kDue = col("Due Time");
  const kShipTime = col("Shipping Time");
  const kBuyer = col("Buyer", "Buyer Username", "Receiver Name");

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

    rows.push({
      platform: cellStr(raw, kPlatform),
      bigsellerStore: cellStr(raw, kStore),
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
    });
  }

  return { rows, skippedRows, skipReasons, sheetRows: rawRows.length };
}

export type StoredReturnImport = {
  fileName?: string;
  importedAt?: string;
  rows: BigSellerReturnExcelRow[];
};

export function parseStoredReturnImport(raw: unknown): StoredReturnImport | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { rows?: unknown; fileName?: unknown; importedAt?: unknown };
  if (!Array.isArray(o.rows) || o.rows.length === 0) return null;
  return {
    fileName: typeof o.fileName === "string" ? o.fileName : undefined,
    importedAt: typeof o.importedAt === "string" ? o.importedAt : undefined,
    rows: o.rows as BigSellerReturnExcelRow[],
  };
}

export function afterSalesIdsFromImport(raw: unknown): string[] {
  const stored = parseStoredReturnImport(raw);
  if (!stored) return [];
  return stored.rows.map((r) => normalizeImportDedupeKey(r.afterSalesId)).filter(Boolean);
}

export function mergeReturnImport(
  existing: unknown,
  incoming: BigSellerReturnExcelRow[],
  fileName: string,
): StoredReturnImport {
  const prev = parseStoredReturnImport(existing);
  const seen = new Set(afterSalesIdsFromImport(existing));
  const rows = [...(prev?.rows ?? [])];
  for (const row of incoming) {
    const id = normalizeImportDedupeKey(row.afterSalesId);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    rows.push(row);
  }
  return {
    fileName: fileName || prev?.fileName,
    importedAt: new Date().toISOString(),
    rows,
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

