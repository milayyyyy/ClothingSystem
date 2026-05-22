import * as XLSX from "xlsx";
import type { SalesChannel } from "@/lib/sales";
import { normalizeRevenueChannelLabel } from "@/lib/online-shops";

export type ParsedRevenueImportRow = {
  sale_date: string;
  amount: number;
  description: string;
  channel: SalesChannel;
  revenue_channel: string;
  product_service: string | null;
  external_id: string | null;
  notes: string | null;
  import_key: string;
  sourceRow: number;
};

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function cellStr(sheet: XLSX.WorkSheet, r: number, c: number): string {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (cell == null || cell.v == null || cell.v === "") return "";
  if (cell.w != null && String(cell.w).trim()) return String(cell.w).trim();
  return String(cell.v).trim();
}

function cellNum(sheet: XLSX.WorkSheet, r: number, c: number): number {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (cell == null || cell.v == null || cell.v === "") return 0;
  const n = typeof cell.v === "number" ? cell.v : Number(String(cell.v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseRevenueDate(
  sheet: XLSX.WorkSheet,
  r: number,
  cDate: number,
  cMonth: number,
  cYear: number,
): string | null {
  const cell = sheet[XLSX.utils.encode_cell({ r, c: cDate })];
  const raw = cell?.v;

  if (typeof raw === "number" && raw > 20000 && raw < 80000) {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d?.y && d?.m && d?.d) {
      return `${d.y}-${pad2(d.m)}-${pad2(d.d)}`;
    }
  }

  const month = Math.round(cellNum(sheet, r, cMonth));
  const year = Math.round(cellNum(sheet, r, cYear));
  if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
    return `${year}-${pad2(month)}-01`;
  }

  const s = cellStr(sheet, r, cDate);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return null;
}

function findHeaderRow(sheet: XLSX.WorkSheet, maxRow: number): number {
  for (let r = 0; r <= Math.min(30, maxRow); r++) {
    const a = cellStr(sheet, r, 0).toUpperCase();
    const rev = cellStr(sheet, r, 4).toUpperCase();
    if (a === "DATE" && rev === "REVENUE") return r;
  }
  return -1;
}

/** Map bookkeeping REVENUE CHANNEL labels to order_kind for filters/tabs. */
export function mapRevenueChannelToKind(channel: string): SalesChannel {
  const s = channel.toLowerCase();
  if (s.includes("sublim")) return "sublimation";
  if (s.includes("service")) return "services";
  if (
    s.includes("tiktok") ||
    s.includes("shopee") ||
    s.includes("lazada") ||
    s.includes("online") ||
    s.includes("marketplace")
  ) {
    return "online";
  }
  return "local";
}

export function pickRevenueImportSheetName(wb: XLSX.WorkBook): string | null {
  const named = wb.SheetNames.find((n) => {
    const x = n.toLowerCase();
    return x.includes("revenue") && !x.includes("read me") && !x.includes("do not");
  });
  return named ?? null;
}

export function revenueImportDedupeKey(row: {
  sale_date: string;
  revenue_channel: string;
  product_service: string | null;
  description: string;
  amount: number;
}): string {
  return [
    row.sale_date,
    row.revenue_channel.toLowerCase(),
    (row.product_service || "").trim().toLowerCase(),
    row.description.trim().toLowerCase(),
    String(row.amount),
  ].join("|");
}

/** Parse Business Bookkeeping–style revenue export (2.1 Revenue). */
export function parseRevenueWorkbook(wb: XLSX.WorkBook): {
  rows: ParsedRevenueImportRow[];
  skipReasons: string[];
  sheetName: string | null;
} {
  const skipReasons: string[] = [];
  const sheetName = pickRevenueImportSheetName(wb);
  if (!sheetName) {
    return { rows: [], skipReasons: ["No revenue sheet found."], sheetName: null };
  }

  const sheet = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const headerRow = findHeaderRow(sheet, range.e.r);
  if (headerRow < 0) {
    return {
      rows: [],
      skipReasons: ["Could not find header row (DATE, REVENUE CHANNEL, REVENUE)."],
      sheetName,
    };
  }

  const colByHeader = new Map<string, number>();
  for (let c = 0; c <= range.e.c; c++) {
    const h = normHeader(cellStr(sheet, headerRow, c));
    if (h) colByHeader.set(h, c);
  }

  const cDate = colByHeader.get("date") ?? 0;
  const cId = colByHeader.get("id") ?? 1;
  const cProduct = colByHeader.get("product/service") ?? 2;
  const cChannel = colByHeader.get("revenue channel") ?? 3;
  const cAmt = colByHeader.get("revenue") ?? 4;
  const cNotes = colByHeader.get("additional notes") ?? 5;
  const cMonth = colByHeader.get("month") ?? 6;
  const cYear = colByHeader.get("year") ?? 7;

  const rows: ParsedRevenueImportRow[] = [];
  let skipped = 0;

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const revenueChannelRaw = cellStr(sheet, r, cChannel) || "Others";
    const revenueChannel = normalizeRevenueChannelLabel(revenueChannelRaw);
    const amount = cellNum(sheet, r, cAmt);
    const product = cellStr(sheet, r, cProduct) || null;

    if (!product && amount <= 0) continue;

    if (amount <= 0) {
      skipped += 1;
      continue;
    }

    const sale_date = parseRevenueDate(sheet, r, cDate, cMonth, cYear);
    if (!sale_date) {
      skipped += 1;
      if (!skipReasons.includes("Invalid or missing date")) skipReasons.push("Invalid or missing date");
      continue;
    }

    const externalId = cellStr(sheet, r, cId) || null;
    const additionalNotes = cellStr(sheet, r, cNotes);
    const description = product || revenueChannel || "Revenue";
    const channel = mapRevenueChannelToKind(revenueChannel);

    const noteParts = [additionalNotes, externalId ? `ID: ${externalId}` : ""].filter(Boolean);

    const base = {
      sale_date,
      revenue_channel: revenueChannel,
      product_service: product,
      description: description.slice(0, 500),
      amount: Math.round(amount * 100) / 100,
    };

    rows.push({
      ...base,
      channel,
      external_id: externalId,
      notes: noteParts.length ? noteParts.join(" · ").slice(0, 2000) : null,
      import_key: revenueImportDedupeKey(base),
      sourceRow: r + 1,
    });
  }

  if (skipped > 0 && rows.length === 0) {
    skipReasons.push(`${skipped} row(s) skipped (missing amount or date).`);
  } else if (skipped > 0) {
    skipReasons.push(`${skipped} row(s) skipped in file.`);
  }

  return { rows, skipReasons, sheetName };
}

export function filterNewRevenueImports(
  parsed: ParsedRevenueImportRow[],
  existing: {
    sale_date: string;
    revenue_channel: string | null;
    product_service: string | null;
    description: string;
    amount: number;
    import_key?: string | null;
  }[],
): { toImport: ParsedRevenueImportRow[]; duplicates: number } {
  const existingKeys = new Set(
    existing.map((e) =>
      e.import_key ||
        revenueImportDedupeKey({
          sale_date: String(e.sale_date).slice(0, 10),
          revenue_channel: e.revenue_channel || "",
          product_service: e.product_service,
          description: e.description,
          amount: Number(e.amount),
        }),
    ),
  );
  const toImport: ParsedRevenueImportRow[] = [];
  let duplicates = 0;
  for (const row of parsed) {
    if (existingKeys.has(row.import_key)) {
      duplicates += 1;
      continue;
    }
    existingKeys.add(row.import_key);
    toImport.push(row);
  }
  return { toImport, duplicates };
}
