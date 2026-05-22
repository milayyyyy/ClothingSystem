import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SalesListClient } from "./sales-list-client";

export const dynamic = "force-dynamic";

export default async function AdminSalesListPage() {
  const supabase = createClient();
  const [{ data: orders }, { data: manualSales, error: manualError }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_no, customer_name, kind, order_type, source, notes, design_ref, status, stage, total, down_payment, waybill_no, external_order_no, sku_code, return_status, updated_at, created_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("manual_sales")
      .select("id, sale_date, amount, description, channel, revenue_channel, product_service, notes, import_key")
      .order("sale_date", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales list"
        description="Completed orders, down payments, and imported bookkeeping revenue. BigSeller stays on its own page."
        action={
          <Link
            href="/admin/sales-expenses/sales"
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            ← Sales overview
          </Link>
        }
      />
      {manualError?.message?.includes("manual_sales") && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Apply migration 082 (manual_sales revenue fields), then reload.
        </p>
      )}
      <SalesListClient orders={orders || []} initialManualSales={manualSales || []} />
    </div>
  );
}
