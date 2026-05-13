import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { FinanceClient } from "./finance-client";

export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function parseFlowRange(searchParams?: { from?: string; to?: string }) {
  const from = typeof searchParams?.from === "string" ? searchParams.from.trim().slice(0, 10) : "";
  const to = typeof searchParams?.to === "string" ? searchParams.to.trim().slice(0, 10) : "";
  const valid = Boolean(from && to && YMD.test(from) && YMD.test(to) && from <= to);
  return { from, to, valid };
}

export default async function FinancePage({ searchParams }: { searchParams?: { from?: string; to?: string } }) {
  const supabase = createClient();
  const { from: flowFrom, to: flowTo, valid: flowRangeActive } = parseFlowRange(searchParams);

  let txQuery = supabase
    .from("finance_transactions")
    .select("id,occurred_at,account_id,direction,amount,description,notes,created_at")
    .order("created_at", { ascending: false })
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false });

  if (flowRangeActive) {
    txQuery = txQuery.gte("occurred_at", flowFrom).lte("occurred_at", flowTo).limit(500);
  } else {
    txQuery = txQuery.limit(200);
  }

  const [{ data: accounts, error: accountsErr }, { data: txs, error: txErr }] = await Promise.all([
    supabase
      .from("finance_accounts")
      .select("id,name,kind,balance,description,notes,opening_balance,account_name,account_number,qr_code_url,updated_at")
      .order("kind", { ascending: true })
      .order("name", { ascending: true }),
    txQuery,
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Finance"
        description="Current balances across bank, e-wallet, and cash."
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading finance…</p>}>
        <FinanceClient
          accounts={(accounts || []) as any[]}
          transactions={(txs || []) as any[]}
          error={accountsErr?.message || txErr?.message || null}
          flowDateFrom={flowFrom}
          flowDateTo={flowTo}
          flowRangeActive={flowRangeActive}
        />
      </Suspense>
    </div>
  );
}

