import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { peso, formatDate } from "@/lib/utils";
import { redirect } from "next/navigation";
import { TimeClock } from "./time-clock";

export const dynamic = "force-dynamic";

export default async function EmployeeDashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = createClient();
  const [{ data: orders }, { data: salaries }, { data: attendance }] = await Promise.all([
    supabase.from("orders").select("*").eq("assigned_to", user.id).order("created_at", { ascending: false }),
    supabase.from("salaries").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
    supabase.from("attendance").select("*").eq("user_id", user.id).order("time_in", { ascending: false }).limit(1),
  ]);

  const open = (orders || []).filter((o) => !["delivered", "cancelled"].includes(o.status));
  const lastAttendance = attendance?.[0];
  const onClock = !!(lastAttendance && !lastAttendance.time_out);

  return (
    <div>
      <PageHeader title={`Hi, ${user.profile.full_name || "there"}`} description="Your tasks and earnings at a glance" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardContent className="p-5">
          <div className="text-xs uppercase text-muted-foreground">Open Tasks</div>
          <div className="mt-1 text-3xl font-semibold">{open.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-xs uppercase text-muted-foreground">Latest Net Pay</div>
          <div className="mt-1 text-3xl font-semibold">{peso(salaries?.[0]?.net_pay || 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <div className="text-xs uppercase text-muted-foreground">Attendance</div>
          <TimeClock onClock={onClock} lastId={lastAttendance?.id} userId={user.id} />
        </CardContent></Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>My Open Orders</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-left bg-muted/40"><tr><th className="p-3">#</th><th>Customer</th><th>Status</th><th>Due</th></tr></thead>
              <tbody>
                {open.slice(0,8).map((o) => (
                  <tr key={o.id} className="border-t"><td className="p-3 font-mono">#{o.order_no}</td><td>{o.customer_name}</td><td><StatusBadge status={o.status} /></td><td>{formatDate(o.due_date)}</td></tr>
                ))}
                {open.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No assigned tasks.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent Pay</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-left bg-muted/40"><tr><th className="p-3">Period</th><th>Days</th><th>Net</th><th>Status</th></tr></thead>
              <tbody>
                {(salaries || []).map((s) => (
                  <tr key={s.id} className="border-t"><td className="p-3">{formatDate(s.period_start)} – {formatDate(s.period_end)}</td><td>{s.days_worked}</td><td>{peso(s.net_pay)}</td><td>{s.paid ? "Paid" : "Pending"}</td></tr>
                ))}
                {(salaries || []).length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No payroll yet.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
