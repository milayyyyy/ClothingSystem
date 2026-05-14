import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { AdminAttendanceClient } from "./attendance-client";

export const dynamic = "force-dynamic";

export default async function AdminAttendancePage() {
  const supabase = createClient();
  const [{ data }, { data: employees }] = await Promise.all([
    supabase
      .from("attendance")
      .select("*, user:user_id(full_name, email)")
      .order("time_in", { ascending: false })
      .limit(800),
    supabase.from("profiles").select("id, full_name, email, face_descriptor").in("role", ["employee", "sub_admin"]).order("full_name"),
  ]);

  return (
    <div>
      <PageHeader title="Attendance" description="Add or edit employee time in/out; salary uses these times for hourly and day-based pay." />
      <AdminAttendanceClient initial={data || []} employees={employees || []} />
    </div>
  );
}
