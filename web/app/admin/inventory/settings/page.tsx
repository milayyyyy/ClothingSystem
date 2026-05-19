import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { canEdit, getPermissionsForRole } from "@/lib/role-permissions";
import { PageHeader } from "@/components/page-header";
import { InventorySettingsClient } from "./inventory-settings-client";

export const dynamic = "force-dynamic";

export default async function InventorySettingsPage() {
  const supabase = createClient();
  const user = await getSessionUser();
  if (user) {
    const perms = await getPermissionsForRole(supabase, user.profile.role);
    if (!canEdit(perms, "inventory")) redirect("/admin/inventory");
  }
  const [{ data: types, error: te }, { data: cats, error: ce }] = await Promise.all([
    supabase.from("inventory_type_options").select("id,name").order("name"),
    supabase.from("inventory_categories").select("id,name,slug,sort_order").order("sort_order").order("name"),
  ]);
  const typeErr = te?.message ?? "";
  const catErr = ce?.message ?? "";
  return (
    <div>
      <PageHeader
        title="Inventory categories & types"
        description="Manage filter tabs and saved type labels for stock items."
        action={
          <Link
            href="/admin/inventory"
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Back to inventory
          </Link>
        }
      />
      {(typeErr?.includes("inventory_type_options") || catErr?.includes("inventory_categories")) && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Apply migrations 034 (types) and 035 (categories), then reload.
        </p>
      )}
      <InventorySettingsClient initialTypes={types || []} initialCategories={cats || []} />
    </div>
  );
}
