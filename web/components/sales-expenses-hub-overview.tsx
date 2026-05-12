import Link from "next/link";
import { SalesMonthOverviewCards } from "@/components/sales-month-overview-cards";
import { ExpensesMonthOverviewCards } from "@/components/expenses-month-overview-cards";

type ExpRow = { expense_date: string; amount: number; category: string };

export function SalesExpensesHubOverview({
  orders,
  expenses,
}: {
  orders: any[];
  expenses: ExpRow[];
}) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Overview</h2>
        <p className="text-sm text-muted-foreground">
          This month: completed sales (ready or delivered orders) and logged expenses. Open Sales or Expenses below for full detail.
        </p>
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border bg-card/50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sales</span>
            <Link href="/admin/sales-expenses/sales" className="text-xs font-medium text-primary hover:underline">
              Open Sales →
            </Link>
          </div>
          <SalesMonthOverviewCards orders={orders} />
        </div>
        <div className="space-y-3 rounded-lg border bg-card/50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Expenses</span>
            <Link href="/admin/sales-expenses/expenses" className="text-xs font-medium text-primary hover:underline">
              Open Expenses →
            </Link>
          </div>
          <ExpensesMonthOverviewCards expenses={expenses} />
        </div>
      </div>
    </section>
  );
}
