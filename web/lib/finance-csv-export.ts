import type { SupabaseClient } from "@supabase/supabase-js";

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
  account_id: string;
  direction: string;
  amount: number;
  description?: string | null;
  created_at?: string | null;
};

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
    const a = byId.get(t.account_id);
    const dir = t.direction === "out" ? "out" : "in";
    const amt = Number(t.amount || 0);
    lines.push(
      csvRow([
        t.occurred_at,
        a?.name ?? "",
        labelFinanceKind(a?.kind ?? ""),
        dir === "in" ? "In" : "Out",
        dir === "in" ? amt : "",
        dir === "out" ? amt : "",
        balanceAfter.get(t.id) ?? "",
        t.description ?? "",
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
      .select("id,occurred_at,account_id,direction,amount,description,created_at")
      .order("occurred_at", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (accErr) throw new Error(accErr.message);
  if (txErr) throw new Error(txErr.message);

  const accountRows = (accounts || []) as FinanceAccountExport[];
  const allTransactions = (allTxs || []) as FinanceTxExport[];
  const balanceAfter = balanceAfterByTransactionId(accountRows, allTransactions);

  let filtered = allTransactions;
  if (from) filtered = filtered.filter((t) => String(t.occurred_at) >= from);
  if (to) filtered = filtered.filter((t) => String(t.occurred_at) <= to);

  const csv = buildFinanceMergedCsv(accountRows, filtered, balanceAfter);
  return { csv, accountCount: accountRows.length, txCount: filtered.length };
}
