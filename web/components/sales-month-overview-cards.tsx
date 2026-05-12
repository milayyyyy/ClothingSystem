import { Card, CardContent } from "@/components/ui/card";
import { peso } from "@/lib/utils";
import { computeSalesMonthSnapshot } from "@/lib/sales-expenses-overview";

export function SalesMonthOverviewCards({ orders }: { orders: any[] }) {
  const s = computeSalesMonthSnapshot(orders);
  return (
    <div className="mb-4 grid gap-4 sm:grid-cols-3">
      <Card>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">This month (completed)</div>
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
          <div className="text-xs text-muted-foreground">Top channel</div>
          <div className="text-2xl font-semibold">{s.topChannelLabel}</div>
        </CardContent>
      </Card>
    </div>
  );
}
