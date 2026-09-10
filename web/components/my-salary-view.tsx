import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { peso, formatDate } from "@/lib/utils";

export type MySalaryRow = {
  id: string;
  period_start: string;
  period_end: string;
  days_worked: number;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  paid?: boolean | null;
  expense_id?: string | null;
};

export function MySalaryView({
  rows,
  salaryType,
  salaryRate,
}: {
  rows: MySalaryRow[];
  salaryType?: string | null;
  salaryRate?: number | null;
}) {
  const total = rows.reduce((s, x) => s + Number(x.net_pay), 0);

  return (
    <div>
      <PageHeader title="My Salary" description="Earnings history" />
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Lifetime earnings</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">{peso(total)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Salary type</div>
            <div className="mt-0.5 text-xl font-semibold capitalize tabular-nums">
              {salaryType || "—"} · {peso(salaryRate)}
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs">
              <tr>
                <th className="p-2">Period</th>
                <th className="p-2">Days</th>
                <th className="p-2">Gross</th>
                <th className="p-2">Deductions</th>
                <th className="p-2">Net</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-2 text-xs whitespace-nowrap">
                    {formatDate(s.period_start)} – {formatDate(s.period_end)}
                    {s.expense_id ? (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">Expense</span>
                    ) : null}
                  </td>
                  <td className="p-2 tabular-nums">{s.days_worked}</td>
                  <td className="p-2 tabular-nums">{peso(s.gross_pay)}</td>
                  <td className="p-2 tabular-nums">{peso(s.deductions)}</td>
                  <td className="p-2 font-semibold tabular-nums">{peso(s.net_pay)}</td>
                  <td className="p-2">
                    <Badge variant={s.paid ? "green" : "amber"} className="text-[10px]">
                      {s.paid ? "Paid" : "Pending"}
                    </Badge>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    No records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
