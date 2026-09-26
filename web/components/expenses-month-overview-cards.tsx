import { Card, CardContent } from "@/components/ui/card";
import { peso } from "@/lib/utils";
import { computeExpenseMonthSnapshot } from "@/lib/sales-expenses-overview";

type ExpRow = { expense_date: string; amount: number; category: string };

export function ExpensesMonthOverviewCards({ expenses }: { expenses: ExpRow[] }) {
  const s = computeExpenseMonthSnapshot(expenses);
  return (
    <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
      <Card>
        <CardContent className="p-5">
          <div className="text-xs text-muted-foreground">This month</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{peso(s.thisMonthTotal)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <div className="text-xs text-muted-foreground">Transactions</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{s.transactionCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-5">
          <div className="text-xs text-muted-foreground">Biggest category</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{s.topCategoryLabel}</div>
        </CardContent>
      </Card>
    </div>
  );
}
