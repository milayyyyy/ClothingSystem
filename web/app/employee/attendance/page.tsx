import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { TimeClock } from "../time-clock";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MyAttendancePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = createClient();
  const { data } = await supabase.from("attendance").select("*").eq("user_id", user.id).order("time_in", { ascending: false }).limit(50);
  const last = data?.[0];
  const onClock = !!(last && !last.time_out);

  return (
    <div>
      <PageHeader title="Attendance" description="Time in / time out" />
      <Card className="mb-6"><CardContent className="p-5"><TimeClock onClock={onClock} lastId={last?.id} userId={user.id} /></CardContent></Card>
      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr><th className="p-3">Date</th><th>Time In</th><th>Time Out</th><th>Hours</th></tr></thead>
          <tbody>
            {(data || []).map((a) => {
              const inT = new Date(a.time_in);
              const outT = a.time_out ? new Date(a.time_out) : null;
              const dur = outT ? ((outT.getTime() - inT.getTime()) / 3600000).toFixed(2) + "h" : "—";
              return (
                <tr key={a.id} className="border-t">
                  <td className="p-3">{formatDate(inT)}</td>
                  <td>{inT.toLocaleTimeString()}</td>
                  <td>{outT ? outT.toLocaleTimeString() : "—"}</td>
                  <td>{dur}</td>
                </tr>
              );
            })}
            {(!data || data.length === 0) && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No records.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
