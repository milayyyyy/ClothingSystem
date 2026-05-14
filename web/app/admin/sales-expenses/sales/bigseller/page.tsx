import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { BigSellerSalesClient } from "./bigseller-sales-client";
import Link from "next/link";

export const dynamic = "force-dynamic";

function isBigSellerOrder(o: { source?: string | null; notes?: string | null; kind?: string; order_type?: string }) {
  const kind = String(o?.kind ?? o?.order_type ?? "").toLowerCase();
  if (kind !== "online") return false;
  const src = String(o?.source || "").toLowerCase();
  if (src.includes("bigseller")) return true;
  const notes = String(o?.notes || "").toLowerCase();
  if (notes.includes("imported from bigseller pdf")) return true;
  if (notes.includes("bigseller") && notes.includes("pdf") && notes.includes("import")) return true;
  return false;
}

export default async function BigSellerSalesPage() {
  const supabase = createClient();

  const [{ data: ordersRaw }, { data: accounts }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_no, customer_name, customer_social, external_order_no, waybill_no, sku_code, source, notes, kind, order_type, stage, status, total, down_payment, updated_at, created_at, store:stores(id,name)")
      .or("source.ilike.%bigseller%,notes.ilike.%bigseller%")
      .order("updated_at", { ascending: false }),
    supabase.from("finance_accounts").select("id, name, kind, balance").order("name"),
  ]);

  // Filter to completed BigSeller orders only, keep all for "all orders" view
  const orders = (ordersRaw || []).filter(isBigSellerOrder);

  return (
    <div>
      <PageHeader
        title="BigSeller Sales"
        description="Track marketplace withdrawals from Shopee, TikTok Shop, and other platforms."
        action={
          <Link
            href="/admin/sales-expenses/sales/list"
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            ← Sales list
          </Link>
        }
      />
      <BigSellerSalesClient orders={orders} financeAccounts={accounts || []} />
    </div>
  );
}
