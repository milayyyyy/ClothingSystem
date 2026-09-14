import type { SupabaseClient } from "@supabase/supabase-js";

const MS_PER_DAY = 86_400_000;
const MANILA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

function periodYmd(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

function manilaDayBoundsIso(startYmd: string, endYmd: string): { startIso: string; endIso: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)) return null;
  const [ys, ms, ds] = startYmd.split("-").map(Number);
  const [ye, me, de] = endYmd.split("-").map(Number);
  const startMs = Date.UTC(ys, ms - 1, ds) - MANILA_UTC_OFFSET_MS;
  const endMs = Date.UTC(ye, me - 1, de) - MANILA_UTC_OFFSET_MS + MS_PER_DAY - 1;
  return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
}

type SalaryPeriodRow = {
  user_id?: string | null;
  period_start?: unknown;
  period_end?: unknown;
};

async function clearAttendancePayrollPaid(supabase: SupabaseClient, rows: SalaryPeriodRow[]) {
  for (const row of rows) {
    const userId = row.user_id ? String(row.user_id) : "";
    const start = periodYmd(row.period_start);
    const end = periodYmd(row.period_end);
    const bounds = manilaDayBoundsIso(start, end);
    if (!userId || !bounds) continue;
    const { error } = await supabase
      .from("attendance")
      .update({ payroll_paid: false })
      .eq("user_id", userId)
      .gte("time_in", bounds.startIso)
      .lte("time_in", bounds.endIso);
    if (error) console.warn("Could not clear attendance payroll_paid:", error.message);
  }
}

/** Remove payroll rows tied to expenses so Recorded payroll and My Salary stay in sync. */
export async function deleteSalariesLinkedToExpenses(
  supabase: SupabaseClient,
  expenseIds: (string | null | undefined)[],
): Promise<{ error: string | null }> {
  const ids = [...new Set(expenseIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return { error: null };

  const { data, error: fetchErr } = await supabase
    .from("salaries")
    .select("user_id, period_start, period_end")
    .in("expense_id", ids);
  if (fetchErr) return { error: fetchErr.message };

  const { error: delErr } = await supabase.from("salaries").delete().in("expense_id", ids);
  if (delErr) return { error: delErr.message };

  await clearAttendancePayrollPaid(supabase, data || []);
  return { error: null };
}

/** Delete a recorded payroll row, its linked expense/finance (if any), and My Salary. */
export async function deleteRecordedPayrollRow(
  supabase: SupabaseClient,
  salary: {
    id: string;
    user_id?: string | null;
    period_start?: unknown;
    period_end?: unknown;
    expense_id?: string | null;
  },
): Promise<{ error: string | null }> {
  const { error: salErr } = await supabase.from("salaries").delete().eq("id", salary.id);
  if (salErr) return { error: salErr.message };

  if (salary.expense_id) {
    const { error: exErr } = await supabase.from("expenses").delete().eq("id", salary.expense_id);
    if (exErr) return { error: exErr.message };
  }

  await clearAttendancePayrollPaid(supabase, [salary]);
  return { error: null };
}
