import {
  parseBigSellerExcelRows,
  parsePlatformSkuVariation,
  type BigSellerExcelGroupedOrder,
} from "@/lib/bigseller-excel-import";
import { parseBigSellerRowsFromText, type ParsedBigSellerPickRow } from "@/lib/bigseller-pdf-pick-list";
import { newSheetId, type ManualUsageSheet } from "@/lib/order-records";

export const SHIRT_SIZE_ORDER = [
  "small",
  "medium",
  "large",
  "xlarge",
  "2xlarge",
  "3xlarge",
] as const;

export type ShirtSize = (typeof SHIRT_SIZE_ORDER)[number];

export const SHIRT_SIZE_LABELS: Record<ShirtSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  xlarge: "X-Large",
  "2xlarge": "2X-Large",
  "3xlarge": "3X-Large",
};

export type BigSellerImportLine = {
  orderId: string;
  itemName: string;
  variation: string;
  quantity: number;
  shirtType?: "White shirt" | "Black shirt";
  shirtSize?: ShirtSize;
};

export const BIGSELLER_ORDER_LINES_SHEET = "BigSeller — Order lines";

const BIGSELLER_MANAGED_SHEETS = new Set([
  BIGSELLER_ORDER_LINES_SHEET,
  "Import summary",
  "Black shirt — totals",
  "White shirt — totals",
]);

export type BigSellerImportResult = {
  lines: BigSellerImportLine[];
  sheets: ManualUsageSheet[];
  orderCount: number;
  linesWithSize: number;
  blackTotal: number;
  whiteTotal: number;
  skippedRows?: number;
  format?: string;
  /** Lines in file that were already on this record. */
  duplicateCount?: number;
  /** Total lines parsed from file before dedupe. */
  totalInFile?: number;
};

/** Stable key: same order + item + variation = duplicate. */
export function lineDedupeKey(line: Pick<BigSellerImportLine, "orderId" | "itemName" | "variation">): string {
  const oid = line.orderId.trim().toLowerCase();
  const item = line.itemName.trim().toLowerCase().replace(/\s+/g, " ");
  const vari = line.variation.trim().toLowerCase().replace(/\s+/g, " ");
  return `${oid}|${item}|${vari}`;
}

function sizeFromLabel(label: string): ShirtSize | undefined {
  const t = label.trim().toLowerCase();
  for (const [key, display] of Object.entries(SHIRT_SIZE_LABELS)) {
    if (display.toLowerCase() === t || key === t) return key as ShirtSize;
  }
  return undefined;
}

function cellByLabel(sheet: ManualUsageSheet, row: ManualUsageSheet["rows"][0], label: string): string {
  const col = sheet.columns.find((c) => c.label.trim().toLowerCase() === label.toLowerCase());
  if (!col) return "";
  return (row.cells[col.id] ?? "").trim();
}

/** Read lines already saved on this order record from the BigSeller order lines sheet. */
export function extractBigSellerLinesFromSheets(sheets: ManualUsageSheet[]): BigSellerImportLine[] {
  const sheet = sheets.find((s) => s.name === BIGSELLER_ORDER_LINES_SHEET);
  if (!sheet) return [];

  const out: BigSellerImportLine[] = [];
  for (const row of sheet.rows) {
    const orderId = cellByLabel(sheet, row, "Order ID");
    const itemName = cellByLabel(sheet, row, "Item name");
    if (!orderId && !itemName) continue;
    const variation = cellByLabel(sheet, row, "Variation");
    const qty = Math.max(1, Math.round(Number(cellByLabel(sheet, row, "Quantity")) || 1));
    const shirtRaw = cellByLabel(sheet, row, "Shirt");
    const sizeRaw = cellByLabel(sheet, row, "Size");
    let shirtType = shirtRaw && shirtRaw !== "—" ? (shirtRaw as BigSellerImportLine["shirtType"]) : undefined;
    let shirtSize = sizeRaw && sizeRaw !== "—" ? sizeFromLabel(sizeRaw) : undefined;
    if (!shirtType || !shirtSize) {
      const parsed = parsePlatformSkuVariation(variation);
      shirtType = shirtType ?? parsed.shirtType;
      shirtSize = shirtSize ?? parsed.shirtSize;
    }
    out.push({
      orderId: orderId || "—",
      itemName: itemName || "—",
      variation,
      quantity: qty,
      shirtType,
      shirtSize,
    });
  }
  return out;
}

/** Keep only lines not already on the record; dedupe within the file too. */
export function filterNewBigSellerLines(
  incoming: BigSellerImportLine[],
  existingSheets: ManualUsageSheet[],
): { newLines: BigSellerImportLine[]; duplicateCount: number } {
  const existingKeys = new Set(extractBigSellerLinesFromSheets(existingSheets).map(lineDedupeKey));
  const seenIncoming = new Set<string>();
  const newLines: BigSellerImportLine[] = [];
  let duplicateCount = 0;

  for (const line of incoming) {
    const key = lineDedupeKey(line);
    if (seenIncoming.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seenIncoming.add(key);
    if (existingKeys.has(key)) {
      duplicateCount += 1;
      continue;
    }
    newLines.push(line);
  }

  return { newLines, duplicateCount };
}

/** Merge new lines into sheets; refresh BigSeller totals from all order lines. */
export function mergeBigSellerImportIntoSheets(
  existingSheets: ManualUsageSheet[],
  newLines: BigSellerImportLine[],
): ManualUsageSheet[] {
  if (newLines.length === 0) return existingSheets;

  const allLines = [...extractBigSellerLinesFromSheets(existingSheets), ...newLines];
  const kept = existingSheets.filter((s) => !BIGSELLER_MANAGED_SHEETS.has(s.name));
  const refreshed = buildUsageSheetsFromBigSellerLines(allLines);
  return [...kept, ...refreshed];
}

function emptySizeCounts(): Record<ShirtSize, number> {
  return { small: 0, medium: 0, large: 0, xlarge: 0, "2xlarge": 0, "3xlarge": 0 };
}

export function linesFromExcelOrders(orders: BigSellerExcelGroupedOrder[]): BigSellerImportLine[] {
  const out: BigSellerImportLine[] = [];
  for (const order of orders) {
    const orderId = order.externalOrderNo || order.packageNo || order.orderSuffix;
    for (const line of order.lineItems) {
      const parsed = parsePlatformSkuVariation(line.variation);
      out.push({
        orderId,
        itemName: line.title,
        variation: line.variation,
        quantity: Math.max(1, line.quantity),
        shirtType: parsed.shirtType,
        shirtSize: parsed.shirtSize,
      });
    }
  }
  return out;
}

export function linesFromPdfRows(rows: ParsedBigSellerPickRow[]): BigSellerImportLine[] {
  return rows.map((row) => {
    const parsed = row.variation
      ? parsePlatformSkuVariation(row.variation)
      : { shirtType: row.shirtType, shirtSize: row.shirtSize };
    return {
      orderId: row.externalOrderNo || row.orderSuffix,
      itemName: row.title,
      variation: row.variation || "",
      quantity: Math.max(1, row.quantity),
      shirtType: parsed.shirtType ?? row.shirtType,
      shirtSize: parsed.shirtSize ?? row.shirtSize,
    };
  });
}

export function aggregateShirtSizes(lines: BigSellerImportLine[]) {
  const black = emptySizeCounts();
  const white = emptySizeCounts();
  let linesWithSize = 0;

  for (const line of lines) {
    if (!line.shirtType || !line.shirtSize) continue;
    linesWithSize += 1;
    const bucket = line.shirtType === "Black shirt" ? black : white;
    bucket[line.shirtSize] += line.quantity;
  }

  const blackTotal = Object.values(black).reduce((a, b) => a + b, 0);
  const whiteTotal = Object.values(white).reduce((a, b) => a + b, 0);

  return { black, white, blackTotal, whiteTotal, linesWithSize };
}

function makeSheet(
  name: string,
  columnLabels: string[],
  rowValues: string[][],
): ManualUsageSheet {
  const columns = columnLabels.map((label) => ({ id: newSheetId(), label }));
  const rows = rowValues.map((cells) => {
    const record: Record<string, string> = {};
    columns.forEach((col, i) => {
      record[col.id] = cells[i] ?? "";
    });
    return { id: newSheetId(), cells: record };
  });
  return { id: newSheetId(), name, columns, rows };
}

export function buildUsageSheetsFromBigSellerLines(lines: BigSellerImportLine[]): ManualUsageSheet[] {
  if (lines.length === 0) return [];

  const orderIds = new Set(lines.map((l) => l.orderId));
  const lineRows = lines.map((l) => [
    l.orderId,
    l.itemName,
    l.variation,
    String(l.quantity),
    l.shirtType || "—",
    l.shirtSize ? SHIRT_SIZE_LABELS[l.shirtSize] : "—",
  ]);

  const { black, white, blackTotal, whiteTotal } = aggregateShirtSizes(lines);
  const sizeLabels = SHIRT_SIZE_ORDER.map((s) => SHIRT_SIZE_LABELS[s]);
  const blackRow = SHIRT_SIZE_ORDER.map((s) => String(black[s]));
  const whiteRow = SHIRT_SIZE_ORDER.map((s) => String(white[s]));

  const sheets: ManualUsageSheet[] = [
    makeSheet(BIGSELLER_ORDER_LINES_SHEET, ["Order ID", "Item name", "Variation", "Quantity", "Shirt", "Size"], lineRows),
    makeSheet("Black shirt — totals", [...sizeLabels, "Total"], [[...blackRow, String(blackTotal)]]),
    makeSheet("White shirt — totals", [...sizeLabels, "Total"], [[...whiteRow, String(whiteTotal)]]),
  ];

  if (orderIds.size > 0) {
    sheets.unshift(
      makeSheet("Import summary", ["Metric", "Value"], [
        ["Orders", String(orderIds.size)],
        ["Line items", String(lines.length)],
        ["Black shirts", String(blackTotal)],
        ["White shirts", String(whiteTotal)],
      ]),
    );
  }

  return sheets;
}

export function buildBigSellerImportResult(
  lines: BigSellerImportLine[],
  meta?: { skippedRows?: number; format?: string; duplicateCount?: number; totalInFile?: number },
): BigSellerImportResult {
  const { blackTotal, whiteTotal, linesWithSize } = aggregateShirtSizes(lines);
  const orderCount = new Set(lines.map((l) => l.orderId)).size;
  return {
    lines,
    sheets: buildUsageSheetsFromBigSellerLines(lines),
    orderCount,
    linesWithSize,
    blackTotal,
    whiteTotal,
    skippedRows: meta?.skippedRows,
    format: meta?.format,
    duplicateCount: meta?.duplicateCount,
    totalInFile: meta?.totalInFile,
  };
}

export function buildBigSellerImportResultForRecord(
  allParsedLines: BigSellerImportLine[],
  existingSheets: ManualUsageSheet[],
  meta?: { skippedRows?: number; format?: string },
): BigSellerImportResult {
  const { newLines, duplicateCount } = filterNewBigSellerLines(allParsedLines, existingSheets);
  if (newLines.length === 0) {
    return buildBigSellerImportResult([], {
      ...meta,
      duplicateCount,
      totalInFile: allParsedLines.length,
    });
  }
  return buildBigSellerImportResult(newLines, {
    ...meta,
    duplicateCount,
    totalInFile: allParsedLines.length,
  });
}

export async function parseBigSellerPdfFile(file: File): Promise<BigSellerImportResult> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfVersion = (pdfjs as { version?: string }).version ?? "5.7.284";
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfVersion}/build/pdf.worker.min.mjs`;

  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const chunks: string[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const text = await page.getTextContent();
    const pageText = text.items
      .map((it) => ("str" in it ? String(it.str || "").trim() : ""))
      .filter(Boolean)
      .join("\n");
    chunks.push(pageText);
  }
  const joined = chunks.join("\n");
  const parsed = parseBigSellerRowsFromText(joined);
  if (parsed.length === 0) {
    throw new Error("No orders found. Use a BigSeller Summary List or Pick List PDF export.");
  }
  return buildBigSellerImportResult(linesFromPdfRows(parsed), { format: "pdf" });
}

export async function parseBigSellerExcelFile(file: File): Promise<BigSellerImportResult> {
  const XLSX = await import("xlsx");
  const { pickMarketplaceOrderSheetName } = await import("@/lib/bigseller-excel-import");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = pickMarketplaceOrderSheetName(wb);
  if (!sheetName) throw new Error("Workbook has no sheets.");
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "" });
  const result = parseBigSellerExcelRows(rawRows);
  if (result.orders.length === 0) {
    const hint = result.skipReasons.length ? ` ${result.skipReasons.join("; ")}` : "";
    throw new Error(`No completed orders found in this file.${hint}`);
  }
  const lines = linesFromExcelOrders(result.orders);
  return buildBigSellerImportResult(lines, {
    skippedRows: result.skippedRows,
    format: result.format,
  });
}
