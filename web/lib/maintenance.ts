import type { SupabaseClient } from "@supabase/supabase-js";

export type MaintenanceAssigneeRow = {
  user_id: string;
  profiles?: { full_name: string | null; email?: string | null } | null;
};

export type MaintenanceScheduleRow = {
  id: string;
  machine_name: string;
  title: string;
  description: string | null;
  instructions?: string | null;
  assignees?: MaintenanceAssigneeRow[] | null;
  starts_at: string;
  ends_at: string;
  remind_at: string;
  created_at?: string;
};

/** Shared list/alert projection (group assignees after migration 032). */
export const MAINTENANCE_SCHEDULE_SELECT =
  "id,machine_name,title,description,instructions,assignees:maintenance_schedule_assignees(user_id,profiles:user_id(full_name,email)),starts_at,ends_at,remind_at,created_at";

type RawProfile = { full_name?: string | null; email?: string | null } | null | undefined;

function flattenProfile(p: RawProfile | RawProfile[]): { full_name: string | null; email?: string | null } | null {
  if (!p) return null;
  const one = Array.isArray(p) ? p[0] : p;
  if (!one) return null;
  return { full_name: one.full_name ?? null, email: one.email ?? undefined };
}

/** Normalizes embedded `profiles` on each assignee row. */
export function normalizeMaintenanceScheduleRow(raw: unknown): MaintenanceScheduleRow {
  const r = raw as MaintenanceScheduleRow & { assignees?: MaintenanceAssigneeRow[] | null };
  const rawList = r.assignees;
  const assignees = Array.isArray(rawList)
    ? rawList.map((a) => ({
        user_id: a.user_id,
        profiles: flattenProfile(a.profiles as RawProfile | RawProfile[]),
      }))
    : [];
  return { ...(r as MaintenanceScheduleRow), assignees };
}

export function maintenanceAssigneeNames(row: MaintenanceScheduleRow): string {
  return (row.assignees || [])
    .map((a) => a.profiles?.full_name?.trim() || a.profiles?.email || "")
    .filter(Boolean)
    .join(", ");
}

/** Schedules that are in the “notification window” (remind time reached, window not ended). */
export async function fetchActiveMaintenanceAlerts(
  supabase: SupabaseClient,
  userId: string,
): Promise<MaintenanceScheduleRow[]> {
  const now = new Date().toISOString();
  const { data: schedules, error: se } = await supabase
    .from("maintenance_schedules")
    .select(MAINTENANCE_SCHEDULE_SELECT)
    .lte("remind_at", now)
    .gt("ends_at", now)
    .order("starts_at", { ascending: true });
  if (se || !schedules?.length) return [];

  const normalized = (schedules as unknown[]).map(normalizeMaintenanceScheduleRow);

  const { data: dismissals, error: de } = await supabase
    .from("maintenance_schedule_dismissals")
    .select("schedule_id")
    .eq("user_id", userId);
  if (de) return normalized;

  const dismissed = new Set((dismissals || []).map((d: { schedule_id: string }) => d.schedule_id));
  return normalized.filter((s) => !dismissed.has(s.id));
}

export async function dismissMaintenanceAlert(
  supabase: SupabaseClient,
  userId: string,
  scheduleId: string,
): Promise<void> {
  const { error } = await supabase.from("maintenance_schedule_dismissals").upsert(
    { user_id: userId, schedule_id: scheduleId, dismissed_at: new Date().toISOString() },
    { onConflict: "user_id,schedule_id" },
  );
  if (error) throw error;
}
