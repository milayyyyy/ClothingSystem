import type { SupabaseClient } from "@supabase/supabase-js";

export function expenseIdFromFinanceTx(tx: {
  expense_id?: string | null;
  notes?: string | null;
}): string | null {
  if (tx.expense_id) return String(tx.expense_id);
  const m = String(tx.notes || "").match(
    /expense:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return m?.[1] ?? null;
}

export function expenseFinanceTxPayload(opts: {
  expenseId: string;
  expenseDate: string;
  category: string;
  description: string;
  amount: number;
  accountId: string | null;
}) {
  const descParts = [`Expense: ${opts.category}`];
  if (opts.description.trim()) descParts.push(opts.description.trim().slice(0, 120));
  const deduct = opts.amount > 0 && Boolean(opts.accountId);
  return {
    occurred_at: opts.expenseDate,
    account_id: deduct ? opts.accountId : null,
    direction: "out" as const,
    amount: deduct ? opts.amount : 0,
    description: descParts.join(" — "),
    notes: `expense:${opts.expenseId}`,
    expense_id: opts.expenseId,
  };
}

/** Update every money-flow row for this expense, or insert one if none exists. */
export async function syncFinanceTxFromExpense(
  supabase: SupabaseClient,
  opts: {
    expenseId: string;
    expenseDate: string;
    category: string;
    description: string;
    amount: number;
    accountId: string | null;
  },
): Promise<void> {
  const txBody = expenseFinanceTxPayload(opts);
  const { data: updated, error: upErr } = await supabase
    .from("finance_transactions")
    .update(txBody)
    .eq("expense_id", opts.expenseId)
    .select("id");
  if (upErr) throw new Error(upErr.message);
  if (updated && updated.length > 0) return;

  const { data: byNote } = await supabase
    .from("finance_transactions")
    .select("id")
    .eq("notes", `expense:${opts.expenseId}`);
  if (byNote && byNote.length > 0) {
    const { error } = await supabase
      .from("finance_transactions")
      .update(txBody)
      .in(
        "id",
        byNote.map((r) => r.id),
      );
    if (error) throw new Error(error.message);
    return;
  }

  const { error: insErr } = await supabase.from("finance_transactions").insert(txBody);
  if (insErr) throw new Error(insErr.message);
}

/** When money flow is edited, keep the linked expense (and salary payout) on the same amount/date/account. */
export async function syncExpenseFromFinanceTx(
  supabase: SupabaseClient,
  opts: {
    expenseId: string;
    amount: number;
    expenseDate: string;
    accountId: string | null;
    accountName?: string | null;
  },
): Promise<void> {
  const paidThrough = opts.amount > 0 && opts.accountId ? opts.accountName || null : null;
  const { error: exErr } = await supabase
    .from("expenses")
    .update({
      amount: opts.amount,
      expense_date: opts.expenseDate,
      finance_account_id: opts.accountId,
      paid_through: paidThrough,
    })
    .eq("id", opts.expenseId);
  if (exErr) throw new Error(exErr.message);

  const { data: sals, error: salErr } = await supabase
    .from("salaries")
    .select("id, deductions")
    .eq("expense_id", opts.expenseId);
  if (salErr) {
    if (!/expense_id/i.test(salErr.message)) throw new Error(salErr.message);
    return;
  }
  for (const s of sals || []) {
    const deductions = Number((s as { deductions?: number | null }).deductions || 0);
    const { error } = await supabase
      .from("salaries")
      .update({
        gross_pay: opts.amount,
        net_pay: Math.max(0, opts.amount - deductions),
        period_start: opts.expenseDate,
        period_end: opts.expenseDate,
      })
      .eq("id", (s as { id: string }).id);
    if (error) throw new Error(error.message);
  }
}
