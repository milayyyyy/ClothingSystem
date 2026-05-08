"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { peso, formatDate } from "@/lib/utils";

export function SalaryClient({ employees, salaries, attendance }: { employees: any[]; salaries: any[]; attendance: any[] }) {
  const supabase = createClient();
  const [list, setList] = useState(salaries);
  const [busy, setBusy] = useState(false);

  const monthStart = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d;
  }, []);
  const monthEnd = useMemo(() => {
    const d = new Date(monthStart); d.setMonth(d.getMonth() + 1); d.setDate(0); return d;
  }, [monthStart]);

  function daysWorked(uid: string) {
    const set = new Set(
      attendance
        .filter((a) => a.user_id === uid && new Date(a.time_in) >= monthStart && new Date(a.time_in) <= monthEnd)
        .map((a) => new Date(a.time_in).toDateString())
    );
    return set.size;
  }

  async function processPayroll() {
    if (!confirm("Generate salary records for current month for all employees?")) return;
    setBusy(true);
    const rows = employees.map((e) => {
      const days = daysWorked(e.id);
      const gross = e.salary_type === "daily" ? days * Number(e.salary_rate)
                  : e.salary_type === "monthly" ? Number(e.salary_rate)
                  : 0;
      return {
        user_id: e.id,
        period_start: monthStart.toISOString().slice(0, 10),
        period_end: monthEnd.toISOString().slice(0, 10),
        days_worked: days,
        gross_pay: gross,
        deductions: 0,
        net_pay: gross,
        paid: false,
      };
    });
    const { data } = await supabase.from("salaries").insert(rows).select();
    setList((prev) => [...(data || []), ...prev]);
    setBusy(false);
  }

  async function markPaid(id: string) {
    const { data } = await supabase.from("salaries").update({ paid: true, paid_at: new Date().toISOString() }).eq("id", id).select().single();
    setList((prev) => prev.map((s) => (s.id === id ? data : s)));
  }

  const total = list.reduce((s, x) => s + Number(x.net_pay || 0), 0);

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={processPayroll} disabled={busy}>{busy ? "Processing..." : "Process Current-Month Payroll"}</Button>
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr>
            <th className="p-3">Employee</th><th>Period</th><th>Days</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {list.map((s) => {
              const emp = employees.find((e) => e.id === s.user_id);
              return (
                <tr key={s.id} className="border-t">
                  <td className="p-3">{emp?.full_name || emp?.email || "—"}</td>
                  <td>{formatDate(s.period_start)} – {formatDate(s.period_end)}</td>
                  <td>{s.days_worked}</td>
                  <td>{peso(s.gross_pay)}</td>
                  <td>{peso(s.deductions)}</td>
                  <td className="font-semibold">{peso(s.net_pay)}</td>
                  <td><Badge variant={s.paid ? "green" : "amber"}>{s.paid ? "Paid" : "Unpaid"}</Badge></td>
                  <td>{!s.paid && <Button size="sm" variant="outline" onClick={() => markPaid(s.id)}>Mark Paid</Button>}</td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No payroll yet.</td></tr>}
          </tbody>
          <tfoot><tr className="border-t bg-muted/40"><td colSpan={5} className="p-3 text-right font-medium">Total</td><td colSpan={3} className="font-semibold">{peso(total)}</td></tr></tfoot>
        </table>
      </CardContent></Card>
    </>
  );
}
