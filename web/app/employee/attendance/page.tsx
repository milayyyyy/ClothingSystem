import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MyAttendancePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = createClient();
  const { data } = await supabase
    .from("attendance")
    .select("*")
    .eq("user_id", user.id)
    .order("time_in", { ascending: false })
    .limit(50);

  return (
    <div>
      <PageHeader title="Attendance" description="Your attendance history. Time in / out is managed by the Attendance Management kiosk." />
      <Card>
        <CardContent className="overflow-x-auto overscroll-x-contain p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Time In</th>
                <th className="p-3">Time Out</th>
                <th className="p-3">Hours</th>
              </tr>
            </thead>
            <tbody>
              {(data || []).map((a) => {
                const inT = new Date(a.time_in);
                const outT = a.time_out ? new Date(a.time_out) : null;
                const dur = outT ? ((outT.getTime() - inT.getTime()) / 3600000).toFixed(2) + "h" : "—";
                return (
                  <tr key={a.id} className="border-t">
                    <td className="p-3">{formatDate(inT)}</td>
                    <td className="p-3">{inT.toLocaleTimeString()}</td>
                    <td className="p-3">{outT ? outT.toLocaleTimeString() : "—"}</td>
                    <td className="p-3">{dur}</td>
                  </tr>
                );
              })}
              {(!data || data.length === 0) && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">No records.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
