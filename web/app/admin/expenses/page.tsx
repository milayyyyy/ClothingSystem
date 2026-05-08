import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ExpensesClient } from "./expenses-client";

export const dynamic = "force-dynamic";

export default async function AdminExpensesPage() {
  const supabase = createClient();
  const { data } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false });
  return (
    <div>
      <PageHeader title="Expenses" description="Track operational spending" />
      <ExpensesClient initial={data || []} />
    </div>
  );
}
