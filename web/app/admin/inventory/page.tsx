import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { InventoryClient, type InventoryCategoryRow } from "./inventory-client";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const supabase = createClient();
  const [{ data }, { data: categories }, { data: typeOpts }] = await Promise.all([
    supabase.from("inventory").select("*").order("name"),
    supabase.from("inventory_categories").select("id,name,slug,sort_order").order("sort_order").order("name"),
    supabase.from("inventory_type_options").select("name").order("name"),
  ]);
  const initialTypePresets = ((typeOpts as { name: string }[] | null) || []).map((r) => r.name).filter(Boolean);
  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock levels and replenishment"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/inventory/settings"
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Categories & types
            </Link>
            <Link
              href="/admin/inventory/ready-made"
              className="inline-flex h-9 items-center justify-center rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-primary/10"
            >
              Ready made inventory
            </Link>
            <Link
              href="/admin/stores"
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Stores
            </Link>
          </div>
        }
      />
      <InventoryClient
        initial={data || []}
        initialCategories={(categories as InventoryCategoryRow[]) || []}
        initialTypePresets={initialTypePresets}
        canEdit
      />
    </div>
  );
}
