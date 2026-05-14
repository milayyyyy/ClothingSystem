import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ADMIN_ORDERS_SELECT } from "@/lib/admin-orders-select";
import { OrdersClient } from "./orders-client";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const supabase = createClient();
  const [{ data: orders }, { data: employees }, user] = await Promise.all([
    supabase.from("orders").select(ADMIN_ORDERS_SELECT).order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["employee", "sub_admin"]),
    getSessionUser(),
  ]);
  const canCreate = user?.profile?.role === "admin" || user?.profile?.role === "sub_admin";
  return (
    <div>
      <PageHeader
        title="Orders"
        description="Manage customer print orders. Walk In & Online lists walk-in (in-store) and Facebook marketplace or Page orders. Shopee / TikTok / Lazada pick lists belong on BigSeller."
        action={
          <div className="flex gap-2">
            <Link href="/admin/orders/bigseller" className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
              BigSeller page
            </Link>
            <Link href="/admin/stores" className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
              Stores & channels
            </Link>
          </div>
        }
      />
      <OrdersClient initialOrders={orders || []} employees={employees || []} canCreate={canCreate} />
    </div>
  );
}
