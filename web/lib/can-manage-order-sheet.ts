import type { SupabaseClient } from "@supabase/supabase-js";
import { getPermissionsForRole } from "@/lib/role-permissions";

export async function canManageOrderSheet(
  supabase: SupabaseClient,
  userId: string,
  profileRole: string,
  orderId: string,
): Promise<boolean> {
  if (profileRole === "admin" || profileRole === "sub_admin") return true;

  const perms = await getPermissionsForRole(supabase, profileRole);
  if (perms.all || perms.orders?.edit) return true;

  const { data: assignedLegacy } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .eq("assigned_to", userId)
    .maybeSingle();
  if (assignedLegacy) return true;

  const { data: assignee } = await supabase
    .from("order_assignees")
    .select("order_id")
    .eq("order_id", orderId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!assignee;
}
