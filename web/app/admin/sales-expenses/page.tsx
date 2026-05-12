import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SalesExpensesHubOverview } from "@/components/sales-expenses-hub-overview";
import { TrendingUp, Receipt } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SalesExpensesHubPage() {
  const supabase = createClient();
  const [{ data: orders }, { data: expenses }] = await Promise.all([
    supabase.from("orders").select("*").order("created_at", { ascending: false }),
    supabase.from("expenses").select("expense_date,amount,category"),
  ]);
  const expenseRows = (expenses || []) as { expense_date: string; amount: number; category: string }[];

  return (
    <div className="space-y-10">
      <PageHeader
        title="Sales & expenses"
        description="Overview of this month, then open Sales or Expenses for full detail and entry."
      />

      <SalesExpensesHubOverview orders={orders || []} expenses={expenseRows} />

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">Navigate</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Link href="/admin/sales-expenses/sales" className="block rounded-lg transition-opacity hover:opacity-95">
            <Card className="h-full border-primary/20 bg-primary/[0.03] hover:border-primary/40">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <CardTitle>Sales</CardTitle>
                </div>
                <CardDescription>
                  Completed order revenue by channel, pending pipeline, and order lists.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-primary">Open Sales →</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/admin/sales-expenses/expenses" className="block rounded-lg transition-opacity hover:opacity-95">
            <Card className="h-full hover:border-muted-foreground/30">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-muted-foreground" />
                  <CardTitle>Expenses</CardTitle>
                </div>
                <CardDescription>Track spending, categories, suppliers, receipts, and paid-through methods.</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-primary">Open Expenses →</span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
