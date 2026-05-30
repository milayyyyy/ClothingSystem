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
import { formatActivityLog, type ActivityLogRow } from "@/lib/activity-log-format";
import { mergeUnifiedSaleRows, type ManualSaleRow, type UnifiedSaleListRow } from "@/lib/sales-list";
import { peso } from "@/lib/utils";

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
  action_label: string;
  entity_label: string;
  context: string;
  changes: string;
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
const PDF_TRUNCATE = 100;

function truncatePdfText(value: string, max = PDF_TRUNCATE): string {
  const s = value.trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

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
    const detail = formatActivityLog(row as ActivityLogRow);
    return {
      created_at: row.created_at,
      actor_name: row.actor?.full_name || row.actor?.email || "—",
      action_label: detail.actionLabel,
      entity_label: detail.entityLabel,
      context: detail.context,
      changes: detail.lines.join("; "),
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

function ensureSpace(doc: JsPDFDoc, needed: number) {
  const pageH = doc.internal.pageSize.getHeight();
  if (tableEndY(doc) + needed > pageH - PDF_MARGIN_MM) {
    doc.addPage();
  }
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
    cellPadding: 0.6,
    lineWidth: 0.1,
    lineColor: [210, 210, 210],
    minCellHeight: 3.5,
    valign: "middle",
  },
  headStyles: {
    fontSize: 6.5,
    cellPadding: 0.6,
    fillColor: [45, 45, 45],
    textColor: 255,
    fontStyle: "bold",
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

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("PrintShop — Full export", PDF_MARGIN_MM, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    `Generated ${generated} · Report date ${data.reportDate} · Stock/ready-made = current; other sections = report date.`,
    PDF_MARGIN_MM,
    16,
    { maxWidth: doc.internal.pageSize.getWidth() - PDF_MARGIN_MM * 2 },
  );

  let tableStartY: number;

  // --- Stock inventory ---
  tableStartY = sectionHeading(doc, "1. Stock inventory", `${data.inventory.length} item(s)`);
  const inv = truncateRows(data.inventory, "Inventory");
  autoTable(
    doc,
    compactTableOptions({
      startY: tableStartY + 1,
      head: [["Name", "Cat.", "Type", "Qty", "Unit", "Min", "Supplier"]],
      body: inv.rows.map((r) => [
        truncatePdfText(r.name, 40),
        truncatePdfText(r.category, 18),
        truncatePdfText(r.item_type, 14),
        String(r.quantity),
        r.unit,
        r.min_level,
        truncatePdfText(r.supplier, 24),
      ]),
      columnStyles: {
        0: { cellWidth: 42 },
        3: { halign: "right", cellWidth: 10 },
        4: { cellWidth: 10 },
        5: { cellWidth: 10 },
      },
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

    const headers = ["Item", ...sheet.columns.map((c) => truncatePdfText(c, 16))];
    const body = sheet.rows.map((row) => [
      truncatePdfText(row.label, 28),
      ...row.values.map((v) => truncatePdfText(String(v ?? ""), 12)),
    ]);
    const { rows: bodyTrunc, note } = truncateRows(body, `Sheet ${sheet.sheet}`);

    autoTable(
      doc,
      compactTableOptions({
        startY: yRm,
        head: [headers],
        body: bodyTrunc,
        headStyles: { fillColor: [55, 55, 85] },
        styles: { fontSize: 6, cellPadding: 0.5 },
        horizontalPageBreak: true,
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
  autoTable(
    doc,
    compactTableOptions({
      startY: tableStartY + 1,
      head: [["Type", "Name", "Acct. name", "Acct. #", "Balance"]],
      body: data.accounts.map((a) => [
        labelFinanceKind(a.kind),
        truncatePdfText(a.name, 28),
        truncatePdfText(a.account_name ?? "", 24),
        truncatePdfText(a.account_number ?? "", 16),
        peso(Number(a.balance || 0)),
      ]),
      columnStyles: { 4: { halign: "right" } },
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
  autoTable(
    doc,
    compactTableOptions({
      startY: tableStartY + 1,
      head: [["Date", "Account", "In", "Out", "After", "Description"]],
      body: tx.rows.map((t) => {
        const a = byId.get(t.account_id);
        const dir = t.direction === "out" ? "out" : "in";
        const amt = Number(t.amount || 0);
        return [
          String(t.occurred_at).slice(0, 10),
          truncatePdfText(a?.name ?? "", 22),
          dir === "in" ? peso(amt) : "",
          dir === "out" ? peso(amt) : "",
          peso(data.balanceAfter.get(t.id) ?? 0),
          truncatePdfText(t.description ?? "", 36),
        ];
      }),
      columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    }),
  );
  if (tx.note) {
    doc.setFontSize(6.5);
    doc.text(tx.note, PDF_MARGIN_MM, tableEndY(doc) + 2);
  }

  // --- Sales ---
  tableStartY = sectionHeading(doc, "5. Sales", `Date: ${data.reportDate} · ${data.sales.length} row(s)`);
  const sales = truncateRows(data.sales, "Sales");
  autoTable(
    doc,
    compactTableOptions({
      startY: tableStartY + 1,
      head: [["Date", "Channel", "Amt", "Customer", "Store / notes", "Desc."]],
      body: sales.rows.map((r) => [
        r.dateKey,
        truncatePdfText(r.channel, 14),
        peso(r.amount),
        truncatePdfText(r.customerOrTitle, 28),
        truncatePdfText(r.storeOrNotes, 24),
        truncatePdfText(r.description, 32),
      ]),
      columnStyles: { 2: { halign: "right" } },
    }),
  );
  if (sales.note) {
    doc.setFontSize(6.5);
    doc.text(sales.note, PDF_MARGIN_MM, tableEndY(doc) + 2);
  }

  // --- Expenses ---
  tableStartY = sectionHeading(doc, "6. Expenses", `Date: ${data.reportDate} · ${data.expenses.length} row(s)`);
  const exp = truncateRows(data.expenses, "Expenses");
  autoTable(
    doc,
    compactTableOptions({
      startY: tableStartY + 1,
      head: [["Date", "Category", "Description", "Amt", "Account", "Supplier"]],
      body: exp.rows.map((r) => [
        String(r.expense_date).slice(0, 10),
        truncatePdfText(r.category, 16),
        truncatePdfText(r.description ?? "", 32),
        peso(Number(r.amount || 0)),
        truncatePdfText(r.finance_account_name ?? r.paid_through ?? "", 22),
        truncatePdfText(r.supplier_name ?? "", 20),
      ]),
      columnStyles: { 3: { halign: "right" } },
    }),
  );
  if (exp.note) {
    doc.setFontSize(6.5);
    doc.text(exp.note, PDF_MARGIN_MM, tableEndY(doc) + 2);
  }

  // --- Activity log (landscape for more columns per page) ---
  doc.addPage("a4", "landscape");
  tableStartY = sectionHeading(doc, "7. Activity log", `Date: ${data.reportDate} · ${data.activityLogs.length} entry(ies)`);
  const act = truncateRows(data.activityLogs, "Activity log");
  const pageW = doc.internal.pageSize.getWidth();
  const activityContextW = Math.max(
    40,
    pageW - PDF_MARGIN_MM * 2 - 22 - 24 - 14 - 18 - 70,
  );
  autoTable(
    doc,
    compactTableOptions({
      startY: tableStartY + 1,
      head: [["Time", "Actor", "Action", "Area", "Context", "Changes"]],
      body: act.rows.map((r) => [
        formatPdfTime(r.created_at),
        truncatePdfText(r.actor_name, 18),
        r.action_label,
        truncatePdfText(r.entity_label, 14),
        truncatePdfText(r.context, 36),
        truncatePdfText(r.changes, 80),
      ]),
      styles: { overflow: "ellipsize" },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 24 },
        2: { cellWidth: 14 },
        3: { cellWidth: 18 },
        4: { cellWidth: activityContextW },
        5: { cellWidth: 70 },
      },
      margin: { left: PDF_MARGIN_MM, right: PDF_MARGIN_MM },
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
