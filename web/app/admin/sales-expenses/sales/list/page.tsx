import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SalesListClient } from "./sales-list-client";

export const dynamic = "force-dynamic";

export default async function AdminSalesListPage() {
  const supabase = createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_no, customer_name, kind, order_type, source, notes, design_ref, status, stage, total, down_payment, waybill_no, external_order_no, sku_code, return_status, updated_at, created_at")
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales list"
        description="Browse completed order revenue with date range and filters."
        action={
          <Link
            href="/admin/sales-expenses/sales"
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            ← Sales overview
          </Link>
        }
      />
      <SalesListClient orders={orders || []} />
    </div>
  );
}
