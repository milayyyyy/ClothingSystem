import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SalaryClient } from "./salary-client";

export const dynamic = "force-dynamic";

export default async function AdminSalaryPage() {
  const supabase = createClient();
  const [{ data: employees }, { data: salaries }, { data: attendance }, { data: financeAccounts }] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "employee"),
    supabase
      .from("salaries")
      .select("*")
      .order("paid_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase.from("attendance").select("user_id, time_in, time_out, payroll_paid"),
    supabase.from("finance_accounts").select("id,name,kind,balance").order("name", { ascending: true }),
  ]);

  return (
    <div>
      <PageHeader
        title="Salary"
        description="Set pay types and rates; pick a payroll date range for salary from attendance and matching recorded payouts."
      />
      <SalaryClient
        employees={employees || []}
        salaries={salaries || []}
        attendance={attendance || []}
        financeAccounts={financeAccounts || []}
      />
    </div>
  );
}
