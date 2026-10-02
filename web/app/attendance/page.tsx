import { createClient, getSessionUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";

export const revalidate = 0;

const AttendanceKioskClient = dynamic(
  () => import("./attendance-kiosk-client").then((m) => m.AttendanceKioskClient),
  { ssr: false },
);

function localDayStartIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
}

function localDayEndIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
}

export default async function AttendancePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = createClient();

  const { data: todayRows } = await supabase
    .from("attendance")
    .select("id, user_id, time_in, time_out, user:user_id(full_name, email)")
    .gte("time_in", localDayStartIso())
    .lte("time_in", localDayEndIso())
    .order("time_in", { ascending: false });

  return <AttendanceKioskClient initialRows={(todayRows as any[]) || []} />;
}
