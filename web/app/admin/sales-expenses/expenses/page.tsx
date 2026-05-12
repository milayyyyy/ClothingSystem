import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ExpensesClient } from "@/app/admin/expenses/expenses-client";

export const dynamic = "force-dynamic";

export default async function AdminExpensesSubPage() {
  const supabase = createClient();
  const [{ data: expenses }, { data: suppliers }, { data: financeAccounts }, { data: inventoryRows }, { data: employeeRows }] =
    await Promise.all([
      supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
      supabase.from("suppliers").select("id,name").order("name"),
      supabase.from("finance_accounts").select("id,name,kind").order("kind").order("name"),
      supabase.from("inventory").select("id,name,category,item_type,quantity,unit").order("name"),
      supabase
        .from("profiles")
        .select("id,full_name,email,role")
        .in("role", ["employee", "sub_admin"])
        .order("full_name", { ascending: true }),
    ]);
  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Log spending; amounts post as money out on the selected finance account (Finance page balances)."
      />
      <ExpensesClient
        initial={expenses || []}
        suppliers={suppliers || []}
        financeAccounts={(financeAccounts || []) as { id: string; name: string; kind: string }[]}
        inventoryItems={(inventoryRows || []) as { id: string; name: string; category: string | null; item_type: string | null; quantity: number | null; unit: string | null }[]}
        employees={(employeeRows || []) as { id: string; full_name: string | null; email: string; role: string }[]}
      />
    </div>
  );
}
