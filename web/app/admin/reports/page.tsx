import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { fetchReportsRawData } from "@/lib/reports-fetch";
import { ReportsClient } from "./reports-client";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const supabase = createClient();
  const raw = await fetchReportsRawData(supabase);

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Financial overview — filter by date, view sales, expenses, payroll, and net profit."
      />
      <ReportsClient {...raw} />
    </div>
  );
}
