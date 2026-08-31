import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ExpensesClient } from "@/app/admin/expenses/expenses-client";

export const dynamic = "force-dynamic";

export default async function AdminExpensesSubPage() {
  const supabase = createClient();
  const [
    { data: expenses },
    { data: suppliers },
    { data: financeAccounts },
    { data: inventoryRows },
    { data: employeeRows },
    { data: onCallRows },
    { data: expenseCategories, error: categoriesError },
  ] = await Promise.all([
    supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
    supabase.from("suppliers").select("id,name").order("name"),
    supabase.from("finance_accounts").select("id,name,kind").order("kind").order("name"),
    supabase.from("inventory").select("id,name,category,item_type,quantity,unit").order("name"),
    supabase
      .from("profiles")
      .select("id,full_name,email,role,employment_category")
      .in("role", ["employee", "manager"])
      .order("full_name", { ascending: true }),
    supabase
      .from("on_call_staff")
      .select("id,full_name,position,active")
      .eq("active", true)
      .order("full_name", { ascending: true }),
    supabase.from("expense_categories").select("id,name,sort_order").order("sort_order").order("name"),
  ]);

  const employeePicker = [
    ...(employeeRows || []).map((p) => ({
      picker_id: `profile:${p.id}`,
      kind: "profile" as const,
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      role: p.role,
      employment_category: (p as { employment_category?: string }).employment_category ?? null,
    })),
    ...(onCallRows || []).map((o) => ({
      picker_id: `oncall:${o.id}`,
      kind: "on_call" as const,
      id: o.id,
      full_name: o.full_name,
      email: null as string | null,
      role: "On call",
      position: (o as { position?: string | null }).position ?? null,
    })),
  ].sort((a, b) => {
    const na = (a.full_name || a.email || "").toLowerCase();
    const nb = (b.full_name || b.email || "").toLowerCase();
    return na.localeCompare(nb);
  });
  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Log spending; amounts post as money out on the selected finance account (Finance page balances)."
      />
      {categoriesError?.message?.includes("expense_categories") && (
        <p className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Apply migration 081 (expense_categories), then reload.
        </p>
      )}
      <ExpensesClient
        initial={expenses || []}
        initialCategories={(expenseCategories || []) as { id: string; name: string; sort_order: number }[]}
        suppliers={suppliers || []}
        financeAccounts={(financeAccounts || []) as { id: string; name: string; kind: string }[]}
        inventoryItems={(inventoryRows || []) as { id: string; name: string; category: string | null; item_type: string | null; quantity: number | null; unit: string | null }[]}
        employees={employeePicker}
      />
    </div>
  );
}
