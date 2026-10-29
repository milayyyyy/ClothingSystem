import type { SupabaseClient } from "@supabase/supabase-js";
import { isUncollectedGoodwillFinanceTx } from "@/lib/order-balance";
import { inLocalDateRange, localDateKeyFromIso } from "@/lib/sales-list";

export type FinanceAccountExport = {
  id: string;
  name: string;
  kind: string;
  balance: number;
  description?: string | null;
  notes?: string | null;
  opening_balance?: number | null;
  account_name?: string | null;
  account_number?: string | null;
};

export type FinanceTxExport = {
  id: string;
  occurred_at: string;
  account_id: string | null;
  direction: string;
  amount: number;
  description?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
};

function personLabel(p: { full_name?: string | null; email?: string | null } | null | undefined): string {
  if (!p) return "";
  return String(p.full_name || p.email || "").trim();
}

function escapeCsv(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(escapeCsv).join(",");
}

export function labelFinanceKind(kind: string): string {
  if (kind === "bank") return "Bank";
  if (kind === "ewallet") return "E-wallet";
  if (kind === "cash") return "Cash";
  return kind || "—";
}

/** Running balance after each transaction (opening + all prior in/out through that row). */
export function balanceAfterByTransactionId(
  accounts: FinanceAccountExport[],
  transactions: FinanceTxExport[],
): Map<string, number> {
  const running = new Map<string, number>();
  for (const a of accounts) {
    running.set(a.id, Number(a.opening_balance ?? 0));
  }

  const sorted = [...transactions].sort((a, b) => {
    const d = String(a.occurred_at).localeCompare(String(b.occurred_at));
    if (d !== 0) return d;
    const c = String(a.created_at || "").localeCompare(String(b.created_at || ""));
    if (c !== 0) return c;
    return String(a.id).localeCompare(String(b.id));
  });

  const balanceAfter = new Map<string, number>();
  for (const tx of sorted) {
    if (!tx.account_id) continue;
    const cur = running.get(tx.account_id) ?? 0;
    const amt = Number(tx.amount || 0);
    const next = tx.direction === "out" ? cur - amt : cur + amt;
    running.set(tx.account_id, next);
    balanceAfter.set(tx.id, next);
  }
  return balanceAfter;
}

export function buildFinanceMergedCsv(
  accounts: FinanceAccountExport[],
  transactions: FinanceTxExport[],
  balanceAfter: Map<string, number>,
): string {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const lines: string[] = [];

  lines.push("[Accounts]");
  lines.push(
    csvRow(["Type", "Name", "Account Name", "Account Number", "Current Balance", "Description"]),
  );
  for (const a of accounts) {
    lines.push(
      csvRow([
        labelFinanceKind(a.kind),
        a.name,
        a.account_name ?? "",
        a.account_number ?? "",
        Number(a.balance || 0),
        a.description ?? a.notes ?? "",
      ]),
    );
  }

  lines.push("");
  lines.push("[Money flow (in / out)]");
  lines.push(
    csvRow([
      "Date",
      "Account",
      "Account Type",
      "Direction",
      "Money In",
      "Money Out",
      "Account Balance",
      "Description",
      "Made by",
      "Recorded",
    ]),
  );

  const flowSorted = [...transactions].sort((a, b) => {
    const d = String(a.occurred_at).localeCompare(String(b.occurred_at));
    if (d !== 0) return d;
    const c = String(a.created_at || "").localeCompare(String(b.created_at || ""));
    if (c !== 0) return c;
    return String(a.id).localeCompare(String(b.id));
  });

  for (const t of flowSorted) {
    const unassigned = !t.account_id;
    const goodwill = unassigned && isUncollectedGoodwillFinanceTx(undefined, t.description);
    const a = t.account_id ? byId.get(t.account_id) : undefined;
    const dir = t.direction === "out" ? "out" : "in";
    const amt = Number(t.amount || 0);
    lines.push(
      csvRow([
        t.occurred_at,
        goodwill ? "Uncollected / Goodwill" : unassigned ? "None" : a?.name ?? "",
        unassigned ? "" : labelFinanceKind(a?.kind ?? ""),
        unassigned ? "" : dir === "in" ? "In" : "Out",
        !unassigned && dir === "in" ? amt : "",
        !unassigned && dir === "out" ? amt : "",
        unassigned ? "" : balanceAfter.get(t.id) ?? "",
        t.description ?? "",
        t.created_by_name ?? "",
        t.created_at ? String(t.created_at).slice(0, 10) : "",
      ]),
    );
  }

  return lines.join("\n");
}

export async function fetchFinanceMergedCsv(
  supabase: SupabaseClient,
  from: string | null,
  to: string | null,
): Promise<{ csv: string; accountCount: number; txCount: number }> {
  const [{ data: accounts, error: accErr }, { data: allTxs, error: txErr }] = await Promise.all([
    supabase
      .from("finance_accounts")
      .select("id,name,kind,balance,description,notes,opening_balance,account_name,account_number")
      .order("kind", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("finance_transactions")
      .select("id,occurred_at,account_id,direction,amount,description,created_at,created_by,creator:created_by(full_name,email)")
      .order("occurred_at", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (accErr) throw new Error(accErr.message);
  let txRows = allTxs as Record<string, unknown>[] | null;
  let txLoadErr = txErr;
  if (txLoadErr && /created_by/i.test(txLoadErr.message)) {
    const retry = await supabase
      .from("finance_transactions")
      .select("id,occurred_at,account_id,direction,amount,description,created_at")
      .order("occurred_at", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    txRows = (retry.data || null) as Record<string, unknown>[] | null;
    txLoadErr = retry.error;
  }
  if (txLoadErr) throw new Error(txLoadErr.message);

  const accountRows = (accounts || []) as FinanceAccountExport[];
  const allTransactions: FinanceTxExport[] = ((txRows || []) as Record<string, unknown>[]).map((t) => {
    const creator = t.creator as { full_name?: string | null; email?: string | null } | null;
    return {
      id: String(t.id || ""),
      occurred_at: String(t.occurred_at || ""),
      account_id: (t.account_id as string | null) ?? null,
      direction: String(t.direction || "in"),
      amount: Number(t.amount || 0),
      description: (t.description as string | null) ?? null,
      created_at: t.created_at == null ? null : String(t.created_at),
      created_by: t.created_by == null ? null : String(t.created_by),
      created_by_name: personLabel(creator) || null,
    };
  });

  const missingIds = allTransactions.filter((t) => !t.created_by_name).map((t) => t.id);
  if (missingIds.length > 0) {
    const names = new Map<string, string>();
    const chunk = 200;
    for (let i = 0; i < missingIds.length; i += chunk) {
      const slice = missingIds.slice(i, i + chunk);
      const { data: logs } = await supabase
        .from("activity_logs")
        .select("entity_id, action, created_at, actor:actor_id(full_name,email)")
        .eq("entity", "finance_transactions")
        .in("entity_id", slice)
        .order("created_at", { ascending: true });
      for (const log of (logs || []) as Record<string, unknown>[]) {
        const id = String(log.entity_id || "");
        if (!id || names.has(id)) continue;
        const label = personLabel(log.actor as { full_name?: string | null; email?: string | null } | null);
        if (label) names.set(id, label);
      }
    }
    for (const t of allTransactions) {
      if (!t.created_by_name && names.has(t.id)) t.created_by_name = names.get(t.id) || null;
    }
  }
  const balanceAfter = balanceAfterByTransactionId(accountRows, allTransactions);

  let filtered = allTransactions;
  if (from || to) {
    filtered = filtered.filter((t) => inLocalDateRange(localDateKeyFromIso(t.occurred_at), from || "", to || ""));
  }

  const csv = buildFinanceMergedCsv(accountRows, filtered, balanceAfter);
  return { csv, accountCount: accountRows.length, txCount: filtered.length };
}
