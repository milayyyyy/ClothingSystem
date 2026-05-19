import type { SupabaseClient } from "@supabase/supabase-js";

export type SupplierWithCategories = {
  id: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  google_maps_pin_url?: string | null;
  social_media_url?: string | null;
  notes?: string | null;
  pricelist_image_url?: string | null;
  category_ids: string[];
};

type RawSupplier = Record<string, unknown> & {
  supplier_category_links?: { category_id: string }[] | null;
};

export function normalizeSupplier(row: RawSupplier): SupplierWithCategories {
  const links = row.supplier_category_links ?? [];
  const { supplier_category_links: _links, category_id: _legacy, ...rest } = row;
  return {
    ...(rest as Omit<SupplierWithCategories, "category_ids">),
    category_ids: links.map((l) => l.category_id),
  };
}

export async function syncSupplierCategoryLinks(
  supabase: SupabaseClient,
  supplierId: string,
  categoryIds: string[],
) {
  const { error: delErr } = await supabase
    .from("supplier_category_links")
    .delete()
    .eq("supplier_id", supplierId);
  if (delErr) throw new Error(delErr.message);

  const unique = [...new Set(categoryIds.filter(Boolean))];
  if (unique.length === 0) return;

  const { error: insErr } = await supabase.from("supplier_category_links").insert(
    unique.map((category_id) => ({ supplier_id: supplierId, category_id })),
  );
  if (insErr) throw new Error(insErr.message);
}
