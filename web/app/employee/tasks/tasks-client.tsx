"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MachineMaintenanceReminder } from "@/components/machine-maintenance-reminder";
import { ScheduledMaintenanceAlerts } from "@/components/scheduled-maintenance-alerts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { ArrowRight, RotateCcw } from "lucide-react";

const STATUS_FLOW: Record<string, string> = {
  open: "in_progress",
  in_progress: "done",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
  cancelled: "Cancelled",
};
const STATUS_FORWARD_LABEL: Record<string, string> = {
  open: "Start",
  in_progress: "Mark Done",
};
function statusVariant(s: string) {
  if (s === "done") return "green";
  if (s === "in_progress") return "blue";
  if (s === "cancelled") return "red";
  return "amber";
}

export function EmployeeTasksClient({ userId, initial }: { userId: string; initial: any[] }) {
  const supabase = createClient();
  const [list, setList] = useState(initial);
  const [forwarding, setForwarding] = useState<string | null>(null);

  async function forward(task: any) {
    const next = STATUS_FLOW[task.status];
    if (!next) return;
    setForwarding(task.id);
    const patch: any = { status: next };
    if (next === "done") patch.completed_at = new Date().toISOString();
    const { data } = await supabase.from("tasks").update(patch).eq("id", task.id).select().single();
    if (data) setList((p) => p.map((t) => (t.id === task.id ? { ...t, ...data } : t)));
    setForwarding(null);
  }

  async function reopen(task: any) {
    setForwarding(task.id);
    const { data } = await supabase.from("tasks").update({ status: "open", completed_at: null }).eq("id", task.id).select().single();
    if (data) setList((p) => p.map((t) => (t.id === task.id ? { ...t, ...data } : t)));
    setForwarding(null);
  }

  const active = list.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const finished = list.filter((t) => t.status === "done" || t.status === "cancelled");

  return (
    <div className="space-y-4">
      <ScheduledMaintenanceAlerts userId={userId} />
      <MachineMaintenanceReminder variant="employee" />

      {/* Active tasks */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">Status</th>
                <th className="py-2.5 text-left font-medium">Task</th>
                <th className="py-2.5 text-left font-medium">Priority</th>
                <th className="py-2.5 text-left font-medium">Due</th>
                <th className="py-2.5 pr-3 text-left font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {active.map((t) => {
                const nextStatus = STATUS_FLOW[t.status];
                const busy = forwarding === t.id;
                return (
                  <tr key={t.id} className="border-t hover:bg-muted/20">
                    <td className="w-24 px-3 py-3">
                      <Badge variant={statusVariant(t.status) as any} className="text-xs">
                        {STATUS_LABEL[t.status] || t.status}
                      </Badge>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="font-medium">{t.title}</div>
                      {t.description && (
                        <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{t.description}</div>
                      )}
                    </td>
                    <td className="w-20 py-3 pr-3">
                      {t.priority && (
                        <Badge variant={t.priority === "urgent" ? "red" : t.priority === "high" ? "amber" : "outline"} className="text-xs capitalize">
                          {t.priority}
                        </Badge>
                      )}
                    </td>
                    <td className="w-24 py-3 pr-3 text-xs text-muted-foreground">
                      {t.due_date ? formatDate(t.due_date) : "—"}
                    </td>
                    <td className="py-3 pr-3">
                      {nextStatus && (
                        <Button size="sm" variant="default" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => forward(t)}>
                          {busy ? "…" : STATUS_FORWARD_LABEL[t.status]}
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {active.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No active tasks assigned to you.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Done / Cancelled */}
      {finished.length > 0 && (
        <details className="group">
          <summary className="mb-2 cursor-pointer select-none text-sm font-medium text-muted-foreground hover:text-foreground">
            Completed &amp; Cancelled ({finished.length})
          </summary>
          <Card>
            <CardContent className="p-0">
              <table className="w-full min-w-[520px] text-sm opacity-75">
                <tbody>
                  {finished.map((t) => (
                    <tr key={t.id} className="border-t hover:bg-muted/20">
                      <td className="w-24 px-3 py-3">
                        <Badge variant={statusVariant(t.status) as any} className="text-xs">
                          {STATUS_LABEL[t.status] || t.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-3">
                        <div className="font-medium">{t.title}</div>
                        {t.description && (
                          <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{t.description}</div>
                        )}
                      </td>
                      <td className="w-20 py-3 pr-3">
                        {t.priority && (
                          <Badge variant="outline" className="text-xs capitalize">{t.priority}</Badge>
                        )}
                      </td>
                      <td className="w-24 py-3 pr-3 text-xs text-muted-foreground">
                        {t.due_date ? formatDate(t.due_date) : "—"}
                      </td>
                      <td className="py-3 pr-3">
                        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={forwarding === t.id} onClick={() => reopen(t)}>
                          <RotateCcw className="h-3 w-3" /> Reopen
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </details>
      )}
    </div>
  );
}
