import * as XLSX from "xlsx";
import { formatExcelCellString } from "@/lib/bigseller-excel-import";
import { normalizeImportDedupeKey } from "@/lib/bigseller-import-dedupe";

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function headerMapFromRow(row: Record<string, unknown>): Map<string, string> {
  const headerMap = new Map<string, string>();
  for (const key of Object.keys(row)) {
    headerMap.set(normHeader(key), key);
  }
  return headerMap;
}

function col(headerMap: Map<string, string>, ...candidates: string[]): string {
  for (const c of candidates) {
    const k = headerMap.get(normHeader(c));
    if (k) return k;
  }
  return "";
}

function cellNum(row: Record<string, unknown>, key: string): number {
  if (!key) return 0;
  const s = formatExcelCellString(row[key]);
  if (!s) return 0;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function isSettlementOrderId(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 12;
}

/**
 * TikTok settlement exports often declare a tiny `!ref` (e.g. A1:V2) while thousands of
 * data rows exist in the sheet object — `sheet_to_json` would otherwise read only one row.
 */
function expandSheetRange(sheet: XLSX.WorkSheet): XLSX.WorkSheet {
  let maxRow = 0;
  let maxCol = 0;
  for (const addr of Object.keys(sheet)) {
    if (addr.startsWith("!")) continue;
    try {
      const { r, c } = XLSX.utils.decode_cell(addr);
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    } catch {
      continue;
    }
  }
  if (maxRow === 0 && maxCol === 0) return sheet;
  const expanded = { ...sheet };
  expanded["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxRow, c: maxCol },
  });
  return expanded;
}

function sheetToSettlementRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(expandSheetRange(sheet), {
    defval: "",
  });
}

/** Parse TikTok Shop Finance → Settlement export; returns settlement amount per order ID. */
export function parseTikTokSettlementRows(rawRows: Record<string, unknown>[]): Map<string, number> {
  const byOrder = new Map<string, number>();
  if (rawRows.length === 0) return byOrder;

  const headerMap = headerMapFromRow(rawRows[0] || {});

  const kOrderId = col(
    headerMap,
    "Order ID",
    "Order/Adjustment ID",
    "Order/adjustment ID",
    "Order Adjustment ID",
    "Related Order ID",
  );
  const kAmount = col(
    headerMap,
    "Total settlement amount",
    "Total Settlement Amount",
    "Settlement amount",
    "Settlement Amount",
    "Total Settlement",
    "Net settlement amount",
    "Settlement Total",
  );
  if (!kOrderId || !kAmount) return byOrder;

  for (const raw of rawRows) {
    const orderId = formatExcelCellString(raw[kOrderId]);
    if (!isSettlementOrderId(orderId)) continue;

    const amount = cellNum(raw, kAmount);
    if (amount <= 0) continue;

    const key = normalizeImportDedupeKey(orderId);
    if (!key) continue;
    // One settlement per order; keep the largest if duplicate rows.
    const prev = byOrder.get(key) ?? 0;
    if (amount > prev) byOrder.set(key, Math.round(amount * 100) / 100);
  }

  return byOrder;
}

function pickSettlementSheetNames(wb: XLSX.WorkBook): string[] {
  const orderDetails = wb.SheetNames.filter((n) => normHeader(n) === "order details");
  if (orderDetails.length > 0) return orderDetails;

  const withHeaders: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows = sheetToSettlementRows(sheet);
    if (rows.length === 0) continue;
    const headerMap = headerMapFromRow(rows[0] || {});
    const hasOrderId = col(headerMap, "Order/Adjustment ID", "Order ID", "Order Adjustment ID");
    const hasAmount = col(headerMap, "Total settlement amount", "Total Settlement Amount");
    if (hasOrderId && hasAmount) withHeaders.push(name);
  }
  return withHeaders;
}

/** Read TikTok Finance settlement workbook (Order details: Order/Adjustment ID + Total settlement amount). */
export function parseTikTokSettlementWorkbook(wb: XLSX.WorkBook): Map<string, number> {
  const merged = new Map<string, number>();
  const sheetNames = pickSettlementSheetNames(wb);
  for (const sheetName of sheetNames) {
    const rows = sheetToSettlementRows(wb.Sheets[sheetName]);
    const part = parseTikTokSettlementRows(rows);
    for (const [k, v] of part) {
      const prev = merged.get(k) ?? 0;
      if (v > prev) merged.set(k, v);
    }
  }
  return merged;
}
