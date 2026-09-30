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
  type MonthlyReportRow,
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
          hint={`${summary.orderCountCompleted} rows — excludes marketplace imports`}
          icon={TrendingUp}
          accent="primary"
        />
        <StatCard
          label="Expenses"
          value={peso(summary.expenses)}
          hint={
            summary.payrollInExpenses > 0
              ? `${summary.expenseCount} entries · includes ${peso(summary.payrollInExpenses)} salary`
              : `${summary.expenseCount} expense entries`
          }
          icon={Receipt}
          accent="warning"
        />
        <StatCard
          label="Payroll"
          value={peso(summary.payroll)}
          hint={
            summary.payrollInExpenses > 0
              ? "Paid salary is already in expenses — not subtracted twice"
              : `${summary.payrollCount} salary records (by period end)`
          }
          icon={Users}
          accent="muted"
        />
        <StatCard
          label="Net profit"
          value={peso(summary.netProfit)}
          hint={`Margin ${pct(summary.profitMarginPct)} · sales − expenses${summary.unlinkedPayroll > 0 ? " − unlinked payroll" : ""}`}
          icon={PiggyBank}
          accent={summary.netProfit >= 0 ? "success" : "danger"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">This period</CardTitle>
            <CardDescription>Sales, expenses, and net profit</CardDescription>
          </CardHeader>
          <CardContent>
            <PeriodBars sales={summary.totalCompletedSales} expenses={summary.expenses} net={summary.netProfit} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Monthly trend</CardTitle>
            <CardDescription>Sales, expenses, and net by month</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyTrendChart rows={monthly} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Revenue breakdown</CardTitle>
            <CardDescription>Same scope as Sales list</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <BreakdownRow label="Completed orders (shop / walk-in / online)" value={summary.completedMainSales} />
            <BreakdownRow label="Bookkeeping revenue (imports)" value={summary.manualRevenue} />
            <div className="border-t pt-3 flex justify-between font-semibold">
              <span>Total sales (Sales list)</span>
              <span>{peso(summary.totalCompletedSales)}</span>
            </div>
            <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <BreakdownRow label="Marketplace imports (excluded)" value={summary.bigSellerSales} />
              <p className="mt-1">Historical Shopee / TikTok / Lazada imports are not included in Sales list totals.</p>
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground space-y-1">
              <p>
                <span className="font-medium text-foreground">All orders (gross, excl. imports):</span>{" "}
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
            <CardDescription>3% on Sales list total</CardDescription>
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
            <CardDescription>Net = sales − expenses. Linked payroll is already in expenses.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Month</th>
                  <th className="font-medium text-right">Sales</th>
                  <th className="font-medium text-right">Imports</th>
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
        Sales totals match the Sales list: completed shop orders plus bookkeeping imports. Marketplace import orders are
        excluded from sales, net profit, and tax estimate. Cancelled and returned orders are excluded. Net profit is
        sales minus expenses; salary paid through Expenses is not subtracted again as payroll.
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
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`mt-2 text-2xl font-semibold tracking-tight ${accentClass}`}>{value}</p>
            <p className="mt-1.5 text-xs text-muted-foreground leading-snug">{hint}</p>
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

function PeriodBars({ sales, expenses, net }: { sales: number; expenses: number; net: number }) {
  const max = Math.max(Math.abs(sales), Math.abs(expenses), Math.abs(net), 1);
  const items = [
    { label: "Sales", value: sales, bar: "bg-primary" },
    { label: "Expenses", value: expenses, bar: "bg-amber-500" },
    { label: "Net profit", value: net, bar: net >= 0 ? "bg-emerald-500" : "bg-destructive" },
  ];
  return (
    <div className="flex h-52 items-end gap-4" role="img" aria-label="Sales, expenses, and net profit for this period">
      {items.map((it) => (
        <div key={it.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <span className="text-center text-[11px] font-medium tabular-nums leading-tight">{peso(it.value)}</span>
          <div className="flex h-36 w-full items-end justify-center">
            <div
              className={`w-10 max-w-[70%] rounded-t-md ${it.bar}`}
              style={{ height: `${Math.max(6, (Math.abs(it.value) / max) * 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function shortMonth(ym: string) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-PH", { month: "short", year: "2-digit" });
}

function MonthlyTrendChart({ rows }: { rows: MonthlyReportRow[] }) {
  const data = [...rows].reverse();
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No data in this period.</p>;
  }

  const w = 720;
  const h = 240;
  const pad = { l: 52, r: 16, t: 20, b: 40 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const values = data.flatMap((r) => [r.sales + r.manualRevenue, r.expenses, r.net]);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const xAt = (i: number) => pad.l + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const yAt = (v: number) => pad.t + ((max - v) / span) * innerH;

  function line(pick: (r: MonthlyReportRow) => number) {
    return data.map((r, i) => `${xAt(i).toFixed(1)},${yAt(pick(r)).toFixed(1)}`).join(" ");
  }

  const zeroY = yAt(0);
  const yTicks = [max, (max + min) / 2, min];

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-56 w-full"
        role="img"
        aria-label="Monthly sales, expenses, and net profit"
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={yAt(t)}
              y2={yAt(t)}
              className="stroke-border"
              strokeWidth="1"
            />
            <text x={pad.l - 8} y={yAt(t) + 4} textAnchor="end" className="fill-muted-foreground" fontSize="10">
              {Math.abs(t) >= 1000 ? `${Math.round(t / 1000)}k` : Math.round(t)}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={w - pad.r} y1={zeroY} y2={zeroY} className="stroke-muted-foreground/50" strokeWidth="1" />
        <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" points={line((r) => r.sales + r.manualRevenue)} />
        <polyline fill="none" stroke="#f59e0b" strokeWidth="2.5" points={line((r) => r.expenses)} />
        <polyline fill="none" stroke="#10b981" strokeWidth="2.5" points={line((r) => r.net)} />
        {data.map((r, i) => (
          <g key={r.month}>
            <circle cx={xAt(i)} cy={yAt(r.sales + r.manualRevenue)} r="3" fill="hsl(var(--primary))" />
            <circle cx={xAt(i)} cy={yAt(r.expenses)} r="3" fill="#f59e0b" />
            <circle cx={xAt(i)} cy={yAt(r.net)} r="3" fill="#10b981" />
          </g>
        ))}
        {data.map((r, i) => (
          <text
            key={r.month}
            x={xAt(i)}
            y={h - 12}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="10"
          >
            {shortMonth(r.month)}
          </text>
        ))}
      </svg>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm bg-primary" /> Sales
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm bg-amber-500" /> Expenses
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-sm bg-emerald-500" /> Net profit
        </span>
      </div>
    </div>
  );
}
