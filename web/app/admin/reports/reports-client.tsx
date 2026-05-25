"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { peso } from "@/lib/utils";
import {
  computeMonthlyBreakdown,
  computeReportSummary,
  normalizeReportExpenses,
  normalizeReportManualSales,
  normalizeReportOrders,
  normalizeReportSalaries,
  resolveReportDateRange,
  topExpenseCategories,
  type ReportDatePreset,
} from "@/lib/reports-data";
import type { ReportsRawData } from "@/lib/reports-fetch";
import { CalendarRange, TrendingUp, Users, Receipt, PiggyBank, AlertCircle } from "lucide-react";

const PRESETS: Array<{ key: ReportDatePreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

function pct(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "" : ""}${n.toFixed(1)}%`;
}

function formatMonth(ym: string) {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "long" });
}

export function ReportsClient(props: ReportsRawData) {
  const ordersRaw = props.orders ?? [];
  const expensesRaw = props.expenses ?? [];
  const salariesRaw = props.salaries ?? [];
  const manualSalesRaw = props.manualSales ?? [];
  const loadErrors = props.loadErrors ?? [];
  const orders = useMemo(() => normalizeReportOrders(ordersRaw), [ordersRaw]);
  const expenses = useMemo(() => normalizeReportExpenses(expensesRaw), [expensesRaw]);
  const salaries = useMemo(() => normalizeReportSalaries(salariesRaw), [salariesRaw]);
  const manualSales = useMemo(() => normalizeReportManualSales(manualSalesRaw), [manualSalesRaw]);

  const [preset, setPreset] = useState<ReportDatePreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo(
    () => resolveReportDateRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const summary = useMemo(
    () => computeReportSummary(orders, expenses, salaries, manualSales, range),
    [orders, expenses, salaries, manualSales, range],
  );

  const monthly = useMemo(
    () => computeMonthlyBreakdown(orders, expenses, salaries, manualSales, range),
    [orders, expenses, salaries, manualSales, range],
  );

  const topExpenses = useMemo(
    () => topExpenseCategories(expenses, range),
    [expenses, range],
  );

  const percentageTax = summary.totalCompletedSales * 0.03;

  const dataNote = [
    `${ordersRaw.length.toLocaleString()} orders loaded`,
    `${manualSalesRaw.length.toLocaleString()} revenue imports`,
  ].join(" · ");

  return (
    <div className="space-y-6">
      {loadErrors.length > 0 && (
        <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Some data could not be loaded</p>
            <ul className="mt-1 list-inside list-disc text-xs opacity-90">
              {loadErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4" />
            Report period
          </CardTitle>
          <CardDescription>
            Filter all figures below. Sales use order activity date (last update). {dataNote}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(({ key, label }) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={preset === key ? "default" : "outline"}
                onClick={() => setPreset(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          {preset === "custom" && (
            <div className="grid gap-4 sm:grid-cols-2 max-w-lg">
              <div>
                <Label htmlFor="rep-from">Start date</Label>
                <Input
                  id="rep-from"
                  type="date"
                  className="mt-1"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="rep-to">End date</Label>
                <Input
                  id="rep-to"
                  type="date"
                  className="mt-1"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </div>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Showing: <span className="font-medium text-foreground">{range.label}</span>
            {!range.allTime && range.from && (
              <span>
                {" "}
                ({range.from}
                {range.to !== range.from ? ` → ${range.to}` : ""})
              </span>
            )}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total sales (Sales list)"
          value={peso(summary.totalCompletedSales)}
          hint={`${summary.orderCountCompleted} rows — excludes BigSeller marketplace`}
          icon={TrendingUp}
          accent="primary"
        />
        <StatCard
          label="Expenses"
          value={peso(summary.expenses)}
          hint={`${summary.expenseCount} expense entries`}
          icon={Receipt}
          accent="warning"
        />
        <StatCard
          label="Payroll"
          value={peso(summary.payroll)}
          hint={`${summary.payrollCount} salary records (by period end)`}
          icon={Users}
          accent="muted"
        />
        <StatCard
          label="Net profit"
          value={peso(summary.netProfit)}
          hint={`Margin ${pct(summary.profitMarginPct)} on completed sales`}
          icon={PiggyBank}
          accent={summary.netProfit >= 0 ? "success" : "danger"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Revenue breakdown</CardTitle>
            <CardDescription>Same scope as Sales list (BigSeller tracked separately)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <BreakdownRow label="Completed orders (shop / walk-in / online)" value={summary.completedMainSales} />
            <BreakdownRow label="Bookkeeping revenue (imports)" value={summary.manualRevenue} />
            <div className="border-t pt-3 flex justify-between font-semibold">
              <span>Total sales (Sales list)</span>
              <span>{peso(summary.totalCompletedSales)}</span>
            </div>
            <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <BreakdownRow label="BigSeller marketplace (excluded)" value={summary.bigSellerSales} />
              <p className="mt-1">Not included above — view totals on the BigSeller Sales page.</p>
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p>
                <span className="font-medium text-foreground">All orders (gross, excl. BigSeller):</span>{" "}
                {peso(summary.allOrdersGross)} ({summary.orderCountAll} orders)
              </p>
              <p>
                <span className="font-medium text-foreground">Pending pipeline:</span> {peso(summary.pendingPipeline)}{" "}
                ({summary.orderCountPending} in progress, not counted in sales)
              </p>
              {summary.downPaymentsInPeriod > 0 && (
                <p>
                  <span className="font-medium text-foreground">Down payments recorded:</span>{" "}
                  {peso(summary.downPaymentsInPeriod)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">BIR estimate (Non-VAT)</CardTitle>
            <CardDescription>3% on Sales list total (excludes BigSeller)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Taxable base: <span className="font-semibold">{peso(summary.totalCompletedSales)}</span>
            </p>
            <p>
              Estimated 3% tax: <span className="font-semibold text-amber-700 dark:text-amber-300">{peso(percentageTax)}</span>
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              For reference only. File via BIR Form 2551Q (quarterly) and annual 1701A as applicable. Confirm with your
              accountant.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly summary</CardTitle>
            <CardDescription>Net uses Sales list revenue only; BigSeller column is reference</CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="font-medium text-right">Sales</th>
                  <th className="font-medium text-right">BigSeller</th>
                  <th className="font-medium text-right">Revenue imp.</th>
                  <th className="font-medium text-right">Expenses</th>
                  <th className="font-medium text-right">Payroll</th>
                  <th className="px-4 font-medium text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((row) => (
                  <tr key={row.month} className="border-t">
                    <td className="px-4 py-3 whitespace-nowrap">{formatMonth(row.month)}</td>
                    <td className="text-right tabular-nums">{peso(row.sales)}</td>
                    <td className="text-right tabular-nums text-muted-foreground">{peso(row.bigSellerSales)}</td>
                    <td className="text-right tabular-nums text-muted-foreground">{peso(row.manualRevenue)}</td>
                    <td className="text-right tabular-nums">{peso(row.expenses)}</td>
                    <td className="text-right tabular-nums">{peso(row.payroll)}</td>
                    <td
                      className={`px-4 text-right font-medium tabular-nums ${row.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
                    >
                      {peso(row.net)}
                    </td>
                  </tr>
                ))}
                {monthly.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No data in this period.
                    </td>
                  </tr>
                )}
              </tbody>
              {monthly.length > 0 && (
                <tfoot className="border-t bg-muted/30 font-medium">
                  <tr>
                    <td className="px-4 py-3">Period total</td>
                    <td className="text-right tabular-nums">{peso(summary.completedMainSales)}</td>
                    <td className="text-right tabular-nums">{peso(summary.bigSellerSales)}</td>
                    <td className="text-right tabular-nums">{peso(summary.manualRevenue)}</td>
                    <td className="text-right tabular-nums">{peso(summary.expenses)}</td>
                    <td className="text-right tabular-nums">{peso(summary.payroll)}</td>
                    <td
                      className={`px-4 text-right tabular-nums ${summary.netProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}
                    >
                      {peso(summary.netProfit)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top expense categories</CardTitle>
            <CardDescription>Largest spending areas in this period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topExpenses.length === 0 && (
              <p className="text-sm text-muted-foreground">No expenses in this period.</p>
            )}
            {topExpenses.map(({ category, amount }) => {
              const share = summary.expenses > 0 ? (amount / summary.expenses) * 100 : 0;
              return (
                <div key={category}>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium truncate pr-2">{category}</span>
                    <span className="tabular-nums shrink-0">{peso(amount)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${Math.min(100, share)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">{pct(share)} of expenses</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Sales totals match the Sales list: completed shop orders plus bookkeeping imports. BigSeller marketplace orders
        are excluded from sales, net profit, and tax estimate. Cancelled and returned orders are excluded.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "primary" | "success" | "warning" | "danger" | "muted";
}) {
  const accentClass =
    accent === "primary"
      ? "text-primary"
      : accent === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : accent === "warning"
          ? "text-amber-600 dark:text-amber-400"
          : accent === "danger"
            ? "text-destructive"
            : "text-muted-foreground";

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`mt-1 text-2xl font-semibold tracking-tight ${accentClass}`}>{value}</p>
            <p className="mt-1 text-xs text-muted-foreground leading-snug">{hint}</p>
          </div>
          <Icon className={`h-5 w-5 shrink-0 opacity-60 ${accentClass}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums shrink-0">{peso(value)}</span>
    </div>
  );
}
