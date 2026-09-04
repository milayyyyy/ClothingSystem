import type { SupabaseClient } from "@supabase/supabase-js";
import {
  balanceAfterByTransactionId,
  labelFinanceKind,
  type FinanceAccountExport,
  type FinanceTxExport,
} from "@/lib/finance-csv-export";
import {
  fetchAllInventoryStock,
  fetchReadyMadeStockGrids,
  type InventoryStockRow,
  type ReadyMadeSheetGrid,
} from "@/lib/inventory-stock-export";
import { formatActivityLog, formatActivityLogForPdf, type ActivityLogRow } from "@/lib/activity-log-format";
import { mergeUnifiedSaleRows, type ManualSaleRow, type UnifiedSaleListRow } from "@/lib/sales-list";
import { peso as _peso } from "@/lib/utils";

/** PDF-safe currency formatter — avoids the ₱ glyph which jsPDF Helvetica
 *  cannot render (it appears as ± with garbled spacing). Uses plain ASCII. */
function peso(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "-PHP " : "PHP ") + formatted;
}
void _peso; // suppress unused-import warning

export type ExportReportOptions = {
  /** Report date (YYYY-MM-DD) for sales, expenses, money flow, and activity log. */
  date: string;
};

export type ExpenseExportRow = {
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  paid_through?: string | null;
  finance_account_name?: string | null;
  supplier_name?: string | null;
  notes?: string | null;
};

export type ActivityLogExportRow = {
  created_at: string;
  actor_name: string;
  /** e.g. "Edited Order" or "Added Task" */
  what: string;
  /** Context line + change details, pre-formatted for the PDF cell */
  details: string;
};

export type ExportReportData = {
  generatedAt: Date;
  reportDate: string;
  inventory: InventoryStockRow[];
  readyMade: ReadyMadeSheetGrid[];
  accounts: FinanceAccountExport[];
  transactions: FinanceTxExport[];
  balanceAfter: Map<string, number>;
  sales: UnifiedSaleListRow[];
  expenses: ExpenseExportRow[];
  activityLogs: ActivityLogExportRow[];
};

const MAX_TABLE_ROWS = 250;
const PDF_MARGIN_MM = 8;

function formatPdfTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function exportDateTag(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function defaultExportDate(): string {
  return exportDateTag();
}

/** Start of local calendar day as ISO for timestamp filters. */
function localDayStartIso(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/** End of local calendar day as ISO for timestamp filters. */
function localDayEndIso(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

export async function fetchExportReportData(
  supabase: SupabaseClient,
  opts: ExportReportOptions,
): Promise<ExportReportData> {
  const date = opts.date.trim().slice(0, 10);
  const dayStart = localDayStartIso(date);
  const dayEnd = localDayEndIso(date);

  const ordersQuery = supabase
    .from("orders")
    .select(
      "id, order_no, customer_name, kind, order_type, source, notes, design_ref, status, stage, total, down_payment, waybill_no, external_order_no, sku_code, return_status, updated_at, created_at",
    )
    .gte("updated_at", dayStart)
    .lte("updated_at", dayEnd)
    .order("updated_at", { ascending: false });

  const manualQuery = supabase
    .from("manual_sales")
    .select("id, sale_date, amount, description, channel, revenue_channel, product_service, notes, import_key")
    .eq("sale_date", date)
    .order("sale_date", { ascending: false });

  const expensesQuery = supabase
    .from("expenses")
    .select(
      "expense_date,category,description,amount,notes,paid_through,supplier:supplier_id(name),account:finance_account_id(name)",
    )
    .eq("expense_date", date)
    .order("expense_date", { ascending: false });

  const activityQuery = supabase
    .from("activity_logs")
    .select("id,action,entity,entity_id,summary,payload,created_at,actor:actor_id(full_name,email)")
    .gte("created_at", dayStart)
    .lte("created_at", dayEnd)
    .order("created_at", { ascending: false })
    .limit(500);

  const [
    inventory,
    readyMade,
    { data: accounts, error: accErr },
    { data: allTxs, error: txErr },
    { data: orders, error: ordersErr },
    { data: manual, error: manualErr },
    { data: expenseRows, error: expErr },
    { data: activityRows, error: actErr },
  ] = await Promise.all([
    fetchAllInventoryStock(supabase),
    fetchReadyMadeStockGrids(supabase),
    supabase
      .from("finance_accounts")
      .select("id,name,kind,balance,description,notes,opening_balance,account_name,account_number")
      .order("kind", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("finance_transactions")
      .select("id,occurred_at,account_id,direction,amount,description,created_at")
      .order("occurred_at", { ascending: true })
      .order("created_at", { ascending: true }),
    ordersQuery,
    manualQuery,
    expensesQuery,
    activityQuery,
  ]);

  if (accErr) throw new Error(accErr.message);
  if (txErr) throw new Error(txErr.message);
  if (ordersErr) throw new Error(ordersErr.message);
  if (manualErr) throw new Error(manualErr.message);
  if (expErr) throw new Error(expErr.message);
  if (actErr) throw new Error(actErr.message);

  const accountRows = (accounts || []) as FinanceAccountExport[];
  const allTransactions = (allTxs || []) as FinanceTxExport[];
  const balanceAfter = balanceAfterByTransactionId(accountRows, allTransactions);

  const filteredTx = allTransactions.filter((t) => String(t.occurred_at).slice(0, 10) === date);

  const sales = mergeUnifiedSaleRows(orders || [], (manual || []) as ManualSaleRow[]).filter(
    (r) => r.dateKey === date,
  );

  const expenses: ExpenseExportRow[] = ((expenseRows || []) as any[]).map((e) => ({
    expense_date: e.expense_date,
    category: e.category,
    description: e.description,
    amount: e.amount,
    notes: e.notes,
    paid_through: e.paid_through,
    finance_account_name: e.account?.name ?? null,
    supplier_name: e.supplier?.name ?? null,
  }));

  const activityLogs: ActivityLogExportRow[] = ((activityRows || []) as any[]).map((row) => {
    const detail = formatActivityLogForPdf(row as ActivityLogRow);
    return {
      created_at: row.created_at,
      actor_name: row.actor?.full_name || row.actor?.email || "—",
      what: detail.what,
      details: detail.details,
    };
  });

  return {
    generatedAt: new Date(),
    reportDate: date,
    inventory,
    readyMade,
    accounts: accountRows,
    transactions: filteredTx,
    balanceAfter,
    sales,
    expenses,
    activityLogs,
  };
}

type JsPDFDoc = import("jspdf").jsPDF;
type AutoTableFn = typeof import("jspdf-autotable").default;

/** Y below cover block when no table has been drawn yet. */
const PDF_COVER_END_Y = 19;

function tableEndY(doc: JsPDFDoc): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return last?.finalY ?? PDF_COVER_END_Y;
}

function tableContentWidth(doc: JsPDFDoc): number {
  return doc.internal.pageSize.getWidth() - 2 * PDF_MARGIN_MM;
}

function pageBottom(doc: JsPDFDoc): number {
  return doc.internal.pageSize.getHeight() - PDF_MARGIN_MM;
}

function ensureSpace(doc: JsPDFDoc, needed: number) {
  if (tableEndY(doc) + needed > pageBottom(doc)) {
    doc.addPage();
  }
}

/** Build column styles from mm widths; optional per-column alignment. */
function colStyles(
  widths: number[],
  align: ("left" | "center" | "right")[] = [],
): Record<number, { cellWidth: number; halign?: "left" | "center" | "right" }> {
  const out: Record<number, { cellWidth: number; halign?: "left" | "center" | "right" }> = {};
  widths.forEach((w, i) => {
    out[i] = { cellWidth: w, ...(align[i] ? { halign: align[i] } : {}) };
  });
  return out;
}

function sectionHeading(doc: JsPDFDoc, title: string, subtitle?: string) {
  ensureSpace(doc, 14);
  const afterCover = tableEndY(doc) <= PDF_COVER_END_Y + 1;
  let y = tableEndY(doc) + (afterCover ? 2 : 5);
  if (y > doc.internal.pageSize.getHeight() - 18) {
    doc.addPage();
    y = PDF_MARGIN_MM + 4;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(title, PDF_MARGIN_MM, y);
  y += 4;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(90, 90, 90);
    doc.text(subtitle, PDF_MARGIN_MM, y);
    doc.setTextColor(0, 0, 0);
    y += 3.5;
  }
  return y;
}

type AutoTableUserOptions = Parameters<AutoTableFn>[1];

const COMPACT_TABLE_BASE: AutoTableUserOptions = {
  theme: "grid",
  styles: {
    fontSize: 6.5,
    cellPadding: 1.2,
    lineWidth: 0.1,
    lineColor: [210, 210, 210],
    minCellHeight: 4,
    overflow: "linebreak",
    valign: "top",
  },
  headStyles: {
    fontSize: 6.5,
    cellPadding: 1.2,
    fillColor: [45, 45, 45],
    textColor: 255,
    fontStyle: "bold",
    valign: "middle",
  },
  margin: { left: PDF_MARGIN_MM, right: PDF_MARGIN_MM },
};

function compactTableOptions(overrides: AutoTableUserOptions = {}): AutoTableUserOptions {
  const baseMargin = COMPACT_TABLE_BASE.margin;
  const overrideMargin = overrides.margin;
  const margin =
    baseMargin && typeof baseMargin === "object" && overrideMargin && typeof overrideMargin === "object"
      ? { ...baseMargin, ...overrideMargin }
      : (overrideMargin ?? baseMargin);

  return {
    ...COMPACT_TABLE_BASE,
    ...overrides,
    styles: { ...COMPACT_TABLE_BASE.styles, ...overrides.styles },
    headStyles: { ...COMPACT_TABLE_BASE.headStyles, ...overrides.headStyles },
    margin,
  };
}

function truncateRows<T>(rows: T[], label: string): { rows: T[]; note: string | null } {
  if (rows.length <= MAX_TABLE_ROWS) return { rows, note: null };
  return {
    rows: rows.slice(0, MAX_TABLE_ROWS),
    note: `${label}: showing first ${MAX_TABLE_ROWS} of ${rows.length} rows.`,
  };
}

export async function buildExportReportPdf(data: ExportReportData): Promise<Blob> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default as AutoTableFn;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const generated = data.generatedAt.toLocaleString();
  const portraitW = tableContentWidth(doc);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("PrintShop — Full export", PDF_MARGIN_MM, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  const coverLines = doc.splitTextToSize(
    `Generated ${generated} · Report date ${data.reportDate} · Stock/ready-made = current; other sections = report date.`,
    portraitW,
  );
  doc.text(coverLines, PDF_MARGIN_MM, 16);

  let tableStartY: number;

  // --- Stock inventory ---
  tableStartY = sectionHeading(doc, "1. Stock inventory", `${data.inventory.length} item(s)`);
  const inv = truncateRows(data.inventory, "Inventory");
  const invW = [52, 22, 18, 12, 12, 12, portraitW - 52 - 22 - 18 - 12 - 12 - 12];
  autoTable(
    doc,
    compactTableOptions({
      startY: tableStartY + 1,
      tableWidth: portraitW,
      head: [["Name", "Cat.", "Type", "Qty", "Unit", "Min", "Supplier"]],
      body: inv.rows.map((r) => [
        r.name.trim() || "—",
        r.category.trim() || "—",
        r.item_type.trim() || "—",
        String(r.quantity),
        r.unit || "—",
        String(r.min_level),
        r.supplier.trim() || "—",
      ]),
      columnStyles: colStyles(
        invW,
        ["left", "left", "left", "right", "left", "right", "left"],
      ),
    }),
  );
  if (inv.note) {
    doc.setFontSize(6.5);
    doc.text(inv.note, PDF_MARGIN_MM, tableEndY(doc) + 2);
  }

  // --- Ready-made ---
  tableStartY = sectionHeading(
    doc,
    "2. Ready-made inventory",
    `${data.readyMade.length} sheet(s)`,
  );
  let yRm = tableStartY + 1;
  for (const sheet of data.readyMade) {
    ensureSpace(doc, 18);
    if (yRm > doc.internal.pageSize.getHeight() - 24) {
      doc.addPage();
      yRm = PDF_MARGIN_MM + 4;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(`${sheet.group} / ${sheet.sheet}`, PDF_MARGIN_MM, yRm);
    yRm += 3.5;

    if (sheet.columns.length === 0 && sheet.rows.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.5);
      doc.text("(empty)", PDF_MARGIN_MM, yRm);
      yRm += 5;
      continue;
    }

    const headers = ["Item", ...sheet.columns.map((c) => c.trim() || "—")];
    const body = sheet.rows.map((row) => [
      row.label.trim() || "—",
      ...row.values.map((v) => String(v ?? "").trim() || "—"),
    ]);
    const { rows: bodyTrunc, note } = truncateRows(body, `Sheet ${sheet.sheet}`);

    const itemColW = Math.min(36, portraitW * 0.22);
    const dataCols = sheet.columns.length;
    const dataColW = dataCols > 0 ? (portraitW - itemColW) / dataCols : portraitW - itemColW;
    const rmColStyles: Record<number, { cellWidth: number; halign?: "center" }> = {
      0: { cellWidth: itemColW },
    };
    for (let ci = 0; ci < dataCols; ci++) {
      rmColStyles[ci + 1] = { cellWidth: dataColW, halign: "center" };
    }

    autoTable(
      doc,
      compactTableOptions({
        startY: yRm,
        tableWidth: portraitW,
        head: [headers],
        body: bodyTrunc,
        headStyles: { fillColor: [55, 55, 85] },
        styles: { fontSize: 6, cellPadding: 1 },
        columnStyles: rmColStyles,
      }),
    );
    yRm = tableEndY(doc) + 2;
    if (note) {
      doc.setFontSize(6.5);
      doc.text(note, PDF_MARGIN_MM, yRm);
      yRm += 4;
    }
  }

  // --- Finance accounts ---
  tableStartY = sectionHeading(doc, "3. Finance — balances (current)", `${data.accounts.length} account(s)`);
  const finAccW = [22, 48, 44, 32, portraitW - 22 - 48 - 44 - 32];
  autoTable(
    doc,
    compactTableOptions({
      startY: tableStartY + 1,
      tableWidth: portraitW,
      head: [["Type", "Name", "Acct. name", "Acct. #", "Balance"]],
      body: data.accounts.map((a) => [
        labelFinanceKind(a.kind),
        a.name.trim() || "—",
        (a.account_name ?? "").trim() || "—",
        (a.account_number ?? "").trim() || "—",
        peso(Number(a.balance || 0)),
      ]),
      columnStyles: colStyles(finAccW, ["left", "left", "left", "left", "right"]),
    }),
  );

  // --- Money flow ---
  tableStartY = sectionHeading(
    doc,
    "4. Finance — money in / out",
    `Date: ${data.reportDate} · ${data.transactions.length} transaction(s)`,
  );
  const byId = new Map(data.accounts.map((a) => [a.id, a]));
  const tx = truncateRows(data.transactions, "Money flow");
  const txW = [20, 40, 24, 24, 26, portraitW - 20 - 40 - 24 - 24 - 26];
  autoTable(
    doc,
    compactTableOptions({
      startY: tableStartY + 1,
      tableWidth: portraitW,
      head: [["Date", "Account", "In", "Out", "After", "Description"]],
      body: tx.rows.map((t) => {
        const a = byId.get(t.account_id);
        const dir = t.direction === "out" ? "out" : "in";
        const amt = Number(t.amount || 0);
        return [
          String(t.occurred_at).slice(0, 10),
          (a?.name ?? "").trim() || "—",
          dir === "in" ? peso(amt) : "—",
          dir === "out" ? peso(amt) : "—",
          peso(data.balanceAfter.get(t.id) ?? 0),
          (t.description ?? "").trim() || "—",
        ];
      }),
      columnStyles: colStyles(txW, ["left", "left", "right", "right", "right", "left"]),
    }),
  );
  if (tx.note) {
    doc.setFontSize(6.5);
    doc.text(tx.note, PDF_MARGIN_MM, tableEndY(doc) + 2);
  }

  // --- Sales ---
  tableStartY = sectionHeading(doc, "5. Sales", `Date: ${data.reportDate} · ${data.sales.length} row(s)`);
  const sales = truncateRows(data.sales, "Sales");
  const salesW = [20, 18, 26, 42, 40, portraitW - 20 - 18 - 26 - 42 - 40];
  autoTable(
    doc,
    compactTableOptions({
      startY: tableStartY + 1,
      tableWidth: portraitW,
      head: [["Date", "Channel", "Amt", "Customer", "Store / notes", "Desc."]],
      body: sales.rows.map((r) => [
        r.dateKey,
        r.channel.trim() || "—",
        peso(r.amount),
        r.customerOrTitle.trim() || "—",
        r.storeOrNotes.trim() || "—",
        r.description.trim() || "—",
      ]),
      columnStyles: colStyles(salesW, ["left", "left", "right", "left", "left", "left"]),
    }),
  );
  if (sales.note) {
    doc.setFontSize(6.5);
    doc.text(sales.note, PDF_MARGIN_MM, tableEndY(doc) + 2);
  }

  // --- Expenses ---
  tableStartY = sectionHeading(doc, "6. Expenses", `Date: ${data.reportDate} · ${data.expenses.length} row(s)`);
  const exp = truncateRows(data.expenses, "Expenses");
  const expW = [20, 24, 52, 26, 36, portraitW - 20 - 24 - 52 - 26 - 36];
  autoTable(
    doc,
    compactTableOptions({
      startY: tableStartY + 1,
      tableWidth: portraitW,
      head: [["Date", "Category", "Description", "Amt", "Account", "Supplier"]],
      body: exp.rows.map((r) => [
        String(r.expense_date).slice(0, 10),
        r.category.trim() || "—",
        (r.description ?? "").trim() || "—",
        peso(Number(r.amount || 0)),
        (r.finance_account_name ?? r.paid_through ?? "").trim() || "—",
        (r.supplier_name ?? "").trim() || "—",
      ]),
      columnStyles: colStyles(expW, ["left", "left", "left", "right", "left", "left"]),
    }),
  );
  if (exp.note) {
    doc.setFontSize(6.5);
    doc.text(exp.note, PDF_MARGIN_MM, tableEndY(doc) + 2);
  }

  // --- Activity log (landscape, 4-column layout for readability) ---
  doc.addPage("a4", "landscape");
  const landscapeW = tableContentWidth(doc);
  tableStartY = sectionHeading(doc, "7. Activity log", `Date: ${data.reportDate} · ${data.activityLogs.length} entry(ies)`);
  const act = truncateRows(data.activityLogs, "Activity log");

  // Columns: Time | Who | What | Details
  // "Details" gets the remaining space (widest — holds context + field changes)
  const timeW = 22;
  const whoW  = 36;
  const whatW = 38;
  const detW  = landscapeW - timeW - whoW - whatW;
  const actW  = [timeW, whoW, whatW, detW];

  // Action-word colour map for the "What" cell
  const ACTION_COLORS: Record<string, [number, number, number]> = {
    Added:   [22, 101, 52],   // dark green
    Edited:  [30, 64, 175],   // dark blue
    Deleted: [153, 27, 27],   // dark red
  };

  autoTable(
    doc,
    compactTableOptions({
      startY: tableStartY + 1,
      tableWidth: landscapeW,
      head: [["Time", "Who", "What", "Details"]],
      body: act.rows.map((r) => [
        formatPdfTime(r.created_at),
        r.actor_name.trim() || "—",
        r.what.trim() || "—",
        r.details.trim() || "—",
      ]),
      columnStyles: colStyles(actW, ["left", "left", "left", "left"]),
      margin: { left: PDF_MARGIN_MM, right: PDF_MARGIN_MM },
      // Colour-code the "What" cell by action type
      didParseCell(hookData) {
        if (hookData.section === "body" && hookData.column.index === 2) {
          const text = String(hookData.cell.raw ?? "");
          const word = text.split(" ")[0] as keyof typeof ACTION_COLORS;
          const rgb = ACTION_COLORS[word];
          if (rgb) hookData.cell.styles.textColor = rgb;
          hookData.cell.styles.fontStyle = "bold";
        }
        // Make the Details column use a slightly lighter text colour so the
        // "What" cell stays visually prominent
        if (hookData.section === "body" && hookData.column.index === 3) {
          hookData.cell.styles.textColor = [40, 40, 40];
        }
      },
    }),
  );
  if (act.note) {
    doc.setFontSize(6.5);
    doc.text(act.note, PDF_MARGIN_MM, tableEndY(doc) + 2);
  }

  return doc.output("blob");
}

export function downloadExportReportPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
