import { Card, CardContent } from "@/components/ui/card";
import { peso } from "@/lib/utils";
import { computeExpenseMonthSnapshot } from "@/lib/sales-expenses-overview";

type ExpRow = { expense_date: string; amount: number; category: string };

export function ExpensesMonthOverviewCards({ expenses }: { expenses: ExpRow[] }) {
  const s = computeExpenseMonthSnapshot(expenses);
  return (
    <div className="mb-4 grid gap-4 sm:grid-cols-3">
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">This month</div>
          <div className="text-2xl font-semibold">{peso(s.thisMonthTotal)}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Transactions</div>
          <div className="text-2xl font-semibold">{s.transactionCount}</div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Biggest category</div>
          <div className="text-2xl font-semibold">{s.topCategoryLabel}</div>
        </CardContent>
      </Card>
    </div>
  );
}
