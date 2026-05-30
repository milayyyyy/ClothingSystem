"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadInventoryPageData } from "@/lib/load-inventory-page";
import { useClientPageData } from "@/lib/use-client-page-data";
import { PageLoading } from "@/components/page-loading";
import { useWorkspaceShell } from "@/components/workspace-shell-context";
import { InventoryClient } from "./inventory-client";

export function InventoryPageContent() {
  const { role } = useWorkspaceShell();
  const supabase = createClient();
  const { data, loading, error } = useClientPageData({
    cacheKey: "page:admin-inventory",
    load: () => loadInventoryPageData(supabase, role),
  });

  if (loading && !data) return <PageLoading />;
  if (error && !data) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!data) return <PageLoading />;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-end gap-2">
        {data.canEdit && (
          <Link
            href="/admin/inventory/settings"
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Categories & types
          </Link>
        )}
        {data.canViewReadyMade && (
          <Link
            href="/admin/inventory/ready-made"
            className="inline-flex h-9 items-center justify-center rounded-md border border-primary/30 bg-primary/5 px-3 text-sm font-medium text-primary shadow-sm transition-colors hover:bg-primary/10"
          >
            Ready made inventory
          </Link>
        )}
        <Link
          href="/admin/inventory/assets"
          className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Assets
        </Link>
        {data.canViewStores && (
          <Link
            href="/admin/stores"
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Stores
          </Link>
        )}
      </div>
      <InventoryClient
        initial={data.items as never[]}
        initialCategories={data.categories}
        initialTypePresets={data.typePresets}
        canEdit={data.canEdit}
      />
    </>
  );
}
