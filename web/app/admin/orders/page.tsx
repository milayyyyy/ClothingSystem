import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { OrdersClient } from "./orders-client";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const supabase = createClient();
  const [{ data: orders }, { data: employees }] = await Promise.all([
    supabase.from("orders").select("*, assigned:assigned_to(id, full_name, email)").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email, role").eq("role", "employee"),
  ]);
  return (
    <div>
      <PageHeader title="Orders" description="Manage customer print orders" />
      <OrdersClient initialOrders={orders || []} employees={employees || []} />
    </div>
  );
}
