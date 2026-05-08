import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { peso } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const supabase = createClient();
  const [{ data: orders }, { data: expenses }, { data: salaries }] = await Promise.all([
    supabase.from("orders").select("*"),
    supabase.from("expenses").select("*"),
    supabase.from("salaries").select("*"),
  ]);

  const byMonth: Record<string, { sales: number; expenses: number; payroll: number }> = {};
  function bucket(d: string) {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  }
  (orders || []).forEach((o: any) => {
    const k = bucket(o.created_at); byMonth[k] ??= { sales: 0, expenses: 0, payroll: 0 };
    byMonth[k].sales += Number(o.total);
  });
  (expenses || []).forEach((e: any) => {
    const k = bucket(e.expense_date); byMonth[k] ??= { sales: 0, expenses: 0, payroll: 0 };
    byMonth[k].expenses += Number(e.amount);
  });
  (salaries || []).forEach((s: any) => {
    const k = bucket(s.period_end); byMonth[k] ??= { sales: 0, expenses: 0, payroll: 0 };
    byMonth[k].payroll += Number(s.net_pay);
  });

  const rows = Object.entries(byMonth).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const totalSales = (orders || []).reduce((s: number, o: any) => s + Number(o.total), 0);
  const totalExp = (expenses || []).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const totalPay = (salaries || []).reduce((s: number, x: any) => s + Number(x.net_pay), 0);
  const profit = totalSales - totalExp - totalPay;

  // BIR Non-VAT 3% percentage tax estimate
  const completedSales = (orders || [])
    .filter((o: any) => ["delivered", "ready"].includes(o.status))
    .reduce((s: number, o: any) => s + Number(o.total), 0);
  const percentageTax = completedSales * 0.03;

  return (
    <div>
      <PageHeader title="Reports" description="Analytics and tax compliance" />
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Gross Sales" value={peso(totalSales)} />
        <Stat label="Total Expenses" value={peso(totalExp)} />
        <Stat label="Total Payroll" value={peso(totalPay)} />
        <Stat label="Net Profit" value={peso(profit)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Monthly Performance</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left"><tr><th className="p-3">Month</th><th>Sales</th><th>Expenses</th><th>Payroll</th><th>Net</th></tr></thead>
              <tbody>
                {rows.map(([m, v]) => {
                  const net = v.sales - v.expenses - v.payroll;
                  return (
                    <tr key={m} className="border-t">
                      <td className="p-3">{m}</td>
                      <td>{peso(v.sales)}</td>
                      <td>{peso(v.expenses)}</td>
                      <td>{peso(v.payroll)}</td>
                      <td className={net >= 0 ? "text-emerald-600" : "text-destructive"}>{peso(net)}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No data.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>BIR Non-VAT Estimate (PH)</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Completed sales (delivered/ready): <b>{peso(completedSales)}</b></p>
            <p>Percentage tax (3%): <b>{peso(percentageTax)}</b></p>
            <p className="text-muted-foreground">Filed quarterly via BIR Form 2551Q. Annual income tax via 1701A.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </CardContent></Card>
  );
}
