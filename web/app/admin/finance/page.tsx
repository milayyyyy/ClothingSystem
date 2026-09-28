import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { FinanceClient } from "./finance-client";

export const dynamic = "force-dynamic";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function parseFlowRange(searchParams?: { from?: string; to?: string; all?: string }) {
  const allTime = searchParams?.all === "1" || searchParams?.all === "true";
  let from = typeof searchParams?.from === "string" ? searchParams.from.trim().slice(0, 10) : "";
  let to = typeof searchParams?.to === "string" ? searchParams.to.trim().slice(0, 10) : "";
  if (from && !YMD.test(from)) from = "";
  if (to && !YMD.test(to)) to = "";
  if (from && to && from > to) {
    const swap = from;
    from = to;
    to = swap;
  }
  const valid = Boolean(!allTime && from && to);
  return { from, to, valid, allTime };
}

export default async function FinancePage({ searchParams }: { searchParams?: { from?: string; to?: string; all?: string } }) {
  const supabase = createClient();
  const { from: flowFrom, to: flowTo, valid: flowRangeActive, allTime: flowAllTime } = parseFlowRange(searchParams);

  // Fetch viewer role so the client can restrict balance editing to admins only
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const viewerRole = (profile?.role as string | null) ?? "employee";

  let txQuery = supabase
    .from("finance_transactions")
    .select("id,occurred_at,account_id,direction,amount,description,notes,expense_id,manual_sale_id,created_at");

  if (flowRangeActive || flowAllTime) {
    txQuery = txQuery
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
  } else {
    txQuery = txQuery
      .order("created_at", { ascending: false })
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false });
  }

  if (flowRangeActive) {
    txQuery = txQuery.gte("occurred_at", flowFrom).lte("occurred_at", flowTo).limit(2000);
  } else if (flowAllTime) {
    txQuery = txQuery.limit(5000);
  } else {
    txQuery = txQuery.limit(200);
  }

  let [{ data: accounts, error: accountsErr }, { data: txs, error: txErr }, { data: stores }] = await Promise.all([
    supabase
      .from("finance_accounts")
      .select("id,name,kind,balance,description,notes,opening_balance,account_name,account_number,qr_code_url,updated_at")
      .order("kind", { ascending: true })
      .order("name", { ascending: true }),
    txQuery,
    supabase.from("stores").select("id,name,shop_type").order("name", { ascending: true }),
  ]);

  if (txErr?.message && /manual_sale_id/i.test(txErr.message)) {
    let fallback = supabase
      .from("finance_transactions")
      .select("id,occurred_at,account_id,direction,amount,description,notes,expense_id,created_at");
    if (flowRangeActive || flowAllTime) {
      fallback = fallback
        .order("occurred_at", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });
    } else {
      fallback = fallback
        .order("created_at", { ascending: false })
        .order("occurred_at", { ascending: false })
        .order("id", { ascending: false });
    }
    if (flowRangeActive) {
      fallback = fallback.gte("occurred_at", flowFrom).lte("occurred_at", flowTo).limit(2000);
    } else if (flowAllTime) {
      fallback = fallback.limit(5000);
    } else {
      fallback = fallback.limit(200);
    }
    const retry = await fallback;
    txs = retry.data;
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

