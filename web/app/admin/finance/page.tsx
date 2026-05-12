import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { FinanceClient } from "./finance-client";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const supabase = createClient();
  const [{ data: accounts, error: accountsErr }, { data: txs, error: txErr }] = await Promise.all([
    supabase
      .from("finance_accounts")
      .select("id,name,kind,balance,description,notes,opening_balance,account_name,account_number,qr_code_url,updated_at")
      .order("kind", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("finance_transactions")
      .select("id,occurred_at,account_id,direction,amount,description,notes,created_at")
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Finance"
        description="Current balances across bank, e-wallet, and cash."
      />
      <FinanceClient
        accounts={(accounts || []) as any[]}
        transactions={(txs || []) as any[]}
        error={accountsErr?.message || txErr?.message || null}
      />
    </div>
  );
}

