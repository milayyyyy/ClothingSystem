import { createClient, getSessionUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { BarChart } from "@/components/ui/bar-chart";
import { peso, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import { ShoppingBag, Wallet, TrendingDown, TrendingUp, Package, Receipt, Warehouse } from "lucide-react";
import Link from "next/link";
import { fetchReadyMadeDashboardLowStockItems } from "@/lib/ready-made-dashboard-low-stock";
import { DashboardReminderCards } from "@/components/dashboard-reminder-cards";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = createClient();
  const [{ data: orders }, { data: expenses }, { data: inventory }, { data: tasksRaw }, readyMadeLow] =
    await Promise.all([
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("expenses").select("*"),
      supabase.from("inventory").select("*"),
      supabase.from("tasks").select("id,title,status,priority,due_date").order("due_date", { ascending: true }),
      fetchReadyMadeDashboardLowStockItems(supabase),
    ]);

  const totalSales = (orders || []).reduce((s, o) => s + Number(o.total || 0), 0);
  const collected = (orders || []).reduce((s, o) => s + Number(o.down_payment || 0), 0);
  const outstanding = totalSales - collected;
  const active = (orders || []).filter((o) => !["delivered", "cancelled", "ready"].includes(o.status)).length;
  const monthExpenses = (expenses || [])
    .filter((e) => new Date(e.expense_date).getMonth() === new Date().getMonth())
    .reduce((s, e) => s + Number(e.amount), 0);
  const profit = totalSales - monthExpenses;
  const lowStockInventory = (inventory || []).filter((i) => Number(i.quantity) <= Number(i.min_level));
  const lowStock = lowStockInventory; // kept for DashboardReminderCards compat
  const tasksReminders = (tasksRaw || [])
    .filter((t) => t.status !== "done" && t.status !== "cancelled")
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return String(a.due_date).localeCompare(String(b.due_date));
    });

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

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <span className="text-muted-foreground">Shortcuts:</span>
        <Link href="/admin/stores" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          <Warehouse className="h-3.5 w-3.5" /> Stores
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link href="/admin/orders" className="font-medium text-primary hover:underline">Orders</Link>
        <span className="text-muted-foreground">·</span>
        <Link href="/admin/inventory" className="font-medium text-primary hover:underline">Inventory</Link>
        <span className="text-muted-foreground">·</span>
        <Link href="/admin/inventory/ready-made" className="font-medium text-primary hover:underline">Ready made</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Sales"   value={peso(totalSales)}    icon={TrendingUp}   accent="primary" />
        <StatCard label="Collected"     value={peso(collected)}     icon={Wallet}       accent="success" />
        <StatCard label="Outstanding"   value={peso(outstanding)}   icon={TrendingDown} accent="warning" />
        <StatCard label="Active Orders" value={active}              icon={ShoppingBag}  accent="primary" />
        <StatCard label="This Month Exp" value={peso(monthExpenses)} icon={Receipt}     accent="destructive" />
        <StatCard label="Est. Profit"   value={peso(profit)}        icon={TrendingUp}   accent="success" />
      </div>

      <div className="mt-6">
        <DashboardReminderCards tasks={tasksReminders} lowStock={lowStock} lowStockReadyMade={readyMadeLow} variant="admin" />
      </div>

      <Card className="mt-6 anim-in">
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
