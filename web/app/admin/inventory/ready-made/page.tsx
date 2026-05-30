import Link from "next/link";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { canEdit, getPermissionsForRole } from "@/lib/role-permissions";
import { PageHeader } from "@/components/page-header";
import { InventoryFullStockExportButton } from "@/components/inventory-full-stock-export-button";
import { ReadyMadeInventoryClient } from "./ready-made-inventory-client";

export const dynamic = "force-dynamic";

export default async function ReadyMadeInventoryPage() {
  const supabase = createClient();
  const user = await getSessionUser();
  const perms = user ? await getPermissionsForRole(supabase, user.profile.role) : null;
  const canEditReadyMade = perms ? canEdit(perms, "ready_made") : false;
  return (
    <div>
      <PageHeader
        title="Ready made inventory"
        description="Spreadsheet-style sheets in named groups: organize sheets, then edit grids with row labels, column headers, and cells."
        action={
          <div className="flex flex-wrap gap-2">
            <InventoryFullStockExportButton compact />
            <Link
              href="/admin/inventory/assets"
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Assets
            </Link>
            <Link
              href="/admin/inventory"
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Stock inventory
            </Link>
          </div>
        }
      />
      <ReadyMadeInventoryClient canEdit={canEditReadyMade} />
    </div>
  );
}
