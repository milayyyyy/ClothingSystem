import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminAttendancePage() {
  const supabase = createClient();
  const { data } = await supabase.from("attendance").select("*, user:user_id(full_name, email)").order("time_in", { ascending: false }).limit(200);

  return (
    <div>
      <PageHeader title="Attendance" description="All employee time logs" />
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr>
            <th className="p-3">Employee</th><th>Date</th><th>Time In</th><th>Time Out</th><th>Duration</th>
          </tr></thead>
          <tbody>
            {(data || []).map((a: any) => {
              const inT = new Date(a.time_in);
              const outT = a.time_out ? new Date(a.time_out) : null;
              const dur = outT ? ((outT.getTime() - inT.getTime()) / 3600000).toFixed(2) + "h" : "—";
              return (
                <tr key={a.id} className="border-t hover:bg-muted/30">
                  <td className="p-3">{a.user?.full_name || a.user?.email}</td>
                  <td>{formatDate(inT)}</td>
                  <td>{inT.toLocaleTimeString()}</td>
                  <td>{outT ? outT.toLocaleTimeString() : "—"}</td>
                  <td>{dur}</td>
                </tr>
              );
            })}
            {(!data || data.length === 0) && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No attendance records.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
