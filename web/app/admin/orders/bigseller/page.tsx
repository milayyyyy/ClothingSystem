import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_ORDERS_SELECT } from "@/lib/admin-orders-select";
import { BIGSELLER_ORDERS_OR_FILTER } from "@/lib/bigseller-orders-query";
import { PageHeader } from "@/components/page-header";
import { OrdersClient } from "@/app/admin/orders/orders-client";

export const dynamic = "force-dynamic";

export default async function AdminBigSellerOrdersPage() {
  const supabase = createClient();
  const [{ data: orders }, { data: employees }] = await Promise.all([
    supabase
      .from("orders")
      .select(ADMIN_ORDERS_SELECT)
      .or(BIGSELLER_ORDERS_OR_FILTER)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["employee", "sub_admin"]),
  ]);

  return (
    <div>
      <PageHeader
        title="BigSeller orders"
        description="BigSeller PDF imports; filter by the PDF printed date and search including printed time."
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
      />
    </div>
  );
}

