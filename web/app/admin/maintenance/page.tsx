import { redirect } from "next/navigation";
import { createClient, requireStaff } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { MaintenanceClient } from "./maintenance-client";
import { MAINTENANCE_SCHEDULE_SELECT, normalizeMaintenanceScheduleRow } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export default async function AdminMaintenancePage() {
  const user = await requireStaff();
  if (!user) redirect("/login");
  const supabase = createClient();
  const [{ data, error }, { data: staff }] = await Promise.all([
    supabase.from("maintenance_schedules").select(MAINTENANCE_SCHEDULE_SELECT).order("starts_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["employee", "sub_admin"]).order("full_name"),
  ]);
  if (error) {
    return (
      <div>
        <PageHeader title="Machine maintenance" description="Schedule downtime and staff notifications." />
        <p className="text-sm text-destructive">
          Could not load schedules. Apply migrations 023, 031, and 032 (group assignees) if needed. ({error.message})
        </p>
      </div>
    );
  }
  return (
    <div>
      <PageHeader
        title="Machine maintenance"
        description="Create windows for equipment downtime. Staff get topbar alerts from the remind time until the window ends; they can dismiss alerts for themselves only."
      />
      <MaintenanceClient initial={((data as unknown[]) || []).map(normalizeMaintenanceScheduleRow)} staff={staff || []} />
    </div>
  );
}
