/** Amount already collected on an order (down payment / payments). */
export function orderPaidAmount(order: { down_payment?: number | null }): number {
  return Math.max(0, Number(order?.down_payment || 0));
}

/** Amount the owner chose not to collect (goodwill / write-off). */
export function orderUncollectedAmount(order: { uncollected_amount?: number | null }): number {
  return Math.max(0, Number(order?.uncollected_amount || 0));
}

/** Still collectible: total − paid − uncollected (never negative). */
export function orderCollectibleBalance(order: {
  total?: number | null;
  down_payment?: number | null;
  uncollected_amount?: number | null;
}): number {
  const total = Number(order?.total || 0);
  return Math.max(0, total - orderPaidAmount(order) - orderUncollectedAmount(order));
}
