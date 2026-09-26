import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ResellerNav } from "../reseller-nav";
import { ResellerOrdersClient } from "./reseller-orders-client";
import { asResellerProductList, resellerTableMissing } from "@/lib/reseller-products";
import { parseResellerOrder, resellerOrdersTableMissing } from "@/lib/reseller-orders";
import { isResellerRole } from "@/lib/roles";
import { formatSupabaseError } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ResellerOrderPage() {
  const supabase = createClient();
  const user = await getSessionUser();
  const [{ data: orderRows, error: orderErr }, { data: productRows, error: productErr }] = await Promise.all([
    supabase.from("reseller_orders").select("*, profiles!reseller_id(full_name,email)").order("created_at", { ascending: false }),
    supabase.from("reseller_products").select("*").order("name"),
  ]);
  const missing =
    (orderErr && resellerOrdersTableMissing(formatSupabaseError(orderErr))) ||
    (productErr && resellerTableMissing(formatSupabaseError(productErr)));
  const catalog = asResellerProductList(productRows).filter((p) => !isResellerRole(user?.profile.role) || p.status === "listed");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reseller Order"
        description={isResellerRole(user?.profile.role) ? "Place an order and track the list." : "Orders placed by reseller accounts."}
      />
      <ResellerNav />
      <ResellerOrdersClient
        initial={(orderRows || []).map((row) => parseResellerOrder(row as Record<string, unknown>))}
        products={catalog}
        tableMissing={Boolean(missing)}
      />
    </div>
  );
}
