import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { AdminSalesBlock } from "@/components/admin-sales-block";
import { SalesMonthOverviewCards } from "@/components/sales-month-overview-cards";

export const dynamic = "force-dynamic";

export default async function AdminSalesSubPage() {
  const supabase = createClient();
  const { data: orders } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales"
        description="Completed orders (ready + delivered) and pending pipeline."
        action={
          <Link
            href="/admin/sales-expenses/sales/list"
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Sales list
          </Link>
        }
      />
      <SalesMonthOverviewCards orders={orders || []} />
      <AdminSalesBlock orders={orders || []} compactHeader />
    </div>
  );
}
