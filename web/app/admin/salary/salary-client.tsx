"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { peso, formatDate, cn } from "@/lib/utils";
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

const SALARY_TYPE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "hourly", label: "Hourly" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "every_3_weeks", label: "Every 3 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "per_order", label: "Per order" },
] as const;

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

export function SalaryClient({ employees, salaries, attendance }: { employees: any[]; salaries: any[]; attendance: any[] }) {
  const supabase = createClient();
  const [list, setList] = useState(salaries);

  useEffect(() => {
    setList(salaries);
  }, [salaries]);

  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
  }, []);
  const monthEnd = useMemo(
    () => new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999),
    [monthStart],
  );

  const periodStartStr = useMemo(() => monthStart.toISOString().slice(0, 10), [monthStart]);
  const periodEndStr = useMemo(() => monthEnd.toISOString().slice(0, 10), [monthEnd]);
  const periodDays = useMemo(() => periodCalendarDays(periodStartStr, periodEndStr), [periodStartStr, periodEndStr]);

  const monthLabel = useMemo(
    () =>
      monthStart.toLocaleString(undefined, {
        month: "long",
        year: "numeric",
      }),
    [monthStart],
  );

  const previewRows = useMemo(() => {
    const distinctDays = (uid: string) =>
      new Set(
        attendance
          .filter((a) => a.user_id === uid && new Date(a.time_in) >= monthStart && new Date(a.time_in) <= monthEnd)
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
          attendance,
          e.id,
          monthStart,
          monthEnd,
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
          s.user_id === e.id &&
          String(s.period_start).slice(0, 10) === periodStartStr &&
          String(s.period_end).slice(0, 10) === periodEndStr,
      );
      const payrollPaid: "none" | "unpaid" | "paid" = !monthRow ? "none" : monthRow.paid ? "paid" : "unpaid";
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
        total: base + allowance,
        payrollPaid,
      };
    });
  }, [employees, attendance, monthStart, monthEnd, periodDays, list, periodStartStr, periodEndStr]);

  async function markPaid(id: string) {
    const { data } = await supabase
      .from("salaries")
      .update({ paid: true, paid_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    setList((prev) => prev.map((s) => (s.id === id ? data : s)));
  }

  const total = list.reduce((s, x) => s + Number(x.net_pay || 0), 0);

  return (
    <>
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Employee pay &amp; allowances</CardTitle>
          <p className="text-sm text-muted-foreground">
            <strong>Hourly</strong>: times from <span className="whitespace-nowrap">Admin → Attendance</span>; set{" "}
            <strong>break (minutes)</strong> and <strong>OT (₱/hr)</strong> in the columns below (they apply only when type
            is Hourly). Other types use distinct days with a time-in this month.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
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
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">This month from attendance</CardTitle>
          <p className="text-sm text-muted-foreground">
            {monthLabel} — hourly: total clocked hours per day minus break (minutes) = paid hours; first{" "}
            {REGULAR_HOURS_BEFORE_OT_DEFAULT} paid hours/day at regular rate, then OT rate (or regular if OT is ₱0).
            Allowance is added by basis (e.g. per day worked). Other salary types ignore clock hours for base pay.
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
                <th className="p-2">Paid</th>
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
                  <td className="p-2 text-right tabular-nums">{r.days}</td>
                  <td className="p-2 text-right tabular-nums">{r.type === "hourly" ? r.rawH.toFixed(2) : "—"}</td>
                  <td className="p-2 text-right tabular-nums">{r.type === "hourly" ? r.paidH.toFixed(2) : "—"}</td>
                  <td className="p-2 text-right tabular-nums">{r.type === "hourly" ? r.regH.toFixed(2) : "—"}</td>
                  <td className="p-2 text-right tabular-nums">{r.type === "hourly" ? r.otH.toFixed(2) : "—"}</td>
                  <td className="p-2 text-right tabular-nums">{peso(r.base)}</td>
                  <td className="p-2 text-right tabular-nums">{peso(r.allowance)}</td>
                  <td className="p-2 text-right font-semibold tabular-nums">{peso(r.total)}</td>
                  <td className="p-2">
                    {r.payrollPaid === "none" && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {r.payrollPaid === "unpaid" && (
                      <Badge variant="amber">Unpaid</Badge>
                    )}
                    {r.payrollPaid === "paid" && (
                      <Badge variant="green">Paid</Badge>
                    )}
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
          <p className="text-sm text-muted-foreground">History of salary rows in the system. Mark paid when payout is done.</p>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3">Employee</th>
                <th>Period</th>
                <th>Days</th>
                <th>Gross</th>
                <th>Deductions</th>
                <th>Net</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => {
                const emp = employees.find((e) => e.id === s.user_id);
                return (
                  <tr key={s.id} className="border-t">
                    <td className="p-3">{emp?.full_name || emp?.email || "—"}</td>
                    <td>
                      {formatDate(s.period_start)} – {formatDate(s.period_end)}
                    </td>
                    <td>{s.days_worked}</td>
                    <td>{peso(s.gross_pay)}</td>
                    <td>{peso(s.deductions)}</td>
                    <td className="font-semibold">{peso(s.net_pay)}</td>
                    <td>
                      <Badge variant={s.paid ? "green" : "amber"}>{s.paid ? "Paid" : "Unpaid"}</Badge>
                    </td>
                    <td>
                      {!s.paid && (
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
                  <td colSpan={8} className="p-6 text-center text-muted-foreground">
                    No recorded payroll rows yet.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/40">
                <td colSpan={5} className="p-3 text-right font-medium">
                  Total
                </td>
                <td colSpan={3} className="font-semibold">
                  {peso(total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
