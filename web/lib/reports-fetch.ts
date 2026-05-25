/** Paginated Supabase reads for reports (PostgREST 1000-row default cap). */

const PAGE = 1000;

async function fetchAllRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  select: string,
  orderColumn: string,
): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  const all: Record<string, unknown>[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(orderColumn, { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) return { data: [], error: error.message };
    const batch = (data || []) as Record<string, unknown>[];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  return { data: all, error: null };
}

export type ReportsRawData = {
  orders: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  salaries: Record<string, unknown>[];
  manualSales: Record<string, unknown>[];
  loadErrors: string[];
};

const ORDER_SELECT =
  "id, total, down_payment, status, stage, return_status, kind, order_type, source, notes, created_at, updated_at";

export async function fetchReportsRawData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<ReportsRawData> {
  const loadErrors: string[] = [];

  const [ordersRes, expensesRes, salariesRes, manualRes] = await Promise.all([
    fetchAllRows(supabase, "orders", ORDER_SELECT, "created_at"),
    fetchAllRows(supabase, "expenses", "id, amount, expense_date, category", "expense_date"),
    fetchAllRows(supabase, "salaries", "id, net_pay, gross_pay, period_start, period_end, paid", "period_end"),
    fetchAllRows(
      supabase,
      "manual_sales",
      "id, amount, sale_date, description, revenue_channel, channel",
      "sale_date",
    ),
  ]);

  if (ordersRes.error) loadErrors.push(`Orders: ${ordersRes.error}`);
  if (expensesRes.error) loadErrors.push(`Expenses: ${expensesRes.error}`);
  if (salariesRes.error) loadErrors.push(`Payroll: ${salariesRes.error}`);
  if (manualRes.error) loadErrors.push(`Revenue imports: ${manualRes.error}`);

  return {
    orders: ordersRes.data,
    expenses: expensesRes.data,
    salaries: salariesRes.data,
    manualSales: manualRes.data,
    loadErrors,
  };
}
