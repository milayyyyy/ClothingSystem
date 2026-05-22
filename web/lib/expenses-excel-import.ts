import * as XLSX from "xlsx";
import { normalizeExpenseCategory } from "@/lib/expense-categories";

export type ParsedExpenseImportRow = {
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  notes: string | null;
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

function parseExpenseDate(
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
    const cat = cellStr(sheet, r, 3).toUpperCase();
    if (a === "DATE" && cat.includes("CATEGORY")) return r;
  }
  return -1;
}

/** Pick the daily expenses table sheet (e.g. "2.2 Expenses"). */
export function pickExpensesImportSheetName(wb: XLSX.WorkBook): string | null {
  const named = wb.SheetNames.find((n) => {
    const x = n.toLowerCase();
    return x.includes("expense") && !x.includes("read me") && !x.includes("do not");
  });
  return named ?? null;
}

/** Parse Business Bookkeeping–style expenses export. */
export function parseExpensesWorkbook(wb: XLSX.WorkBook): {
  rows: ParsedExpenseImportRow[];
  skipReasons: string[];
  sheetName: string | null;
} {
  const skipReasons: string[] = [];
  const sheetName = pickExpensesImportSheetName(wb);
  if (!sheetName) {
    return { rows: [], skipReasons: ["No expenses sheet found."], sheetName: null };
  }

  const sheet = wb.Sheets[sheetName];
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const headerRow = findHeaderRow(sheet, range.e.r);
  if (headerRow < 0) {
    return {
      rows: [],
      skipReasons: ["Could not find header row (DATE, EXPENSE CATEGORY, TOTAL EXPENSES)."],
      sheetName,
    };
  }

  const colByHeader = new Map<string, number>();
  for (let c = 0; c <= range.e.c; c++) {
    const h = normHeader(cellStr(sheet, headerRow, c));
    if (h) colByHeader.set(h, c);
  }

  const cDate = colByHeader.get("date") ?? 0;
  const cExpenseId = colByHeader.get("expense id") ?? 1;
  const cDesc = colByHeader.get("expense description") ?? 2;
  const cCat = colByHeader.get("expense category") ?? 3;
  const cAmt = colByHeader.get("total expenses") ?? 4;
  const cNotes = colByHeader.get("additional notes") ?? 5;
  const cMonth = colByHeader.get("month") ?? 6;
  const cYear = colByHeader.get("year") ?? 7;

  const rows: ParsedExpenseImportRow[] = [];
  let skipped = 0;

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const categoryRaw = cellStr(sheet, r, cCat);
    const amount = cellNum(sheet, r, cAmt);
    const description = cellStr(sheet, r, cDesc) || null;

    if (!categoryRaw && amount <= 0 && !description) continue;

    if (!categoryRaw || categoryRaw === " ") {
      skipped += 1;
      continue;
    }
    if (amount <= 0) {
      skipped += 1;
      continue;
    }

    const expense_date = parseExpenseDate(sheet, r, cDate, cMonth, cYear);
    if (!expense_date) {
      skipped += 1;
      if (!skipReasons.includes("Invalid or missing date")) skipReasons.push("Invalid or missing date");
      continue;
    }

    const expenseId = cellStr(sheet, r, cExpenseId);
    const additionalNotes = cellStr(sheet, r, cNotes);
    const noteParts = [
      expenseId ? `Expense ID: ${expenseId}` : "",
      additionalNotes,
    ].filter(Boolean);

    rows.push({
      expense_date,
      category: normalizeExpenseCategory(categoryRaw),
      description: description?.slice(0, 500) ?? null,
      amount: Math.round(amount * 100) / 100,
      notes: noteParts.length ? noteParts.join(" · ").slice(0, 2000) : null,
      sourceRow: r + 1,
    });
  }

  if (skipped > 0 && rows.length === 0) {
    skipReasons.push(`${skipped} row(s) skipped (missing category, amount, or date).`);
  } else if (skipped > 0) {
    skipReasons.push(`${skipped} row(s) skipped in file.`);
  }

  return { rows, skipReasons, sheetName };
}

export function expenseImportDedupeKey(row: {
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
}): string {
  return [
    row.expense_date,
    row.category.toLowerCase(),
    (row.description || "").trim().toLowerCase(),
    String(row.amount),
  ].join("|");
}

export function filterNewExpenseImports(
  parsed: ParsedExpenseImportRow[],
  existing: { expense_date: string; category: string; description: string | null; amount: number }[],
): { toImport: ParsedExpenseImportRow[]; duplicates: number } {
  const existingKeys = new Set(
    existing.map((e) =>
      expenseImportDedupeKey({
        expense_date: String(e.expense_date).slice(0, 10),
        category: e.category,
        description: e.description,
        amount: Number(e.amount),
      }),
    ),
  );
  const toImport: ParsedExpenseImportRow[] = [];
  let duplicates = 0;
  for (const row of parsed) {
    const key = expenseImportDedupeKey(row);
    if (existingKeys.has(key)) {
      duplicates += 1;
      continue;
    }
    existingKeys.add(key);
    toImport.push(row);
  }
  return { toImport, duplicates };
}
