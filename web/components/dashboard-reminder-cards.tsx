import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { maintenanceAssigneeNames, type MaintenanceScheduleRow } from "@/lib/maintenance";
import { AlertTriangle, ListChecks, Wrench } from "lucide-react";

export type DashboardLowStockItem = {
  id: string;
  name: string;
  quantity?: unknown;
  min_level?: unknown;
  unit?: string | null;
  href?: string | null;
};

export type DashboardTaskReminder = {
  id: string;
  title: string;
  status: string;
  priority?: string | null;
  due_date?: string | null;
};

const BADGE_BY_TASK_STATUS: Record<string, "amber" | "blue" | "green" | "red" | "outline"> = {
  open: "amber",
  in_progress: "blue",
  done: "green",
  cancelled: "red",
};

function LowStockList({
  items,
  emptyText,
  footerHref,
  footerLabel,
}: {
  items: DashboardLowStockItem[];
  emptyText: string;
  footerHref?: string | null;
  footerLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="rounded-md bg-emerald-500/5 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">{emptyText}</p>;
  }
  return (
    <div className="flex flex-1 flex-col gap-3">
      {items.slice(0, 7).map((i) => {
        const q = Number(i.quantity ?? 0);
        const min = Math.max(1, Number(i.min_level ?? 1));
        const pct = Math.min(100, (q / min) * 100);
        const href = i.href ?? footerHref ?? null;
        const label = <span className="min-w-0 flex-1 truncate font-medium">{i.name}</span>;
        return (
          <div key={i.id} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-sm">
              {href ? (
                <Link href={href} className="min-w-0 flex-1 truncate font-medium hover:underline">
                  {i.name}
                </Link>
              ) : label}
              <span className="shrink-0 text-xs text-muted-foreground">
                {q}/{String(i.min_level ?? "—")}{i.unit ? ` ${String(i.unit)}` : ""}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, background: pct < 50 ? "hsl(var(--destructive))" : "hsl(var(--warning))" }}
              />
            </div>
          </div>
        );
      })}
      {footerHref && (
        <Link href={footerHref} className="mt-auto block pt-1 text-xs font-medium text-primary hover:underline">
          {footerLabel ?? "View all →"}
        </Link>
      )}
    </div>
  );
}

export function DashboardReminderCards({
  maintenance,
  tasks,
  lowStock,
  lowStockReadyMade,
  variant,
}: {
  maintenance: MaintenanceScheduleRow[];
  tasks: DashboardTaskReminder[];
  /** Regular inventory low-stock items. */
  lowStock: DashboardLowStockItem[];
  /** Ready-made inventory low-stock items (shown in a separate card). */
  lowStockReadyMade?: DashboardLowStockItem[];
  variant: "admin" | "employee";
}) {
  const maintHref = variant === "admin" ? "/admin/maintenance" : "/employee/tasks";
  const tasksHref = variant === "admin" ? "/admin/tasks" : "/employee/tasks";
  const invHref = variant === "admin" ? "/admin/inventory" : null;
  const rmHref = variant === "admin" ? "/admin/inventory/ready-made" : null;

  // Support legacy callers that still pass a mixed lowStock array
  const invItems = lowStock.filter((i) => !String(i.id).startsWith("ready-made:"));
  const rmItems = [
    ...lowStock.filter((i) => String(i.id).startsWith("ready-made:")),
    ...(lowStockReadyMade ?? []),
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Maintenance */}
      <Card className="flex flex-col anim-in">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              Maintenance
            </CardTitle>
            <Link href={maintHref} className="shrink-0 text-xs font-medium text-primary hover:underline">
              Open →
            </Link>
          </div>
          <CardDescription>Active scheduled alerts (not dismissed)</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-2 pt-0">
          {maintenance.length === 0 ? (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">No active maintenance windows.</p>
          ) : (
            <ul className="space-y-2">
              {maintenance.slice(0, 6).map((m) => (
                <li key={m.id} className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                  <div className="font-medium leading-snug line-clamp-2">{m.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{m.machine_name}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {formatDate(m.starts_at)} – {formatDate(m.ends_at)}
                  </div>
                  {maintenanceAssigneeNames(m) && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      Assigned: <span className="font-medium text-foreground">{maintenanceAssigneeNames(m)}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {maintenance.length > 6 && (
            <Link href={maintHref} className="mt-auto pt-1 text-xs font-medium text-primary hover:underline">
              View all →
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Tasks */}
      <Card className="flex flex-col anim-in">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 shrink-0 text-primary" />
              Tasks
            </CardTitle>
            <Link href={tasksHref} className="shrink-0 text-xs font-medium text-primary hover:underline">
              Open →
            </Link>
          </div>
          <CardDescription>{variant === "admin" ? "Open team tasks" : "Assigned to you"}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-2 pt-0">
          {tasks.length === 0 ? (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">Nothing pending.</p>
          ) : (
            <ul className="space-y-2">
              {tasks.slice(0, 6).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 font-medium leading-snug line-clamp-2">{t.title}</span>
                  <Badge variant={BADGE_BY_TASK_STATUS[t.status] ?? "outline"} className="shrink-0">
                    {t.status.replace("_", " ")}
                  </Badge>
                  {t.due_date && <span className="w-full text-[11px] text-muted-foreground">Due {formatDate(t.due_date)}</span>}
                </li>
              ))}
            </ul>
          )}
          {tasks.length > 6 && (
            <Link href={tasksHref} className="mt-auto pt-1 text-xs font-medium text-primary hover:underline">
              View all →
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Inventory low stock */}
      <Card className="flex flex-col anim-in">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              Low stock
            </CardTitle>
            {invHref ? (
              <Link href={invHref} className="shrink-0 text-xs font-medium text-primary hover:underline">Open →</Link>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground">Heads-up</span>
            )}
          </div>
          <CardDescription>Inventory — at or below minimum</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col pt-0">
          <LowStockList
            items={invItems}
            emptyText="All inventory above minimum."
            footerHref={invHref}
            footerLabel={invHref ? "View inventory →" : undefined}
          />
          {!invHref && invItems.length > 0 && (
            <p className="mt-auto pt-1 text-xs text-muted-foreground">Tell admin if you need stock pulled.</p>
          )}
        </CardContent>
      </Card>

      {/* Ready-made low stock */}
      <Card className="flex flex-col anim-in">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 shrink-0 text-blue-500" />
              Low stock
            </CardTitle>
            {rmHref ? (
              <Link href={rmHref} className="shrink-0 text-xs font-medium text-primary hover:underline">Open →</Link>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground">Heads-up</span>
            )}
          </div>
          <CardDescription>Ready-made — at or below minimum</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col pt-0">
          <LowStockList
            items={rmItems}
            emptyText="All ready-made above minimum."
            footerHref={rmHref}
            footerLabel={rmHref ? "View ready-made →" : undefined}
          />
          {!rmHref && rmItems.length > 0 && (
            <p className="mt-auto pt-1 text-xs text-muted-foreground">Tell admin if you need stock pulled.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
