import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { ADMIN_ORDERS_SELECT } from "@/lib/admin-orders-select";
import { fetchAllBigSellerOrders } from "@/lib/bigseller-orders-query";
import { PageHeader } from "@/components/page-header";
import { OrdersClient } from "@/app/admin/orders/orders-client";

export const dynamic = "force-dynamic";

export default async function AdminBigSellerOrdersPage() {
  const supabase = createClient();
  const [{ data: orders, error: ordersError }, { data: employees }, user] = await Promise.all([
    fetchAllBigSellerOrders(supabase, ADMIN_ORDERS_SELECT),
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["employee", "sub_admin"]),
    getSessionUser(),
  ]);
  const canCreate = user?.profile?.role === "admin" || user?.profile?.role === "sub_admin";
  if (ordersError) {
    console.error("BigSeller orders load:", ordersError);
  }

  return (
    <div>
      <PageHeader
        title="BigSeller orders"
        description="BigSeller PDF or historical Excel imports; filter by printed date and search including printed time."
        action={
          <Link
            href="/admin/orders?type=walkin_online"
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Walk In & Online
          </Link>
        }
      />
      <OrdersClient
        initialOrders={orders || []}
        employees={employees || []}
        initialKind="online"
        hideKindTabs
        hideNewOrder
        canCreate={canCreate}
      />
    </div>
  );
}

