import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { normalizeSupplier } from "@/lib/supplier-categories";
import { SuppliersClient } from "./suppliers-client";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const supabase = createClient();
  const [{ data }, { data: categories }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("*, supplier_category_links(category_id)")
      .order("name"),
    supabase.from("supplier_categories").select("id,name,sort_order").order("sort_order").order("name"),
  ]);
  const suppliers = (data || []).map((row) => normalizeSupplier(row as Record<string, unknown>));
  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Vendor contacts by category, pricelist photos, and product price lines"
      />
      <SuppliersClient initial={suppliers} initialCategories={categories || []} />
    </div>
  );
}
