import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EmployeesClient } from "./employees-client";

export const dynamic = "force-dynamic";

export default async function AdminEmployeesPage() {
  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  return (
    <div>
      <PageHeader title="Employees" description="Manage staff and roles" />
      <EmployeesClient initial={data || []} />
    </div>
  );
}
