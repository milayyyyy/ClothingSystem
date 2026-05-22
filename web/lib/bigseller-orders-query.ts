/**
 * PostgREST BigSeller list: each OR branch is `and(...)` so `order_type.eq.online` is not
 * accidentally combined with only one `ilike` branch (chaining `.eq().or('a,b')` is fragile).
 * `ilike` tokens avoid spaces so comma-separated OR parsing stays unambiguous.
 */
export const BIGSELLER_ORDERS_OR_FILTER =
  "and(order_type.eq.online,source.ilike.%BigSeller%),and(order_type.eq.online,notes.ilike.%Imported%BigSeller%PDF%),and(order_type.eq.online,notes.ilike.%Imported%BigSeller%Excel%),and(order_type.eq.online,notes.ilike.%marketplace%excel%historical%)";

/** Load all BigSeller orders (paginated past PostgREST default 1000-row cap). */
export async function fetchAllBigSellerOrders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  select: string,
): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  const all: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("orders")
      .select(select)
      .or(BIGSELLER_ORDERS_OR_FILTER)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return { data: [], error: error.message };
    const batch = (data || []) as Record<string, unknown>[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return { data: all, error: null };
}

/** Broader PostgREST filter used on BigSeller Sales (source/notes mention BigSeller). */
export const BIGSELLER_SALES_OR_FILTER = "source.ilike.%bigseller%,notes.ilike.%bigseller%";

/** Paginated fetch for BigSeller Sales list (past 1000-row cap). */
export async function fetchAllBigSellerSalesOrders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  select: string,
): Promise<{ data: Record<string, unknown>[]; error: string | null }> {
  const all: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("orders")
      .select(select)
      .or(BIGSELLER_SALES_OR_FILTER)
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) return { data: [], error: error.message };
    const batch = (data || []) as Record<string, unknown>[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return { data: all, error: null };
}
