import type { SupabaseClient } from "@supabase/supabase-js";

export type ActivityLogListRow = {
  id: string;
  action: string;
  entity: string;
  entity_id?: string | null;
  summary?: string | null;
  payload?: unknown;
  created_at: string;
  actor_id?: string | null;
  actor_role?: string | null;
  actor?: { full_name?: string | null; email?: string | null } | null;
};

type ProfileBrief = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

/** Fill actor name/role from profiles so admin rows still show if the embed join is empty. */
export async function attachActivityActors(
  supabase: SupabaseClient,
  logs: ActivityLogListRow[],
): Promise<ActivityLogListRow[]> {
  const ids = [...new Set(logs.map((l) => l.actor_id).filter((id): id is string => !!id))];
  if (!ids.length) return logs;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("id", ids);

  const map = new Map(((data || []) as ProfileBrief[]).map((p) => [p.id, p]));
  return logs.map((l) => {
    const p = l.actor_id ? map.get(l.actor_id) : undefined;
    if (!p) return l;
    return {
      ...l,
      actor_role: l.actor_role || p.role || null,
      actor: {
        full_name: p.full_name ?? l.actor?.full_name ?? null,
        email: p.email ?? l.actor?.email ?? null,
      },
    };
  });
}

export async function fetchActivityLogs(
  supabase: SupabaseClient,
  opts?: { fromIso?: string; toIsoExclusive?: string; limit?: number },
): Promise<ActivityLogListRow[]> {
  let q = supabase
    .from("activity_logs")
    .select("id, action, entity, entity_id, summary, payload, created_at, actor_id, actor_role")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 2000);
  if (opts?.fromIso) q = q.gte("created_at", opts.fromIso);
  if (opts?.toIsoExclusive) q = q.lt("created_at", opts.toIsoExclusive);
  const { data, error } = await q;
  if (error) throw error;
  return attachActivityActors(supabase, (data || []) as ActivityLogListRow[]);
}
