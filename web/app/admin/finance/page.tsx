import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { FinanceClient } from "./finance-client";

export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_SELECT_FULL =
  "id,name,kind,balance,description,notes,opening_balance,account_name,account_number,qr_code_url,updated_at";
const ACCOUNT_SELECT_BASE = "id,name,kind,balance,notes,updated_at";
const TX_SELECT_FULL =
  "id,occurred_at,account_id,direction,amount,description,notes,expense_id,manual_sale_id,created_at";
const TX_SELECT_BASE =
  "id,occurred_at,account_id,direction,amount,description,notes,expense_id,created_at";

function parseFlowRange(searchParams?: { from?: string; to?: string; all?: string }) {
  let from = typeof searchParams?.from === "string" ? searchParams.from.trim().slice(0, 10) : "";
  let to = typeof searchParams?.to === "string" ? searchParams.to.trim().slice(0, 10) : "";
  if (from && !YMD.test(from)) from = "";
  if (to && !YMD.test(to)) to = "";
  if (from && to && from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  const valid = Boolean(from && to);
  // No date params → show every money-flow row (not only this month).
  const allTime = !valid;
  return { from, to, valid, allTime };
}

export default async function FinancePage({ searchParams }: { searchParams?: { from?: string; to?: string; all?: string } }) {
  const supabase = createClient();
  const { from: flowFrom, to: flowTo, valid: flowRangeActive, allTime: flowAllTime } = parseFlowRange(searchParams);

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const viewerRole = (profile?.role as string | null) ?? "employee";

  function applyTxRange(q: any) {
    let next = q
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (flowRangeActive) {
      next = next.gte("occurred_at", flowFrom).lte("occurred_at", flowTo).limit(5000);
    } else {
      next = next.limit(5000);
    }
    return next;
  }

  const [accRes, txRes, storeRes] = await Promise.all([
    supabase
      .from("finance_accounts")
      .select(ACCOUNT_SELECT_FULL)
      .order("kind", { ascending: true })
      .order("name", { ascending: true }),
    applyTxRange(supabase.from("finance_transactions").select(TX_SELECT_FULL)),
    supabase.from("stores").select("id,name,shop_type").order("name", { ascending: true }),
  ]);

  let accounts: Record<string, unknown>[] | null = (accRes.data || null) as Record<string, unknown>[] | null;
  let accountsErr = accRes.error;
  let txs = txRes.data;
  let txErr = txRes.error;
  const stores = storeRes.data;

  if (accountsErr) {
    const retry = await supabase
      .from("finance_accounts")
      .select(ACCOUNT_SELECT_BASE)
      .order("kind", { ascending: true })
      .order("name", { ascending: true });
    if (!retry.error) {
      accounts = (retry.data || []) as Record<string, unknown>[];
      accountsErr = null;
    } else {
      accountsErr = retry.error;
    }
  }

  if (txErr) {
    const retry = await applyTxRange(supabase.from("finance_transactions").select(TX_SELECT_BASE));
    txs = retry.data
      ? retry.data.map((row: Record<string, unknown>) => ({ ...row, manual_sale_id: null }))
      : retry.data;
    txErr = retry.error;
  }

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
          stores={(stores || []) as { id: string; name: string; shop_type: string }[]}
          error={accountsErr?.message || txErr?.message || null}
          flowDateFrom={flowFrom}
          flowDateTo={flowTo}
          flowRangeActive={flowRangeActive}
          flowAllTime={flowAllTime}
          viewerRole={viewerRole}
        />
      </Suspense>
    </div>
  );
}
