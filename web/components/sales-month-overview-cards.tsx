import { Card, CardContent } from "@/components/ui/card";
import { peso } from "@/lib/utils";
import { computeSalesMonthSnapshot } from "@/lib/sales-expenses-overview";

export function SalesMonthOverviewCards({ orders }: { orders: any[] }) {
  const s = computeSalesMonthSnapshot(orders);
  return (
    <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
      <Card>
        <CardContent className="p-5">
          <div className="text-xs text-muted-foreground">This month (completed)</div>
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
          <div className="text-xs text-muted-foreground">Top channel</div>
          <div className="mt-2 text-2xl font-semibold tracking-tight">{s.topChannelLabel}</div>
        </CardContent>
      </Card>
    </div>
  );
}
