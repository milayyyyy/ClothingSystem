import { createClient } from "@/lib/supabase/server";
import { PROFILE_LIST_SELECT } from "@/lib/profile-select";
import { OPERATOR_PAYROLL_ROLES } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { SalaryClient } from "./salary-client";

export const dynamic = "force-dynamic";

export default async function AdminSalaryPage() {
  const supabase = createClient();
  const [{ data: employees }, { data: salaries }, { data: attendance }, { data: financeAccounts }, { data: onCallStaff }] =
    await Promise.all([
      supabase.from("profiles").select(PROFILE_LIST_SELECT).in("role", [...OPERATOR_PAYROLL_ROLES]),
      supabase
        .from("salaries")
        .select("*, profile:user_id(full_name,email), oncall:on_call_staff_id(full_name), expense:expense_id(description)")
        .order("paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase.from("attendance").select("user_id, time_in, time_out, payroll_paid"),
      supabase.from("finance_accounts").select("id,name,kind,balance").order("name", { ascending: true }),
      supabase.from("on_call_staff").select("id,full_name").order("full_name"),
    ]);

  return (
    <div>
      <PageHeader
        title="Salary"
        description="Set pay types and rates. Recorded payroll includes attendance pays and employee-salary expenses in the selected range."
      />
      <SalaryClient
        employees={employees || []}
        salaries={salaries || []}
        attendance={attendance || []}
        financeAccounts={financeAccounts || []}
        onCallStaff={onCallStaff || []}
      />
    </div>
  );
}
