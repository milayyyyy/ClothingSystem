import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { BarChart } from "@/components/ui/bar-chart";
import { peso, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { ShoppingBag, Wallet, TrendingDown, TrendingUp, Package, Receipt, AlertTriangle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const supabase = createClient();
  const [{ data: orders }, { data: expenses }, { data: inventory }] = await Promise.all([
    supabase.from("orders").select("*").order("created_at", { ascending: false }),
    supabase.from("expenses").select("*"),
    supabase.from("inventory").select("*"),
  ]);

  const totalSales = (orders || []).reduce((s, o) => s + Number(o.total || 0), 0);
  const collected = (orders || []).reduce((s, o) => s + Number(o.down_payment || 0), 0);
  const outstanding = totalSales - collected;
  const active = (orders || []).filter((o) => !["delivered", "cancelled", "ready"].includes(o.status)).length;
  const monthExpenses = (expenses || [])
    .filter((e) => new Date(e.expense_date).getMonth() === new Date().getMonth())
    .reduce((s, e) => s + Number(e.amount), 0);
  const profit = totalSales - monthExpenses;
  const lowStock = (inventory || []).filter((i) => Number(i.quantity) <= Number(i.min_level));

  // Last 6 months of sales
  const months = Array.from({ length: 6 }).map((_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    return d;
  });
  const chartData = months.map((m) => {
    const total = (orders || [])
      .filter((o) => {
        const d = new Date(o.created_at);
        return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
      })
      .reduce((s, o) => s + Number(o.total || 0), 0);
    return { label: m.toLocaleDateString("en-US", { month: "short" }), value: total };
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Overview · ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Sales"   value={peso(totalSales)}    icon={TrendingUp}   accent="primary" />
        <StatCard label="Collected"     value={peso(collected)}     icon={Wallet}       accent="success" />
        <StatCard label="Outstanding"   value={peso(outstanding)}   icon={TrendingDown} accent="warning" />
        <StatCard label="Active Orders" value={active}              icon={ShoppingBag}  accent="primary" />
        <StatCard label="This Month Exp" value={peso(monthExpenses)} icon={Receipt}     accent="destructive" />
        <StatCard label="Est. Profit"   value={peso(profit)}        icon={TrendingUp}   accent="success" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 anim-in">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Sales Trend</CardTitle>
                <CardDescription>Total order value over the last 6 months</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <BarChart data={chartData} />
          </CardContent>
        </Card>

        <Card className="anim-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Low Stock
            </CardTitle>
            <CardDescription>Items at or below minimum level</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lowStock.length === 0 && (
              <p className="rounded-md bg-emerald-500/5 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                All items above minimum.
              </p>
            )}
            {lowStock.slice(0, 6).map((i) => {
              const pct = Math.min(100, (Number(i.quantity) / Math.max(1, Number(i.min_level))) * 100);
              return (
                <div key={i.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium">{i.name}</span>
                    <span className="text-xs text-muted-foreground">{i.quantity}/{i.min_level} {i.unit}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: pct + "%", background: pct < 50 ? "hsl(var(--destructive))" : "hsl(var(--warning))" }}
                    />
                  </div>
                </div>
              );
            })}
            {lowStock.length > 0 && (
              <Link href="/admin/inventory" className="block pt-2 text-xs font-medium text-primary hover:underline">
                View all inventory →
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 anim-in">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Recent Orders</CardTitle>
              <CardDescription>Most recent customer orders</CardDescription>
            </div>
            <Link href="/admin/orders" className="text-xs font-medium text-primary hover:underline">View all →</Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 text-left font-medium">Order</th>
                <th className="text-left font-medium">Customer</th>
                <th className="text-left font-medium">Total</th>
                <th className="text-left font-medium">Status</th>
                <th className="px-6 text-left font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {(orders || []).slice(0, 5).map((o) => (
                <tr key={o.id} className="border-t row-hover hover:bg-muted/30">
                  <td className="px-6 py-3 font-mono text-xs">#{o.order_no}</td>
                  <td className="font-medium">{o.customer_name}</td>
                  <td>{peso(o.total)}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="px-6 text-muted-foreground">{formatDate(o.due_date)}</td>
                </tr>
              ))}
              {(!orders || orders.length === 0) && (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-sm text-muted-foreground">
                  No orders yet — create your first one in <Link href="/admin/orders" className="text-primary underline">Orders</Link>.
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
