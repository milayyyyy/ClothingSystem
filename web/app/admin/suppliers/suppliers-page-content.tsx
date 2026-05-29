"use client";

import { createClient } from "@/lib/supabase/client";
import { loadSuppliersPageData } from "@/lib/load-suppliers-page";
import { useClientPageData } from "@/lib/use-client-page-data";
import { PageLoading } from "@/components/page-loading";
import { SuppliersClient } from "./suppliers-client";

export function SuppliersPageContent() {
  const supabase = createClient();
  const { data, loading, error } = useClientPageData({
    cacheKey: "page:admin-suppliers",
    load: () => loadSuppliersPageData(supabase),
  });

  if (loading && !data) return <PageLoading />;
  if (error && !data) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!data) return <PageLoading />;

  return <SuppliersClient initial={data.suppliers} initialCategories={data.categories} />;
}
