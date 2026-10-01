import type { SupabaseClient } from "@supabase/supabase-js";
import { markReturnStatusChecked } from "@/lib/bigseller-return-excel";

export async function markOrdersReturnedToSeller(
  admin: SupabaseClient,
  orderIds: string[],
): Promise<{ error: string | null }> {
  const ids = [...new Set(orderIds.filter(Boolean))];
  const now = new Date().toISOString();
  for (const id of ids) {
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("id, return_import")
      .eq("id", id)
      .maybeSingle();
    if (orderErr) return { error: orderErr.message };
    if (!order) continue;
    const checkedImport = markReturnStatusChecked(order.return_import);
    const { error: moveErr } = await admin
      .from("orders")
      .update({
        return_status: "returned",
        updated_at: now,
        ...(checkedImport ? { return_import: checkedImport } : {}),
      })
      .eq("id", order.id);
    if (moveErr) return { error: moveErr.message };
  }
  return { error: null };
}
