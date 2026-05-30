import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { canEdit, getPermissionsForRole } from "@/lib/role-permissions";
import { PageHeader } from "@/components/page-header";
import { AssetsClient } from "./assets-client";

export const dynamic = "force-dynamic";

export default async function InventoryAssetsPage() {
  const supabase = createClient();
  const user = await getSessionUser();
  const perms = user ? await getPermissionsForRole(supabase, user.profile.role) : null;
  const canEditInventory = perms ? canEdit(perms, "inventory") : false;

  const [{ data: assets }, { data: machineTypes }] = await Promise.all([
    supabase
      .from("inventory_assets")
      .select("*, machine_types(name)")
      .order("sort_order")
      .order("name"),
    supabase.from("machine_types").select("id,name,sort_order").order("sort_order").order("name"),
  ]);

  return (
    <div>
      <PageHeader
        title="Assets"
        description="Shop equipment — DTF printers, sublimation machines, heat presses, and other fixed assets."
      />
      <div className="mb-6 flex flex-wrap items-end justify-end gap-2">
        <Link
          href="/admin/inventory"
          className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Stock inventory
        </Link>
        <Link
          href="/admin/inventory/ready-made"
          className="inline-flex h-9 items-center justify-center rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-primary/10"
        >
          Ready made inventory
        </Link>
      </div>
      <AssetsClient
        initial={(assets || []) as never[]}
        machineTypes={(machineTypes || []) as never[]}
        canEdit={canEditInventory}
      />
    </div>
  );
}
