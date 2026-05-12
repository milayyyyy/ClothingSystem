import { getOrderKind, isSalesRecognized, orderTypeLabel, SALES_CHANNELS, type SalesChannel } from "@/lib/sales";

function inCalendarMonth(iso: string | null | undefined, ref = new Date()) {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
}

export type SalesMonthSnapshot = {
  thisMonthTotal: number;
  transactionCount: number;
  topChannelLabel: string;
};

export function computeSalesMonthSnapshot(orders: any[], ref = new Date()): SalesMonthSnapshot {
  let orderTotal = 0;
  let orderCount = 0;
  (orders || []).forEach((o) => {
    if (!isSalesRecognized(o.status)) return;
    const ts = String(o.updated_at || o.created_at || "");
    if (!inCalendarMonth(ts, ref)) return;
    orderTotal += Number(o.total || 0);
    orderCount += 1;
  });

  const byChannel: Record<SalesChannel, number> = { local: 0, online: 0, sublimation: 0, services: 0 };
  (orders || []).forEach((o) => {
    if (!isSalesRecognized(o.status)) return;
    const ts = String(o.updated_at || o.created_at || "");
    if (!inCalendarMonth(ts, ref)) return;
    const k = getOrderKind(o);
    byChannel[k] += Number(o.total || 0);
  });

  let top: SalesChannel = "local";
  let topVal = -1;
  SALES_CHANNELS.forEach((c) => {
    if (byChannel[c] > topVal) {
      topVal = byChannel[c];
      top = c;
    }
  });

  return {
    thisMonthTotal: orderTotal,
    transactionCount: orderCount,
    topChannelLabel: topVal > 0 ? orderTypeLabel(top) : "—",
  };
}

export type ExpenseMonthSnapshot = {
  thisMonthTotal: number;
  transactionCount: number;
  topCategoryLabel: string;
};

export function computeExpenseMonthSnapshot(expenses: { expense_date: string; amount: number; category: string }[], ref = new Date()): ExpenseMonthSnapshot {
  const list = expenses || [];
  const monthRows = list.filter((e) => inCalendarMonth(e.expense_date, ref));
  const thisMonthTotal = monthRows.reduce((s, e) => s + Number(e.amount || 0), 0);
  const byCat: Record<string, number> = {};
  monthRows.forEach((e) => {
    byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount || 0);
  });
  const biggest = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  return {
    thisMonthTotal,
    transactionCount: monthRows.length,
    topCategoryLabel: biggest ? biggest[0] : "—",
  };
}
