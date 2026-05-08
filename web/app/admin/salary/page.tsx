import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SalaryClient } from "./salary-client";

export const dynamic = "force-dynamic";

export default async function AdminSalaryPage() {
  const supabase = createClient();
  const [{ data: employees }, { data: salaries }, { data: attendance }] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "employee"),
    supabase.from("salaries").select("*").order("created_at", { ascending: false }),
    supabase.from("attendance").select("user_id, time_in, time_out"),
  ]);

  return (
    <div>
      <PageHeader title="Salary" description="Compute and record payroll" />
      <SalaryClient employees={employees || []} salaries={salaries || []} attendance={attendance || []} />
    </div>
  );
}
