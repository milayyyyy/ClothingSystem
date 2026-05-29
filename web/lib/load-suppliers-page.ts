import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSupplier } from "@/lib/supplier-categories";
import type { SupplierCategoryRow } from "@/app/admin/suppliers/supplier-categories-dialog";

export type SuppliersPageData = {
  suppliers: ReturnType<typeof normalizeSupplier>[];
  categories: SupplierCategoryRow[];
};

export async function loadSuppliersPageData(supabase: SupabaseClient): Promise<SuppliersPageData> {
  const [{ data }, { data: categories }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("*, supplier_category_links(category_id)")
      .order("name"),
    supabase.from("supplier_categories").select("id,name,sort_order").order("sort_order").order("name"),
  ]);
  const suppliers = (data || []).map((row) => normalizeSupplier(row as Record<string, unknown>));
  return {
    suppliers,
    categories: (categories as SupplierCategoryRow[]) || [],
  };
}
