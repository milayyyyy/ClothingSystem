"use client";

import { createClient } from "@/lib/supabase/client";
import { loadOrdersPageData } from "@/lib/load-orders-page";
import { useClientPageData } from "@/lib/use-client-page-data";
import { useWorkspaceShell } from "@/components/workspace-shell-context";
import { PageLoading } from "@/components/page-loading";
import { OrdersClient } from "./orders-client";

export function OrdersPageContent() {
  const { role } = useWorkspaceShell();
  const supabase = createClient();
  const { data, loading, error } = useClientPageData({
    cacheKey: "page:admin-orders",
    load: () => loadOrdersPageData(supabase, role),
  });

  if (loading && !data) return <PageLoading />;
  if (error && !data) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!data) return <PageLoading />;

  return (
    <OrdersClient
      initialOrders={data.orders as never[]}
      employees={data.employees}
      canCreate={data.canCreate}
    />
  );
}
