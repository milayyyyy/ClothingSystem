import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmployeesClient } from "./employees-client";

export const dynamic = "force-dynamic";

export default async function AdminEmployeesPage() {
  const supabase = createClient();
  const [{ data: profiles }, onCallRes] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("on_call_staff").select("*").order("full_name", { ascending: true }),
  ]);
  const onCall = onCallRes.error ? [] : onCallRes.data || [];

  const permanent = (profiles || []).filter(
    (p) => String((p as { employment_category?: string }).employment_category || "permanent") !== "on_call",
  );

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Permanent staff with login accounts, and on-call contacts (no app access)"
      />
      <EmployeesClient initialPermanent={permanent} initialOnCall={onCall || []} />
    </div>
  );
}
