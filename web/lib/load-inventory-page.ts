import type { SupabaseClient } from "@supabase/supabase-js";
import { canEdit, canView, getPermissionsForRole } from "@/lib/role-permissions";
import type { InventoryCategoryRow } from "@/app/admin/inventory/inventory-client";

export type InventoryPageData = {
  items: unknown[];
  categories: InventoryCategoryRow[];
  typePresets: string[];
  canEdit: boolean;
  canViewReadyMade: boolean;
  canViewStores: boolean;
};

export async function loadInventoryPageData(
  supabase: SupabaseClient,
  role: string | undefined,
): Promise<InventoryPageData> {
  const [{ data }, { data: categories }, { data: typeOpts }] = await Promise.all([
    supabase.from("inventory").select("*").order("name"),
    supabase.from("inventory_categories").select("id,name,slug,sort_order").order("sort_order").order("name"),
    supabase.from("inventory_type_options").select("name").order("name"),
  ]);
  const perms = role ? await getPermissionsForRole(supabase, role) : null;
  const initialTypePresets = ((typeOpts as { name: string }[] | null) || []).map((r) => r.name).filter(Boolean);
  return {
    items: data || [],
    categories: (categories as InventoryCategoryRow[]) || [],
    typePresets: initialTypePresets,
    canEdit: perms ? canEdit(perms, "inventory") : false,
    canViewReadyMade: perms ? canView(perms, "ready_made") : false,
    canViewStores: perms ? canView(perms, "stores") : false,
  };
}
