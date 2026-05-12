/**
 * PostgREST BigSeller list: each OR branch is `and(...)` so `order_type.eq.online` is not
 * accidentally combined with only one `ilike` branch (chaining `.eq().or('a,b')` is fragile).
 * `ilike` tokens avoid spaces so comma-separated OR parsing stays unambiguous.
 */
export const BIGSELLER_ORDERS_OR_FILTER =
  "and(order_type.eq.online,source.ilike.%BigSeller%),and(order_type.eq.online,notes.ilike.%Imported%BigSeller%PDF%)";
