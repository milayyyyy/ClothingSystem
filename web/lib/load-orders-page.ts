import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_ORDERS_SELECT } from "@/lib/admin-orders-select";

export type OrdersPageData = {
  orders: unknown[];
  employees: { id: string; full_name: string; email: string }[];
  canCreate: boolean;
};

export async function loadOrdersPageData(
  supabase: SupabaseClient,
  role: string | undefined,
): Promise<OrdersPageData> {
  const [{ data: orders }, { data: employees }] = await Promise.all([
    supabase.from("orders").select(ADMIN_ORDERS_SELECT).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["employee", "manager"]),
  ]);
  const canCreate = role === "admin" || role === "manager";
  return {
    orders: orders || [],
    employees: (employees || []) as OrdersPageData["employees"],
    canCreate,
  };
}
