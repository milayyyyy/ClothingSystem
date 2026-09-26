import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ResellerNav } from "../reseller-nav";
import { ResellerProductsClient } from "./reseller-products-client";
import { asResellerProductList, resellerTableMissing } from "@/lib/reseller-products";
import { isResellerRole } from "@/lib/roles";
import { formatSupabaseError } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ResellerProductPage() {
  const supabase = createClient();
  const user = await getSessionUser();
  const resellerView = isResellerRole(user?.profile.role);
  const query = supabase.from("reseller_products").select("*").order("updated_at", { ascending: false });
  const { data, error } = resellerView ? await query.eq("status", "listed") : await query;
  const missing = error ? resellerTableMissing(formatSupabaseError(error)) : false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reseller Product"
        description={resellerView ? "Browse listed products and place an order." : "Add and manage products for resellers."}
      />
      <ResellerNav />
      <ResellerProductsClient initial={asResellerProductList(data)} tableMissing={missing} />
    </div>
  );
}
