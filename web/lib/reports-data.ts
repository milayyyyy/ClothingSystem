import {
  countsTowardMainSales,
  isBigSellerOnlineOrder,
  isOrderCancelled,
  isPendingPipelineOrder,
  isSalesRecognized,
} from "@/lib/sales";

export type ReportDatePreset =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "year"
  | "all"
  | "custom";

export type ReportOrderRow = {
  id: string;
  total: number;
  down_payment: number;
  status: string;
  stage: string;
  return_status: string | null;
  dateKey: string;
  isMainSale: boolean;
  isBigSeller: boolean;
  isRecognized: boolean;
  isPending: boolean;
};

export type ReportExpenseRow = {
  id: string;
  amount: number;
  expense_date: string;
  category: string;
};

export type ReportSalaryRow = {
  id: string;
  net_pay: number;
  gross_pay: number;
  period_start: string;
  period_end: string;
  paid: boolean;
};

export type ReportManualSaleRow = {
  id: string;
  amount: number;
  sale_date: string;
  revenue_channel: string;
};

export type MonthlyReportRow = {
  month: string;
  sales: number;
  bigSellerSales: number;
  manualRevenue: number;
  expenses: number;
  payroll: number;
  net: number;
};

export type ReportSummary = {
  completedMainSales: number;
  bigSellerSales: number;
  manualRevenue: number;
  totalCompletedSales: number;
  allOrdersGross: number;
  pendingPipeline: number;
  downPaymentsInPeriod: number;
  expenses: number;
  payroll: number;
  netProfit: number;
  profitMarginPct: number;
  orderCountCompleted: number;
  orderCountAll: number;
  orderCountPending: number;
  expenseCount: number;
  payrollCount: number;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function orderActivityDateKey(o: {
  updated_at?: string | null;
  created_at?: string | null;
}): string {
  const iso = String(o.updated_at || o.created_at || "");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return localDateKey(d);
}

export function resolveReportDateRange(
  preset: ReportDatePreset,
  customFrom = "",
  customTo = "",
): { from: string; to: string; label: string; allTime: boolean } {
  const now = new Date();
  const today = localDateKey(now);

  if (preset === "all") {
    return { from: "", to: "", label: "All time", allTime: true };
  }

  if (preset === "custom") {
    const from = customFrom.slice(0, 10);
    const to = customTo.slice(0, 10);
    return {
      from,
      to: to || from,
      label: from && to ? `${from} → ${to}` : from || to || "Custom",
      allTime: !from && !to,
    };
  }

  if (preset === "today") {
    return { from: today, to: today, label: "Today", allTime: false };
  }

  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const key = localDateKey(y);
    return { from: key, to: key, label: "Yesterday", allTime: false };
  }

  if (preset === "week") {
    const start = new Date(now);
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
    return { from: localDateKey(start), to: today, label: "This week", allTime: false };
  }

  if (preset === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: localDateKey(start), to: today, label: "This month", allTime: false };
  }

  if (preset === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { from: localDateKey(start), to: today, label: "This year", allTime: false };
  }

  return { from: "", to: "", label: "All time", allTime: true };
}

export function inReportDateRange(
  dateKey: string,
  from: string,
  to: string,
  allTime: boolean,
): boolean {
  if (allTime || !dateKey) return allTime;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
}

function monthBucket(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function normalizeReportOrders(raw: Record<string, unknown>[]): ReportOrderRow[] {
  return raw.map((o) => {
    const row = o as {
      id: string;
      total?: number;
      down_payment?: number;
      status?: string;
      stage?: string;
      return_status?: string | null;
      kind?: string;
      order_type?: string;
      source?: string;
      notes?: string;
      updated_at?: string;
      created_at?: string;
    };
    const recognized = isSalesRecognized(row);
    const bigSeller = isBigSellerOnlineOrder(row);
    return {
      id: String(row.id),
      total: Number(row.total || 0),
      down_payment: Number(row.down_payment || 0),
      status: String(row.status || ""),
      stage: String(row.stage || ""),
      return_status: row.return_status ?? null,
      dateKey: orderActivityDateKey(row),
      isMainSale: countsTowardMainSales(row),
      isBigSeller: bigSeller && recognized,
      isRecognized: recognized,
      isPending: isPendingPipelineOrder(row) && !isOrderCancelled(row.status),
    };
  });
}

export function normalizeReportExpenses(raw: Record<string, unknown>[]): ReportExpenseRow[] {
  return raw.map((e) => ({
    id: String(e.id),
    amount: Number(e.amount || 0),
    expense_date: String(e.expense_date || "").slice(0, 10),
    category: String(e.category || "—"),
  }));
}

export function normalizeReportSalaries(raw: Record<string, unknown>[]): ReportSalaryRow[] {
  return raw.map((s) => ({
    id: String(s.id),
    net_pay: Number(s.net_pay || 0),
    gross_pay: Number(s.gross_pay || 0),
    period_start: String(s.period_start || "").slice(0, 10),
    period_end: String(s.period_end || "").slice(0, 10),
    paid: Boolean(s.paid),
  }));
}

export function normalizeReportManualSales(raw: Record<string, unknown>[]): ReportManualSaleRow[] {
  return raw.map((m) => ({
    id: String(m.id),
    amount: Number(m.amount || 0),
    sale_date: String(m.sale_date || "").slice(0, 10),
    revenue_channel: String(m.revenue_channel || "—"),
  }));
}

export function computeReportSummary(
  orders: ReportOrderRow[],
  expenses: ReportExpenseRow[],
  salaries: ReportSalaryRow[],
  manualSales: ReportManualSaleRow[],
  range: { from: string; to: string; allTime: boolean },
): ReportSummary {
  const ordersInRange = orders.filter((o) => inReportDateRange(o.dateKey, range.from, range.to, range.allTime));
  const expensesInRange = expenses.filter((e) =>
    inReportDateRange(e.expense_date, range.from, range.to, range.allTime),
  );
  const salariesInRange = salaries.filter((s) =>
    inReportDateRange(s.period_end, range.from, range.to, range.allTime),
  );
  const manualInRange = manualSales.filter((m) =>
    inReportDateRange(m.sale_date, range.from, range.to, range.allTime),
  );

  const completedMainSales = ordersInRange.filter((o) => o.isMainSale).reduce((s, o) => s + o.total, 0);
  const bigSellerSales = ordersInRange.filter((o) => o.isBigSeller).reduce((s, o) => s + o.total, 0);
  const manualRevenue = manualInRange.reduce((s, m) => s + m.amount, 0);
  /** Matches Sales list: main completed orders + bookkeeping imports (excludes BigSeller). */
  const totalCompletedSales = completedMainSales + manualRevenue;

  const allOrdersGross = ordersInRange
    .filter((o) => !isOrderCancelled(o.status) && !o.isBigSeller)
    .reduce((s, o) => s + o.total, 0);

  const pendingPipeline = ordersInRange
    .filter((o) => o.isPending && !o.isBigSeller)
    .reduce((s, o) => s + o.total, 0);
  const downPaymentsInPeriod = ordersInRange
    .filter((o) => o.isPending && !o.isBigSeller && o.down_payment > 0)
    .reduce((s, o) => s + o.down_payment, 0);

  const expensesTotal = expensesInRange.reduce((s, e) => s + e.amount, 0);
  const payrollTotal = salariesInRange.reduce((s, x) => s + x.net_pay, 0);
  const netProfit = totalCompletedSales - expensesTotal - payrollTotal;
  const profitMarginPct =
    totalCompletedSales > 0 ? (netProfit / totalCompletedSales) * 100 : 0;

  return {
    completedMainSales,
    bigSellerSales,
    manualRevenue,
    totalCompletedSales,
    allOrdersGross,
    pendingPipeline,
    downPaymentsInPeriod,
    expenses: expensesTotal,
    payroll: payrollTotal,
    netProfit,
    profitMarginPct,
    orderCountCompleted:
      ordersInRange.filter((o) => o.isMainSale).length + manualInRange.length,
    orderCountAll: ordersInRange.filter((o) => !isOrderCancelled(o.status) && !o.isBigSeller).length,
    orderCountPending: ordersInRange.filter((o) => o.isPending && !o.isBigSeller).length,
    expenseCount: expensesInRange.length,
    payrollCount: salariesInRange.length,
  };
}

export function computeMonthlyBreakdown(
  orders: ReportOrderRow[],
  expenses: ReportExpenseRow[],
  salaries: ReportSalaryRow[],
  manualSales: ReportManualSaleRow[],
  range: { from: string; to: string; allTime: boolean },
): MonthlyReportRow[] {
  const byMonth: Record<string, MonthlyReportRow> = {};

  function ensure(month: string) {
    if (!byMonth[month]) {
      byMonth[month] = {
        month,
        sales: 0,
        bigSellerSales: 0,
        manualRevenue: 0,
        expenses: 0,
        payroll: 0,
        net: 0,
      };
    }
    return byMonth[month];
  }

  for (const o of orders) {
    if (!inReportDateRange(o.dateKey, range.from, range.to, range.allTime)) continue;
    const m = monthBucket(o.dateKey);
    if (!m) continue;
    const row = ensure(m);
    if (o.isMainSale) row.sales += o.total;
    if (o.isBigSeller) row.bigSellerSales += o.total;
  }

  for (const ms of manualSales) {
    if (!inReportDateRange(ms.sale_date, range.from, range.to, range.allTime)) continue;
    const m = monthBucket(ms.sale_date);
    if (!m) continue;
    ensure(m).manualRevenue += ms.amount;
  }

  for (const e of expenses) {
    if (!inReportDateRange(e.expense_date, range.from, range.to, range.allTime)) continue;
    const m = monthBucket(e.expense_date);
    if (!m) continue;
    ensure(m).expenses += e.amount;
  }

  for (const s of salaries) {
    if (!inReportDateRange(s.period_end, range.from, range.to, range.allTime)) continue;
    const m = monthBucket(s.period_end);
    if (!m) continue;
    ensure(m).payroll += s.net_pay;
  }

  return Object.values(byMonth)
    .map((row) => {
      const revenue = row.sales + row.manualRevenue;
      return { ...row, net: revenue - row.expenses - row.payroll };
    })
    .sort((a, b) => (a.month < b.month ? 1 : -1));
}

export function topExpenseCategories(
  expenses: ReportExpenseRow[],
  range: { from: string; to: string; allTime: boolean },
  limit = 8,
): Array<{ category: string; amount: number }> {
  const byCat: Record<string, number> = {};
  for (const e of expenses) {
    if (!inReportDateRange(e.expense_date, range.from, range.to, range.allTime)) continue;
    byCat[e.category] = (byCat[e.category] || 0) + e.amount;
  }
  return Object.entries(byCat)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}
