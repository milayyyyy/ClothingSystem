import type { SupabaseClient } from "@supabase/supabase-js";
import type { AttendanceRow, EmployeeOption } from "@/app/admin/attendance/attendance-client";

export type AttendancePageData = {
  rows: AttendanceRow[];
  employees: EmployeeOption[];
  clockMode: "manual" | "face";
};

export async function loadAttendancePageData(supabase: SupabaseClient): Promise<AttendancePageData> {
  const [{ data }, { data: employees }, { data: settings }] = await Promise.all([
    supabase
      .from("attendance")
      .select("*, user:user_id(full_name, email)")
      .order("time_in", { ascending: false })
      .limit(800),
    supabase
      .from("profiles")
      .select("id, full_name, email, face_descriptor")
      .in("role", ["employee", "sub_admin"])
      .order("full_name"),
    supabase.from("app_settings").select("key, value").eq("key", "clock_mode").maybeSingle(),
  ]);
  const clockMode = (settings as { value?: string } | null)?.value === "face" ? "face" : "manual";
  return {
    rows: (data as AttendanceRow[]) || [],
    employees: (employees as EmployeeOption[]) || [],
    clockMode,
  };
}
