import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { peso, formatDate } from "@/lib/utils";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MySalaryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = createClient();
  const { data } = await supabase.from("salaries").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  const total = (data || []).reduce((s, x) => s + Number(x.net_pay), 0);

  return (
    <div>
      <PageHeader title="My Salary" description="Earnings history" />
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">Lifetime earnings</div><div className="text-2xl font-semibold">{peso(total)}</div></CardContent></Card>
        <Card><CardContent className="p-5"><div className="text-xs text-muted-foreground">Salary type</div><div className="text-2xl font-semibold capitalize">{user.profile.salary_type} · {peso(user.profile.salary_rate)}</div></CardContent></Card>
      </div>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr><th className="p-3">Period</th><th>Days</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Status</th></tr></thead>
          <tbody>
            {(data || []).map((s) => (
              <tr key={s.id} className="border-t">
                <td className="p-3">{formatDate(s.period_start)} – {formatDate(s.period_end)}</td>
                <td>{s.days_worked}</td>
                <td>{peso(s.gross_pay)}</td>
                <td>{peso(s.deductions)}</td>
                <td className="font-semibold">{peso(s.net_pay)}</td>
                <td><Badge variant={s.paid ? "green" : "amber"}>{s.paid ? "Paid" : "Pending"}</Badge></td>
              </tr>
            ))}
            {(!data || data.length === 0) && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No records.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
