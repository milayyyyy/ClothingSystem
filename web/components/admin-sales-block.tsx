import Link from "next/link";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart } from "@/components/ui/bar-chart";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { peso } from "@/lib/utils";
import { Store, Globe, Sparkles, TrendingUp, Clock, Wrench } from "lucide-react";
import {
  isPendingPipelineOrder,
  isSalesRecognized,
  formatSalesDateTime,
  getOrderKind,
  orderTypeLabel,
  SALES_CHANNELS,
  storeOrPlatform,
  type SalesChannel,
} from "@/lib/sales";

type ChannelAgg = { total: number; orderCount: number };

export function AdminSalesBlock({
  orders,
  compactHeader = false,
}: {
  orders: any[];
  compactHeader?: boolean;
}) {
  const completedRows = orders.filter((o) => isSalesRecognized(o.status));
  const pendingRows = orders.filter((o) => isPendingPipelineOrder(o.status));
  const rows = completedRows;

  const pendingTotal = pendingRows.reduce((s, o) => s + Number(o.total || 0), 0);

  const by: Record<SalesChannel, ChannelAgg> = {
    local: { total: 0, orderCount: 0 },
    online: { total: 0, orderCount: 0 },
    sublimation: { total: 0, orderCount: 0 },
    services: { total: 0, orderCount: 0 },
  };

  rows.forEach((o) => {
    const k = getOrderKind(o);
    const t = Number(o.total || 0);
    by[k].total += t;
    by[k].orderCount += 1;
  });

  const overall = SALES_CHANNELS.reduce((s, c) => s + by[c].total, 0);
  const chartData = SALES_CHANNELS.map((c) => ({
    label: orderTypeLabel(c),
    value: Math.round(by[c].total),
  }));

  function pct(part: number) {
    if (overall <= 0) return "0%";
    return `${((part / overall) * 100).toFixed(1)}%`;
  }

  const listRows = [...completedRows].sort((a, b) => {
    const ta = new Date(String(a.created_at || 0)).getTime();
    const tb = new Date(String(b.created_at || 0)).getTime();
    return tb - ta;
  });

  const pendingListRows = [...pendingRows].sort((a, b) => {
    const ta = new Date(String(a.created_at || 0)).getTime();
    const tb = new Date(String(b.created_at || 0)).getTime();
    return tb - ta;
  });

  return (
    <div id="sales" className="scroll-mt-20 space-y-8">
      {!compactHeader && (
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Sales</h2>
          <p className="text-sm text-muted-foreground">
            Completed sales use orders with status <span className="font-medium text-foreground">Ready</span> or{" "}
            <span className="font-medium text-foreground">Delivered</span> only. In-progress orders appear further down as{" "}
            <span className="font-medium text-foreground">Pending</span> (not included in totals or charts). Cancelled orders are omitted
            everywhere.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-8">
        <StatCard
          label="Pending orders"
          value={String(pendingRows.length)}
          icon={Clock}
          accent="warning"
          hint="Not ready/delivered — excluded from sales totals"
        />
        <StatCard
          label="Pending pipeline value"
          value={peso(pendingTotal)}
          icon={Clock}
          accent="muted"
          hint="Sum of order totals (informational)"
        />
        <StatCard
          label="Completed sales"
          value={peso(overall)}
          icon={TrendingUp}
          accent="primary"
          hint={`${rows.length} orders (ready + delivered)`}
        />
        <StatCard
          label={orderTypeLabel("local")}
          value={peso(by.local.total)}
          icon={Store}
          accent="success"
          hint={`${by.local.orderCount} orders · ${pct(by.local.total)}`}
        />
        <StatCard
          label={orderTypeLabel("online")}
          value={peso(by.online.total)}
          icon={Globe}
          accent="warning"
          hint={`${by.online.orderCount} orders · ${pct(by.online.total)}`}
        />
        <StatCard
          label={orderTypeLabel("services")}
          value={peso(by.services.total)}
          icon={Wrench}
          accent="muted"
          hint={`${by.services.orderCount} orders · ${pct(by.services.total)}`}
        />
        <StatCard
          label={orderTypeLabel("sublimation")}
          value={peso(by.sublimation.total)}
          icon={Sparkles}
          accent="muted"
          hint={`${by.sublimation.orderCount} orders · ${pct(by.sublimation.total)}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sales by channel</CardTitle>
            <CardDescription>Completed orders (ready + delivered) by channel</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart data={chartData} height={200} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Breakdown</CardTitle>
            <CardDescription>Order count and revenue by channel</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Channel</th>
                  <th className="font-medium">Orders</th>
                  <th className="font-medium">Total</th>
                  <th className="px-4 font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {SALES_CHANNELS.map((key) => {
                  const label = orderTypeLabel(key);
                  const row = by[key];
                  return (
                    <tr key={key} className="border-t">
                      <td className="px-4 py-3 font-medium">{label}</td>
                      <td>{row.orderCount}</td>
                      <td>{peso(row.total)}</td>
                      <td className="px-4 text-muted-foreground">{pct(row.total)}</td>
                    </tr>
                  );
                })}
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="px-4 py-3">All channels</td>
                  <td>{rows.length}</td>
                  <td>{peso(overall)}</td>
                  <td className="px-4">100%</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card id="sales-list" className="scroll-mt-20">
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>Completed sales list</CardTitle>
              <CardDescription>Ready or delivered orders only.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/admin/sales-expenses/sales/list" className="text-xs font-medium text-primary hover:underline">
                Sales list (filters) →
              </Link>
              <Link href="/admin/orders" className="text-xs font-medium text-primary hover:underline">
                Open orders →
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="font-medium">Date</th>
                  <th className="font-medium">Customer</th>
                  <th className="font-medium">Qty</th>
                  <th className="font-medium">Store</th>
                  <th className="font-medium">Order type</th>
                  <th className="px-4 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {listRows.map((o) => {
                  const k = getOrderKind(o);
                  const variant =
                    k === "online" ? "purple" : k === "sublimation" ? "teal" : k === "services" ? "amber" : "blue";
                  return (
                    <tr key={o.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">#{o.order_no}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{formatSalesDateTime(o.created_at as string)}</td>
                      <td className="max-w-[200px] truncate font-medium" title={String(o.customer_name || "")}>
                        {o.customer_name}
                      </td>
                      <td>{o.quantity ?? "—"}</td>
                      <td className="max-w-[180px] truncate text-muted-foreground" title={storeOrPlatform(o)}>
                        {storeOrPlatform(o)}
                      </td>
                      <td>
                        <Badge variant={variant as "purple" | "teal" | "blue" | "amber"}>{orderTypeLabel(k)}</Badge>
                      </td>
                      <td className="px-4 text-right font-medium">{peso(Number(o.total))}</td>
                    </tr>
                  );
                })}
                {listRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No completed sales yet. Move orders to <span className="font-medium">Ready</span> or{" "}
                      <span className="font-medium">Delivered</span> in{" "}
                      <Link href="/admin/orders" className="text-primary underline">
                        Orders
                      </Link>
                      .
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card id="sales-pending" className="scroll-mt-20">
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>Pending orders</CardTitle>
              <CardDescription>
                Not yet completed for sales — shown as pending. Workflow status is the current order status.
              </CardDescription>
            </div>
            <Link href="/admin/orders" className="text-xs font-medium text-primary hover:underline">
              Open orders →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="font-medium">Date</th>
                  <th className="font-medium">Customer</th>
                  <th className="font-medium">Qty</th>
                  <th className="font-medium">Store</th>
                  <th className="font-medium">Order type</th>
                  <th className="font-medium">Workflow</th>
                  <th className="font-medium">Sales</th>
                  <th className="px-4 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {pendingListRows.map((o) => {
                  const k = getOrderKind(o);
                  const variant =
                    k === "online" ? "purple" : k === "sublimation" ? "teal" : k === "services" ? "amber" : "blue";
                  return (
                    <tr key={o.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">#{o.order_no}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{formatSalesDateTime(o.created_at as string)}</td>
                      <td className="max-w-[200px] truncate font-medium" title={String(o.customer_name || "")}>
                        {o.customer_name}
                      </td>
                      <td>{o.quantity ?? "—"}</td>
                      <td className="max-w-[160px] truncate text-muted-foreground" title={storeOrPlatform(o)}>
                        {storeOrPlatform(o)}
                      </td>
                      <td>
                        <Badge variant={variant as "purple" | "teal" | "blue" | "amber"}>{orderTypeLabel(k)}</Badge>
                      </td>
                      <td>
                        <StatusBadge status={String(o.status || "pending")} />
                      </td>
                      <td>
                        <Badge variant="amber" title={`Workflow: ${String(o.status || "")}`}>
                          Pending
                        </Badge>
                      </td>
                      <td className="px-4 text-right font-medium">{peso(Number(o.total))}</td>
                    </tr>
                  );
                })}
                {pendingListRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      No pending orders. All active orders are ready, delivered, or cancelled.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
