"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { ChevronDown } from "lucide-react";
import { peso, formatDate, formatDateTime, cn } from "@/lib/utils";
import {
  allowanceBasisLabel,
  allowanceForPeriod,
  baseSalaryGross,
  hourlyGrossFromBuckets,
  hourlyPayBreakdown,
  periodCalendarDays,
  REGULAR_HOURS_BEFORE_OT_DEFAULT,
  salaryTypeLabel,
} from "@/lib/payroll";

const selectClass = cn(
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary",
);

const ALLOWANCE_BASIS_OPTIONS = ["none", "per_day", "per_week", "every_n_weeks", "monthly"] as const;

const MS_PER_DAY = 86400000;
const MANILA_TZ = "Asia/Manila";
/** Manila is UTC+8 year-round (no DST). Midnight Manila for civil y-m-d as UTC epoch ms. */
const MANILA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Today YYYY-MM-DD in Asia/Manila (Philippines). */
function phTodayYMD(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ymdToManilaMidnightUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return Date.now();
  return Date.UTC(y, m - 1, d, 0, 0, 0) - MANILA_UTC_OFFSET_MS;
}

function formatYMDInManila(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Default: end = PH today; start = 29 days earlier (30 inclusive calendar days, Manila). */
function defaultPayrollRange(): { start: string; end: string } {
  const end = phTodayYMD();
  const endMs = ymdToManilaMidnightUtcMs(end);
  const startMs = endMs - 29 * MS_PER_DAY;
  const start = formatYMDInManila(startMs);
  return { start, end };
}

function isValidYMD(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s).trim())) return false;
  const [y, m, day] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, day);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === day;
}

function startOfManilaDayFromYMD(ymd: string): Date {
  return new Date(ymdToManilaMidnightUtcMs(ymd));
}

/** Last instant (ms) of civil day ymd in Manila. */
function endOfManilaDayFromYMD(ymd: string): Date {
  return new Date(ymdToManilaMidnightUtcMs(ymd) + MS_PER_DAY - 1);
}

const PAYROLL_PERIOD_LS_KEY = "salary-admin-payroll-period-v1";

function loadStoredPayrollPeriod(): { start: string; end: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PAYROLL_PERIOD_LS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { start?: unknown; end?: unknown };
    const start = typeof o.start === "string" ? o.start.trim().slice(0, 10) : "";
    const end = typeof o.end === "string" ? o.end.trim().slice(0, 10) : "";
    if (!isValidYMD(start) || !isValidYMD(end) || start > end) return null;
    return { start, end };
  } catch {
    return null;
  }
}

/**
 * Normalize salaries.period_start / period_end from the DB (date or ISO string)
 * to YYYY-MM-DD in Asia/Manila so it matches the payroll range inputs.
 */
function salaryPeriodYMDFromDb(value: unknown): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return s.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

/** Treat as paid for UI (Postgres boolean / rare string serialization). */
function salaryRowIsPaid(s: { paid?: unknown }): boolean {
  const p = s.paid;
  if (p === true || p === 1) return true;
  if (typeof p === "string") return p.toLowerCase() === "true" || p === "t" || p === "1";
  return false;
}

export type FinanceAccountPick = { id: string; name: string; kind: string; balance?: number | string | null };

export type MonthPayPreviewRow = {
  id: string;
  name: string;
  email: string;
  type: string;
  days: number;
  rawH: number;
  paidH: number;
  regH: number;
  otH: number;
  base: number;
  allowance: number;
  total: number;
  /** Recorded row paid and no unpaid-in-preview amount left. */
  payrollPaid: "none" | "unpaid" | "paid" | "more_due";
  salaryRowId: string | null;
  existingExpenseId: string | null;
  /** From current salaries row — used when adding a second payout in the same month. */
  priorGrossPay: number;
  priorNetPay: number;
  priorDaysWorked: number;
  priorBonusAmount: number;
  /** Unpaid attendance days, or last recorded days when this period is fully settled (for display). */
  displayDays: number;
  /** Unpaid preview total, or last recorded net when this period is fully settled (for display). */
  displayTotal: number;
  /** Salary row is paid and current unpaid preview is zero — show recorded figures and allow bonus follow-up Pay. */
  settledSnapshot: boolean;
};

const SALARY_TYPE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "hourly", label: "Hourly" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "every_3_weeks", label: "Every 3 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "per_order", label: "Per order" },
] as const;

function formatFinanceAccountPick(a: FinanceAccountPick) {
  const k = String(a.kind || "").toLowerCase();
  const kind = k === "bank" ? "Bank" : k === "ewallet" ? "E-wallet" : "Cash";
  return `${a.name} (${kind})`;
}

function PayFromAttendanceDialog({
  open,
  onClose,
  row,
  financeAccounts,
  periodStartStr,
  periodEndStr,
  periodRangeLabel,
  periodStart,
  periodEnd,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  row: MonthPayPreviewRow | null;
  financeAccounts: FinanceAccountPick[];
  periodStartStr: string;
  periodEndStr: string;
  periodRangeLabel: string;
  periodStart: Date;
  periodEnd: Date;
  onPaid: (salaryRow: Record<string, unknown>) => void;
}) {
  const supabase = createClient();
  const [accountId, setAccountId] = useState("");
  const [bonus, setBonus] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccountId(financeAccounts[0]?.id || "");
    setBonus("0");
  }, [open, financeAccounts]);

  async function rollbackExpense(expenseId: string) {
    await supabase.from("finance_transactions").delete().eq("expense_id", expenseId);
    await supabase.from("expenses").delete().eq("id", expenseId);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    // Block duplicate Pay only when a row exists, is not marked paid, but already has an expense (odd state).
    if (row.existingExpenseId && row.payrollPaid === "unpaid") {
      alert("This payroll already has a linked expense. Review under Expenses or Finance.");
      return;
    }
    if (!accountId) {
      alert("Choose a finance account to deduct from.");
      return;
    }
    const bonusNum = Math.max(0, Math.round((Number(bonus) || 0) * 100) / 100);
    const payout = Math.round((row.total + bonusNum) * 100) / 100;
    if (payout <= 0) {
      alert("Total payout must be greater than zero.");
      return;
    }
    const isFollowUpInMonth =
      !!row.salaryRowId && (row.payrollPaid === "more_due" || row.payrollPaid === "paid");
    const cumulativeGross = isFollowUpInMonth
      ? Math.round((row.priorGrossPay + payout) * 100) / 100
      : payout;
    const cumulativeBonus = isFollowUpInMonth
      ? Math.round((row.priorBonusAmount + bonusNum) * 100) / 100
      : bonusNum;
    const cumulativeDays = isFollowUpInMonth ? row.priorDaysWorked + row.days : row.days;

    const account = financeAccounts.find((a) => a.id === accountId);
    const expenseId = crypto.randomUUID();
    const paidDateStr = phTodayYMD();

    setBusy(true);
    try {
      const notesLine = `payroll:${row.id}:${periodStartStr}:${periodEndStr}${isFollowUpInMonth ? ":additional" : ""}`;
      const { error: insEx } = await supabase.from("expenses").insert({
        id: expenseId,
        expense_date: paidDateStr,
        category: "Salary",
        description: row.name.trim() || row.email || "Employee",
        amount: payout,
        notes: notesLine,
        supplier_id: null,
        paid_through: account ? account.name : null,
        finance_account_id: accountId,
      });
      if (insEx) {
        alert(insEx.message);
        return;
      }

      const { error: insTx } = await supabase.from("finance_transactions").insert({
        occurred_at: paidDateStr,
        account_id: accountId,
        direction: "out",
        amount: payout,
        description: `Expense: Salary — ${row.name.trim() || row.email || "Employee"}`,
        notes: `expense:${expenseId}`,
        expense_id: expenseId,
      });
      if (insTx) {
        await rollbackExpense(expenseId);
        alert(insTx.message);
        return;
      }

      const salaryPayload = {
        user_id: row.id,
        period_start: periodStartStr,
        period_end: periodEndStr,
        days_worked: cumulativeDays,
        gross_pay: cumulativeGross,
        deductions: 0,
        net_pay: cumulativeGross,
        paid: true,
        paid_at: new Date().toISOString(),
        bonus_amount: cumulativeBonus,
        finance_account_id: accountId,
        expense_id: expenseId,
      };

      let saved: Record<string, unknown> | null = null;
      if (row.salaryRowId) {
        const { data, error: upErr } = await supabase
          .from("salaries")
          .update(salaryPayload)
          .eq("id", row.salaryRowId)
          .select()
          .single();
        if (upErr) {
          await rollbackExpense(expenseId);
          alert(upErr.message);
          return;
        }
        saved = data as Record<string, unknown>;
      } else {
        const { data, error: crErr } = await supabase.from("salaries").insert(salaryPayload).select().single();
        if (crErr) {
          await rollbackExpense(expenseId);
          alert(crErr.message);
          return;
        }
        saved = data as Record<string, unknown>;
      }

      {
        const t0 = periodStart.toISOString();
        const t1 = periodEnd.toISOString();
        const { error: attErr } = await supabase
          .from("attendance")
          .update({ payroll_paid: true })
          .eq("user_id", row.id)
          .gte("time_in", t0)
          .lte("time_in", t1);
        if (attErr) {
          alert(
            `Payroll was saved, but marking attendance as paid-in-payroll failed: ${attErr.message}. You can fix rows under Attendance or retry.`,
          );
        }
      }

      if (saved) onPaid(saved);
      onClose();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Payroll failed unexpectedly. Check the browser console.");
    } finally {
      setBusy(false);
    }
  }

  if (!row) return null;
  const bonusNum = Math.max(0, Math.round((Number(bonus) || 0) * 100) / 100);
  const payout = Math.round((row.total + bonusNum) * 100) / 100;
  const selectedAccount = financeAccounts.find((a) => a.id === accountId);
  const accountBalance = Math.round((Number(selectedAccount?.balance ?? 0) || 0) * 100) / 100;
  const balanceAfter = Math.round((accountBalance - payout) * 100) / 100;
  const balanceGoesNegative = accountId && payout > 0 && balanceAfter < 0;

  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title={`Pay ${row.name}`}
      description={`${periodRangeLabel} — deduct from finance and record a Salary expense (bonus optional).`}
      size="md"
    >
      <form onSubmit={(e) => void submit(e)} className="grid gap-3">
        {row.payrollPaid === "paid" && (
          <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
            This period is already <strong>settled in payroll</strong>. Add a <strong>bonus</strong> in the field below for an
            extra payout (Confirm pay). Unpaid base + allowance in this range is ₱0 until new attendance is added.
          </p>
        )}
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Base + allowance (unpaid in period)</span>
            <span className="font-medium">{peso(row.total)}</span>
          </div>
          {row.settledSnapshot && row.priorNetPay > 0 && (
            <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
              <span>Net last recorded (this period)</span>
              <span className="tabular-nums font-medium text-foreground">{peso(row.priorNetPay)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between text-base font-semibold">
            <span>Payout total</span>
            <span>{peso(payout)}</span>
          </div>
        </div>
        <div>
          <Label>Deduct from</Label>
          <select
            className={cn(selectClass, "mt-1")}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            required
          >
            {financeAccounts.length === 0 ? (
              <option value="">No finance accounts</option>
            ) : (
              financeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatFinanceAccountPick(a)}
                </option>
              ))
            )}
          </select>
          {financeAccounts.length === 0 && (
            <p className="mt-1 text-xs text-destructive">Add an account under Admin → Finance first.</p>
          )}
          {accountId && financeAccounts.length > 0 && (
            <div className="mt-2 rounded-md border bg-background/60 p-3 text-sm space-y-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Account balance</span>
                <span className="font-medium tabular-nums">{peso(accountBalance)}</span>
              </div>
              <div className="flex justify-between gap-2 text-muted-foreground">
                <span>− Payout</span>
                <span className="tabular-nums">{peso(payout)}</span>
              </div>
              <div className="flex justify-between gap-2 border-t border-border pt-1.5 font-medium">
                <span>Balance after</span>
                <span
                  className={cn(
                    "tabular-nums",
                    balanceGoesNegative && "text-amber-500 dark:text-amber-400",
                  )}
                >
                  {peso(balanceAfter)}
                </span>
              </div>
              {balanceGoesNegative && (
                <p className="text-xs text-muted-foreground pt-0.5 leading-relaxed">
                  Payout is larger than the current balance. Confirm pay is still allowed; Admin → Finance will show this
                  account&apos;s balance as negative until money is recorded in.
                </p>
              )}
            </div>
          )}
        </div>
        <div>
          <Label>Bonus (₱)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            className="mt-1 h-9"
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Added to base + allowance; one Salary expense is posted for the full payout. Unpaid time rows in{" "}
            <strong>{periodRangeLabel}</strong> for this employee are then marked <strong>paid in payroll</strong> so only new
            clock-ins in that period count as unpaid.
          </p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          After confirm, all attendance in <strong>{periodRangeLabel}</strong> for this person is flagged as settled. Add
          new time in/out under Attendance for any further unpaid hours in that same payroll period.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || financeAccounts.length === 0 || payout <= 0}>
            {busy ? "Saving…" : "Confirm pay"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function EmployeePayRow({ emp }: { emp: any }) {
  const supabase = createClient();
  const router = useRouter();
  const [salaryType, setSalaryType] = useState(String(emp.salary_type || "daily"));
  const [salaryRate, setSalaryRate] = useState(Number(emp.salary_rate ?? 0));
  const [allowanceBasis, setAllowanceBasis] = useState(String(emp.allowance_basis ?? "none"));
  const [allowanceAmount, setAllowanceAmount] = useState(Number(emp.allowance_amount ?? 0));
  const [breakMinutes, setBreakMinutes] = useState(Math.max(0, Math.floor(Number(emp.break_minutes ?? 0))));
  const [overtimeHourlyRate, setOvertimeHourlyRate] = useState(Number(emp.overtime_hourly_rate ?? 0));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSalaryType(String(emp.salary_type || "daily"));
    setSalaryRate(Number(emp.salary_rate ?? 0));
    setAllowanceBasis(String(emp.allowance_basis ?? "none"));
    setAllowanceAmount(Number(emp.allowance_amount ?? 0));
    setBreakMinutes(Math.max(0, Math.floor(Number(emp.break_minutes ?? 0))));
    setOvertimeHourlyRate(Number(emp.overtime_hourly_rate ?? 0));
  }, [emp.id, emp.salary_type, emp.salary_rate, emp.allowance_basis, emp.allowance_amount, emp.break_minutes, emp.overtime_hourly_rate]);

  const standardSalary = (SALARY_TYPE_OPTIONS as readonly { value: string }[]).some((o) => o.value === salaryType);

  async function savePay() {
    setSaving(true);
    const ab = allowanceBasis;
    const patch = {
      salary_type: salaryType,
      salary_rate: Number(salaryRate) || 0,
      allowance_basis: ab,
      allowance_amount: ab === "none" ? 0 : Math.max(0, Number(allowanceAmount)),
      allowance_weeks_n:
        ab === "every_n_weeks"
          ? Math.max(1, Math.floor(Number(emp.allowance_weeks_n) || 2))
          : null,
      break_minutes: Math.max(0, Math.floor(Number(breakMinutes) || 0)),
      overtime_hourly_rate: Math.max(0, Number(overtimeHourlyRate) || 0),
    };
    const { error } = await supabase.from("profiles").update(patch).eq("id", emp.id);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <tr className="border-t align-top">
      <td className="p-3">
        <div className="font-medium">{emp.full_name || "—"}</div>
        <div className="text-xs text-muted-foreground">{emp.email}</div>
      </td>
      <td className="p-2">
        <Label className="sr-only">Salary type for {emp.full_name || emp.email}</Label>
        <select className={selectClass} value={salaryType} onChange={(e) => setSalaryType(e.target.value)}>
          {SALARY_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {!standardSalary && salaryType && (
            <option value={salaryType}>{salaryTypeLabel(salaryType)} (legacy)</option>
          )}
        </select>
      </td>
      <td className="p-2">
        <Label className="sr-only">Rate</Label>
        <Input
          type="number"
          step="0.01"
          min={0}
          className="h-9"
          value={salaryRate}
          onChange={(e) => setSalaryRate(Number(e.target.value))}
        />
        <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
          {salaryType === "hourly" ? "Regular ₱/hr" : "₱ per day / period as per type"}
        </p>
      </td>
      <td className="p-2 align-top">
        <Label className="sr-only">Break minutes</Label>
        <Input
          type="number"
          min={0}
          step={1}
          className="h-9"
          value={Number.isFinite(breakMinutes) ? breakMinutes : 0}
          onChange={(e) => {
            const raw = e.target.value;
            setBreakMinutes(raw === "" ? 0 : Math.max(0, Math.floor(Number(raw)) || 0));
          }}
        />
        <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
          {salaryType === "hourly" ? "Unpaid break / day (min)" : "Used for Hourly only"}
        </p>
      </td>
      <td className="p-2 align-top">
        <Label className="sr-only">Overtime hourly rate</Label>
        <Input
          type="number"
          min={0}
          step="0.01"
          className="h-9"
          value={Number.isFinite(overtimeHourlyRate) ? overtimeHourlyRate : 0}
          onChange={(e) => {
            const raw = e.target.value;
            setOvertimeHourlyRate(raw === "" ? 0 : Math.max(0, Number(raw) || 0));
          }}
        />
        <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
          {salaryType === "hourly"
            ? `>${REGULAR_HOURS_BEFORE_OT_DEFAULT} paid hrs/day (₱/hr); 0 = same as regular`
            : "Used for Hourly only"}
        </p>
      </td>
      <td className="p-2">
        <Label className="sr-only">Allowance basis</Label>
        <select className={selectClass} value={allowanceBasis} onChange={(e) => setAllowanceBasis(e.target.value)}>
          {ALLOWANCE_BASIS_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {allowanceBasisLabel(v)}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <Label className="sr-only">Allowance amount</Label>
        <Input
          type="number"
          step="0.01"
          min={0}
          className="h-9"
          disabled={allowanceBasis === "none"}
          value={allowanceBasis === "none" ? 0 : allowanceAmount}
          onChange={(e) => setAllowanceAmount(Number(e.target.value))}
        />
      </td>
      <td className="p-2 text-right">
        <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => void savePay()}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </td>
    </tr>
  );
}

export function SalaryClient({
  employees,
  salaries,
  attendance,
  financeAccounts = [],
}: {
  employees: any[];
  salaries: any[];
  attendance: any[];
  financeAccounts?: FinanceAccountPick[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const [list, setList] = useState(salaries);
  const [liveAttendance, setLiveAttendance] = useState(attendance);
  const [loadingPeriod, setLoadingPeriod] = useState(false);
  const [payRow, setPayRow] = useState<MonthPayPreviewRow | null>(null);
  const [periodStartStr, setPeriodStartStr] = useState(() => {
    const stored = loadStoredPayrollPeriod();
    return stored?.start ?? defaultPayrollRange().start;
  });
  const [periodEndStr, setPeriodEndStr] = useState(() => {
    const stored = loadStoredPayrollPeriod();
    return stored?.end ?? defaultPayrollRange().end;
  });

  useEffect(() => {
    setList(salaries);
  }, [salaries]);

  useEffect(() => {
    setLiveAttendance(attendance);
  }, [attendance]);

  /** Re-fetch attendance and salaries from Supabase whenever the period changes. */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingPeriod(true);
      const [{ data: attData }, { data: salData }] = await Promise.all([
        supabase
          .from("attendance")
          .select("user_id, time_in, time_out, payroll_paid")
          .order("time_in", { ascending: false }),
        supabase
          .from("salaries")
          .select("*")
          .order("paid_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      if (attData) setLiveAttendance(attData);
      if (salData) setList(salData);
      setLoadingPeriod(false);
    }
    void load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodStartStr, periodEndStr]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PAYROLL_PERIOD_LS_KEY,
        JSON.stringify({ start: periodStartStr, end: periodEndStr }),
      );
    } catch {
      /* ignore */
    }
  }, [periodStartStr, periodEndStr]);

  useEffect(() => {
    setPayRow(null);
  }, [periodStartStr, periodEndStr]);

  const periodStart = useMemo(() => startOfManilaDayFromYMD(periodStartStr), [periodStartStr]);
  const periodEnd = useMemo(() => endOfManilaDayFromYMD(periodEndStr), [periodEndStr]);

  const periodDays = useMemo(() => periodCalendarDays(periodStartStr, periodEndStr), [periodStartStr, periodEndStr]);

  const periodRangeLabel = useMemo(
    () => `${formatDate(periodStartStr)} – ${formatDate(periodEndStr)}`,
    [periodStartStr, periodEndStr],
  );

  const onPayrollStartChange = (v: string) => {
    if (!isValidYMD(v)) return;
    setPeriodStartStr(v);
    setPeriodEndStr((prevEnd) => (v.localeCompare(prevEnd) > 0 ? v : prevEnd));
  };

  const onPayrollEndChange = (v: string) => {
    if (!isValidYMD(v)) return;
    setPeriodEndStr(v);
    setPeriodStartStr((prevStart) => (v.localeCompare(prevStart) < 0 ? v : prevStart));
  };

  /** Shifts not yet settled in payroll — preview counts these for the selected date range (inclusive). */
  const attendanceUnpaidInPeriod = useMemo(
    () =>
      liveAttendance.filter((a: { payroll_paid?: boolean | null; time_in: string }) => {
        if (a.payroll_paid === true) return false;
        const t = new Date(a.time_in);
        return t >= periodStart && t <= periodEnd;
      }),
    [liveAttendance, periodStart, periodEnd],
  );
  const previewRows = useMemo(() => {
    const distinctDays = (uid: string) =>
      new Set(
        attendanceUnpaidInPeriod
          .filter((a) => a.user_id === uid)
          .map((a) => new Date(a.time_in).toDateString()),
      ).size;
    return employees.map((e) => {
      const type = String(e.salary_type || "daily");
      const days = distinctDays(e.id);
      let base = 0;
      let paidH = 0;
      let rawH = 0;
      let regH = 0;
      let otH = 0;
      if (type === "hourly") {
        const br = hourlyPayBreakdown(
          attendanceUnpaidInPeriod,
          e.id,
          periodStart,
          periodEnd,
          Math.max(0, Math.floor(Number(e.break_minutes) || 0)),
        );
        rawH = br.rawHoursTotal;
        paidH = br.paidHoursTotal;
        regH = br.regularHours;
        otH = br.overtimeHours;
        base = hourlyGrossFromBuckets(
          br.regularHours,
          br.overtimeHours,
          Number(e.salary_rate),
          Number(e.overtime_hourly_rate),
        );
      } else {
        base = baseSalaryGross(type, Number(e.salary_rate), days, periodDays, 0);
      }
      const allowance = allowanceForPeriod(
        e.allowance_basis,
        Number(e.allowance_amount),
        e.allowance_weeks_n,
        days,
        periodDays,
      );
      const monthRow = list.find(
        (s) =>
          String(s.user_id) === String(e.id) &&
          salaryPeriodYMDFromDb(s.period_start) === periodStartStr &&
          salaryPeriodYMDFromDb(s.period_end) === periodEndStr,
      );
      const previewTotal = base + allowance;
      const hasMoreToPay = previewTotal > 1e-6;
      const salaryRecordPaid = monthRow ? salaryRowIsPaid(monthRow) : false;
      let payrollPaid: MonthPayPreviewRow["payrollPaid"];
      if (!monthRow) payrollPaid = "none";
      else if (salaryRecordPaid && !hasMoreToPay) payrollPaid = "paid";
      else if (salaryRecordPaid && hasMoreToPay) payrollPaid = "more_due";
      else payrollPaid = "unpaid";

      const priorGrossPay = Number(monthRow?.gross_pay ?? 0) || 0;
      const priorNetPay = Number(monthRow?.net_pay ?? 0) || 0;
      const priorDaysWorked = Math.max(0, Math.round(Number(monthRow?.days_worked ?? 0)));
      const priorBonusAmount = Number((monthRow as { bonus_amount?: number | null })?.bonus_amount ?? 0) || 0;
      const settledSnapshot = salaryRecordPaid && previewTotal <= 1e-6;
      const displayDays = settledSnapshot && days === 0 && priorDaysWorked > 0 ? priorDaysWorked : days;
      const displayTotal = settledSnapshot && priorNetPay > 0 ? priorNetPay : previewTotal;

      return {
        id: e.id,
        name: e.full_name || e.email || "—",
        email: e.email,
        type,
        days,
        rawH,
        paidH,
        regH,
        otH,
        base,
        allowance,
        total: previewTotal,
        payrollPaid,
        salaryRowId: monthRow?.id ?? null,
        existingExpenseId: (monthRow as { expense_id?: string | null })?.expense_id ?? null,
        priorGrossPay,
        priorNetPay,
        priorDaysWorked,
        priorBonusAmount,
        displayDays,
        displayTotal,
        settledSnapshot,
      };
    });
  }, [employees, attendanceUnpaidInPeriod, periodStart, periodEnd, periodDays, list, periodStartStr, periodEndStr]);

  async function markPaid(id: string) {
    const { data } = await supabase
      .from("salaries")
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    const sid = String(id);
    setList((prev) => {
      const i = prev.findIndex((s) => String(s.id) === sid);
      const row = data as (typeof prev)[0];
      if (i >= 0) {
        const next = [...prev];
        next.splice(i, 1);
        return [row, ...next];
      }
      return [row, ...prev];
    });
    void router.refresh();
  }

  function mergePaidSalaryRow(saved: Record<string, unknown>) {
    const id = String((saved as { id?: unknown }).id ?? "");
    if (!id) {
      console.error("mergePaidSalaryRow: missing salary id", saved);
      void router.refresh();
      return;
    }
    setList((prev) => {
      const i = prev.findIndex((s) => String(s.id) === id);
      const row = saved as (typeof prev)[0];
      if (i >= 0) {
        const next = [...prev];
        next.splice(i, 1);
        return [row, ...next];
      }
      return [row, ...prev];
    });
    void router.refresh();
  }

  const recordedForSelectedPeriod = useMemo(
    () =>
      list.filter(
        (s) =>
          salaryPeriodYMDFromDb(s.period_start) === periodStartStr &&
          salaryPeriodYMDFromDb(s.period_end) === periodEndStr,
      ),
    [list, periodStartStr, periodEndStr],
  );

  /** Most recently paid first so follow-up pays in the same month surface at the top. */
  const recordedPayrollRows = useMemo(() => {
    const paidAtMs = (s: (typeof list)[0]) => {
      const p = s.paid_at;
      if (!p) return 0;
      const t = new Date(p as string).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    const createdMs = (s: (typeof list)[0]) => {
      const c = s.created_at;
      if (!c) return 0;
      const t = new Date(c as string).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    return [...recordedForSelectedPeriod].sort((a, b) => {
      const d = paidAtMs(b) - paidAtMs(a);
      if (d !== 0) return d;
      return createdMs(b) - createdMs(a);
    });
  }, [recordedForSelectedPeriod]);

  const recordedPeriodNetTotal = useMemo(
    () => recordedForSelectedPeriod.reduce((s, x) => s + Number(x.net_pay || 0), 0),
    [recordedForSelectedPeriod],
  );

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border/60 bg-card/50 px-4 py-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="payroll-period-start">Start (default: 29 days before PH today)</Label>
            <Input
              id="payroll-period-start"
              type="date"
              className="h-9 w-[11.5rem] font-medium tabular-nums"
              value={periodStartStr}
              onChange={(e) => onPayrollStartChange(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payroll-period-end">End (defaults to today, Philippines)</Label>
            <Input
              id="payroll-period-end"
              type="date"
              className="h-9 w-[11.5rem] font-medium tabular-nums"
              value={periodEndStr}
              onChange={(e) => onPayrollEndChange(e.target.value)}
            />
          </div>
        </div>
        <p className="max-w-xl text-xs text-muted-foreground leading-relaxed lg:pb-0.5">
          <strong>Employee salary computation</strong> and <strong>recorded payroll</strong> use this inclusive range in{" "}
          <strong>Asia/Manila</strong> (start at midnight, end through end of day). On first load, end defaults to{" "}
          <strong>today in the Philippines</strong> and start is <strong>29 days earlier</strong> (30 calendar days
          inclusive, e.g. June 1–June 30). Pay stores these same dates on the salary row.
        </p>
      </div>

      <details className="group mb-6 rounded-lg border border-border/80 bg-card open:shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <span>Employee pay &amp; allowances</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-border/60 px-4 pb-4 pt-3">
          <p className="mb-3 text-sm text-muted-foreground">
            <strong>Hourly</strong>: times from <span className="whitespace-nowrap">Admin → Attendance</span>; set{" "}
            <strong>break (minutes)</strong> and <strong>OT (₱/hr)</strong> in the table (they apply only when type is
            Hourly). Other types use distinct days with a time-in during the payroll period you set above.
          </p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="p-3">Employee</th>
                  <th className="p-2 w-[130px]">Salary type</th>
                  <th className="p-2 w-[110px]">Rate</th>
                  <th className="p-2 w-[88px]">Break (min)</th>
                  <th className="p-2 w-[100px]">OT (₱/hr)</th>
                  <th className="p-2 min-w-[9rem]">Allowance basis</th>
                  <th className="p-2 w-[100px]">Allowance (₱)</th>
                  <th className="p-2 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <EmployeePayRow key={e.id} emp={e} />
                ))}
                {employees.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      No employees. Add people under Employees first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Employee salary computation</CardTitle>
            {loadingPeriod && (
              <span className="text-xs text-muted-foreground animate-pulse">Refreshing…</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{periodRangeLabel}</span> — only shifts in this date range that are{" "}
            <strong>not yet marked paid in payroll</strong> count toward the unpaid columns here (see Attendance). The{" "}
            <strong>Pay</strong> button stays available after a period is paid (e.g. for a bonus);{" "}
            <strong>Confirm pay</strong> requires a payout greater than zero. After you use <strong>Pay</strong>, those rows
            are flagged settled; new clock-ins in this period stay unpaid until the next payout. Hourly uses break and OT
            rules; allowance follows basis.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-left text-xs font-medium text-muted-foreground">
              <tr>
                <th className="p-3">Employee</th>
                <th className="p-2">Type</th>
                <th className="p-2 text-right">Days in</th>
                <th className="p-2 text-right">Raw h</th>
                <th className="p-2 text-right">Paid h</th>
                <th className="p-2 text-right">Reg h</th>
                <th className="p-2 text-right">OT h</th>
                <th className="p-2 text-right">Base</th>
                <th className="p-2 text-right">Allowance</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2">Pay / status</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </td>
                  <td className="p-2">{salaryTypeLabel(r.type)}</td>
                  <td className="p-2 text-right tabular-nums">{r.displayDays}</td>
                  <td className="p-2 text-right tabular-nums">{r.type === "hourly" ? r.rawH.toFixed(2) : "—"}</td>
                  <td className="p-2 text-right tabular-nums">{r.type === "hourly" ? r.paidH.toFixed(2) : "—"}</td>
                  <td className="p-2 text-right tabular-nums">{r.type === "hourly" ? r.regH.toFixed(2) : "—"}</td>
                  <td className="p-2 text-right tabular-nums">{r.type === "hourly" ? r.otH.toFixed(2) : "—"}</td>
                  <td className="p-2 text-right tabular-nums">{peso(r.base)}</td>
                  <td className="p-2 text-right tabular-nums">{peso(r.allowance)}</td>
                  <td
                    className="p-2 text-right font-semibold tabular-nums"
                    title={r.settledSnapshot && r.displayTotal > 0 ? `Last recorded net pay for this period: ${peso(r.displayTotal)}` : undefined}
                  >
                    {peso(r.displayTotal)}
                  </td>
                  <td className="p-2">
                    <div className="flex flex-col items-start gap-1.5">
                      {r.payrollPaid === "paid" && (
                        <div className="flex flex-col gap-0.5">
                          <Badge variant="green">Paid</Badge>
                          {r.settledSnapshot && (
                            <span className="text-[11px] text-muted-foreground leading-tight">
                              All shifts settled.{r.displayTotal > 0 ? ` Last net: ${peso(r.displayTotal)}` : ""}
                            </span>
                          )}
                        </div>
                      )}
                      {r.payrollPaid === "more_due" && (
                        <div className="flex flex-wrap gap-1">
                          <Badge variant="green">Paid (earlier)</Badge>
                          <Badge variant="amber">More to pay</Badge>
                        </div>
                      )}
                      {r.payrollPaid === "unpaid" && <Badge variant="amber">Unpaid</Badge>}
                      {r.payrollPaid === "none" && <span className="text-xs text-muted-foreground">Not yet paid</span>}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={
                          financeAccounts.length === 0 || (!!r.existingExpenseId && r.payrollPaid === "unpaid")
                        }
                        onClick={() => setPayRow(r)}
                      >
                        Pay
                      </Button>
                      {!!r.existingExpenseId && r.payrollPaid === "unpaid" && (
                        <span className="text-[10px] text-muted-foreground">
                          Expense linked — use Mark paid below if needed.
                        </span>
                      )}
                      {financeAccounts.length === 0 && (
                        <span className="text-[10px] text-destructive">Add Finance accounts first.</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {previewRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-6 text-center text-muted-foreground">
                    No employees.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recorded payroll</CardTitle>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{periodRangeLabel}</span> — rows saved for this same attendance
            period (start/end above). Rows created when you use <strong>Pay</strong> in Employee salary computation (finance +
            expense). The list is ordered by <strong>last paid</strong> so the newest activity appears first.{" "}
            <strong>Mark paid</strong> only toggles status without recording an expense — use Pay for normal payroll.
          </p>
          <div className="mt-3 rounded-md border border-border/60 bg-muted/25 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
            <p className="font-medium text-foreground/90">How follow-up pays work</p>
            <p className="mt-1.5">
              There is <strong>one summary row per employee per payroll period</strong> (same start and end dates as
              above). If you run <strong>Pay</strong> again after new attendance in that range, that row is{" "}
              <strong>updated</strong>: Gross, Net, Days, Last paid, and the linked salary expense id point to the{" "}
              <strong>latest</strong> payout run.
            </p>
            <p className="mt-1.5">
              Each <strong>Pay</strong> still creates its <strong>own</strong> Salary expense and finance withdrawal for
              that run&apos;s amount. The row here is the <strong>cumulative</strong> total for that period; older expense
              lines remain in <strong>Admin → Expenses</strong> and <strong>Finance</strong> for the full history.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3">Employee</th>
                <th>Attendance period</th>
                <th>Days</th>
                <th>Gross</th>
                <th>Deductions</th>
                <th>Net</th>
                <th>Last paid</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recordedPayrollRows.map((s) => {
                const emp = employees.find((e) => e.id === s.user_id);
                return (
                  <tr key={s.id} className="border-t">
                    <td className="p-3">{emp?.full_name || emp?.email || "—"}</td>
                    <td className="text-muted-foreground">{periodRangeLabel}</td>
                    <td>{s.days_worked}</td>
                    <td>{peso(s.gross_pay)}</td>
                    <td>{peso(s.deductions)}</td>
                    <td className="font-semibold">{peso(s.net_pay)}</td>
                    <td className="text-muted-foreground whitespace-nowrap text-xs">
                      {s.paid_at ? formatDateTime(s.paid_at) : "—"}
                    </td>
                    <td>
                      <Badge variant={salaryRowIsPaid(s) ? "green" : "amber"}>
                        {salaryRowIsPaid(s) ? "Paid" : "Unpaid"}
                      </Badge>
                    </td>
                    <td>
                      {!salaryRowIsPaid(s) && (
                        <Button size="sm" variant="outline" onClick={() => void markPaid(s.id)}>
                          Mark Paid
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    No recorded payroll rows yet.
                  </td>
                </tr>
              )}
              {list.length > 0 && recordedPayrollRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    No recorded payroll for {periodRangeLabel}. Use Pay in Employee salary computation for this range, or
                    choose another start/end above.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40">
                <td colSpan={6} className="p-3 text-right font-medium">
                  Total (net)
                </td>
                <td colSpan={3} className="font-semibold">
                  {peso(recordedPeriodNetTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <PayFromAttendanceDialog
        open={!!payRow}
        onClose={() => setPayRow(null)}
        row={payRow}
        financeAccounts={financeAccounts}
        periodStartStr={periodStartStr}
        periodEndStr={periodEndStr}
        periodRangeLabel={periodRangeLabel}
        periodStart={periodStart}
        periodEnd={periodEnd}
        onPaid={mergePaidSalaryRow}
      />
    </>
  );
}
