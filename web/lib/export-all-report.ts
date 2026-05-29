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

function tableEndY(doc: JsPDFDoc): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return last?.finalY ?? 40;
}

function ensureSpace(doc: JsPDFDoc, needed: number) {
  const pageH = doc.internal.pageSize.getHeight();
  if (tableEndY(doc) + needed > pageH - 14) {
    doc.addPage();
  }
}

function sectionHeading(doc: JsPDFDoc, title: string, subtitle?: string) {
  ensureSpace(doc, 24);
  let y = tableEndY(doc) + (doc.getNumberOfPages() === 1 && tableEndY(doc) < 30 ? 0 : 12);
  if (y > doc.internal.pageSize.getHeight() - 30) {
    doc.addPage();
    y = 18;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(title, 14, y);
  y += 6;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(subtitle, 14, y);
    doc.setTextColor(0, 0, 0);
    y += 5;
  }
  return y;
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

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const tag = exportDateTag(data.generatedAt);
  const generated = data.generatedAt.toLocaleString();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("PrintShop — Full export report", 14, 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generated: ${generated}`, 14, 28);
  doc.text(`Report date: ${data.reportDate}`, 14, 34);
  doc.text("Stock inventory & ready-made: current snapshot. Other sections are for this date only.", 14, 40);

  // --- Stock inventory ---
  sectionHeading(doc, "1. Stock inventory", `${data.inventory.length} item(s)`);
  const inv = truncateRows(data.inventory, "Inventory");
  autoTable(doc, {
    startY: tableEndY(doc) + 2,
    head: [["Name", "Category", "Type", "Qty", "Unit", "Min", "Supplier"]],
    body: inv.rows.map((r) => [
      r.name,
      r.category,
      r.item_type,
      String(r.quantity),
      r.unit,
      r.min_level,
      r.supplier,
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [40, 40, 40] },
    margin: { left: 14, right: 14 },
  });
  if (inv.note) {
    doc.setFontSize(8);
    doc.text(inv.note, 14, tableEndY(doc) + 4);
  }

  // --- Ready-made ---
  sectionHeading(
    doc,
    "2. Ready-made inventory",
    `${data.readyMade.length} sheet(s) — grouped as in the app`,
  );
  let yRm = tableEndY(doc) + 4;
  for (const sheet of data.readyMade) {
    ensureSpace(doc, 30);
    if (yRm > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      yRm = 18;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Group: ${sheet.group}  ·  Sheet: ${sheet.sheet}`, 14, yRm);
    yRm += 5;

    if (sheet.columns.length === 0 && sheet.rows.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.text("(empty sheet)", 14, yRm);
      yRm += 8;
      continue;
    }

    const headers = ["Row / Item", ...sheet.columns];
    const body = sheet.rows.map((row) => [row.label, ...row.values]);
    const { rows: bodyTrunc, note } = truncateRows(body, `Sheet ${sheet.sheet}`);

    autoTable(doc, {
      startY: yRm,
      head: [headers],
      body: bodyTrunc,
      styles: { fontSize: 7, cellPadding: 1.2 },
      headStyles: { fillColor: [60, 60, 100] },
      margin: { left: 14, right: 14 },
      horizontalPageBreak: true,
    });
    yRm = tableEndY(doc) + 4;
    if (note) {
      doc.setFontSize(7);
      doc.text(note, 14, yRm);
      yRm += 6;
    }
  }

  // --- Finance accounts ---
  doc.addPage();
  sectionHeading(doc, "3. Finance — account balances (current)", `${data.accounts.length} account(s)`);
  autoTable(doc, {
    startY: tableEndY(doc) + 2,
    head: [["Type", "Name", "Account name", "Account #", "Balance"]],
    body: data.accounts.map((a) => [
      labelFinanceKind(a.kind),
      a.name,
      a.account_name ?? "",
      a.account_number ?? "",
      peso(Number(a.balance || 0)),
    ]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [40, 40, 40] },
    margin: { left: 14, right: 14 },
  });

  // --- Money flow ---
  sectionHeading(
    doc,
    "4. Finance — money in / out",
    `Date: ${data.reportDate} · ${data.transactions.length} transaction(s)`,
  );
  const byId = new Map(data.accounts.map((a) => [a.id, a]));
  const tx = truncateRows(data.transactions, "Money flow");
  autoTable(doc, {
    startY: tableEndY(doc) + 2,
    head: [["Date", "Account", "In", "Out", "Balance after", "Description"]],
    body: tx.rows.map((t) => {
      const a = byId.get(t.account_id);
      const dir = t.direction === "out" ? "out" : "in";
      const amt = Number(t.amount || 0);
      return [
        String(t.occurred_at).slice(0, 10),
        a?.name ?? "",
        dir === "in" ? peso(amt) : "",
        dir === "out" ? peso(amt) : "",
        peso(data.balanceAfter.get(t.id) ?? 0),
        t.description ?? "",
      ];
    }),
    styles: { fontSize: 7, cellPadding: 1.2 },
    headStyles: { fillColor: [40, 40, 40] },
    margin: { left: 14, right: 14 },
  });
  if (tx.note) {
    doc.setFontSize(8);
    doc.text(tx.note, 14, tableEndY(doc) + 4);
  }

  // --- Sales ---
  doc.addPage();
  sectionHeading(doc, "5. Sales", `Date: ${data.reportDate} · ${data.sales.length} row(s)`);
  const sales = truncateRows(data.sales, "Sales");
  autoTable(doc, {
    startY: tableEndY(doc) + 2,
    head: [["Date", "Channel", "Amount", "Customer", "Store / notes", "Description"]],
    body: sales.rows.map((r) => [
      r.dateKey,
      r.channel,
      peso(r.amount),
      r.customerOrTitle,
      r.storeOrNotes,
      r.description,
    ]),
    styles: { fontSize: 7, cellPadding: 1.2 },
    headStyles: { fillColor: [40, 40, 40] },
    margin: { left: 14, right: 14 },
  });
  if (sales.note) {
    doc.setFontSize(8);
    doc.text(sales.note, 14, tableEndY(doc) + 4);
  }

  // --- Expenses ---
  sectionHeading(doc, "6. Expenses", `Date: ${data.reportDate} · ${data.expenses.length} row(s)`);
  const exp = truncateRows(data.expenses, "Expenses");
  autoTable(doc, {
    startY: tableEndY(doc) + 2,
    head: [["Date", "Category", "Description", "Amount", "Account", "Supplier"]],
    body: exp.rows.map((r) => [
      String(r.expense_date).slice(0, 10),
      r.category,
      r.description ?? "",
      peso(Number(r.amount || 0)),
      r.finance_account_name ?? r.paid_through ?? "",
      r.supplier_name ?? "",
    ]),
    styles: { fontSize: 7, cellPadding: 1.2 },
    headStyles: { fillColor: [40, 40, 40] },
    margin: { left: 14, right: 14 },
  });
  if (exp.note) {
    doc.setFontSize(8);
    doc.text(exp.note, 14, tableEndY(doc) + 4);
  }

  // --- Activity log ---
  doc.addPage();
  sectionHeading(doc, "7. Activity log", `Date: ${data.reportDate} · ${data.activityLogs.length} entry(ies)`);
  const act = truncateRows(data.activityLogs, "Activity log");
  autoTable(doc, {
    startY: tableEndY(doc) + 2,
    head: [["Time", "Actor", "Action", "Area", "Context", "What changed"]],
    body: act.rows.map((r) => [
      new Date(r.created_at).toLocaleString(),
      r.actor_name,
      r.action_label,
      r.entity_label,
      r.context,
      r.changes,
    ]),
    styles: { fontSize: 6.5, cellPadding: 1.2, overflow: "linebreak" },
    headStyles: { fillColor: [40, 40, 40] },
    columnStyles: {
      0: { cellWidth: 28 },
      5: { cellWidth: 55 },
    },
    margin: { left: 10, right: 10 },
  });
  if (act.note) {
    doc.setFontSize(8);
    doc.text(act.note, 14, tableEndY(doc) + 4);
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
