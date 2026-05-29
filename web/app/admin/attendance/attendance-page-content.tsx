"use client";

import { createClient } from "@/lib/supabase/client";
import { loadAttendancePageData } from "@/lib/load-attendance-page";
import { useClientPageData } from "@/lib/use-client-page-data";
import { PageLoading } from "@/components/page-loading";
import { AdminAttendanceClient } from "./attendance-client";

export function AttendancePageContent() {
  const supabase = createClient();
  const { data, loading, error } = useClientPageData({
    cacheKey: "page:admin-attendance",
    load: () => loadAttendancePageData(supabase),
  });

  if (loading && !data) return <PageLoading />;
  if (error && !data) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!data) return <PageLoading />;

  return (
    <AdminAttendanceClient
      initial={data.rows}
      employees={data.employees}
      initialClockMode={data.clockMode}
    />
  );
}
