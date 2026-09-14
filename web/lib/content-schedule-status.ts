import type { SupabaseClient } from "@supabase/supabase-js";

const DUE_STATUSES = ["scheduled", "draft"] as const;

/** Mark scheduled/draft posts as posted once their date & time has passed. */
export async function markDueContentPosted(supabase: SupabaseClient) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("content_schedules")
    .update({ status: "posted" })
    .in("status", [...DUE_STATUSES])
    .lte("scheduled_at", now)
    .select("id");
  return {
    ids: ((data ?? []) as { id: string }[]).map((row) => row.id),
    error,
  };
}
