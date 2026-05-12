"use client";

import { useCallback, useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  fetchActiveMaintenanceAlerts,
  dismissMaintenanceAlert,
  maintenanceAssigneeNames,
  type MaintenanceScheduleRow,
} from "@/lib/maintenance";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

const REFRESH_MS = 120_000;

export function ScheduledMaintenanceAlerts({ userId }: { userId: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState<MaintenanceScheduleRow[]>([]);

  const load = useCallback(async () => {
    const next = await fetchActiveMaintenanceAlerts(supabase, userId);
    setRows(next);
  }, [supabase, userId]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  async function dismiss(id: string) {
    await dismissMaintenanceAlert(supabase, userId, id);
    setRows((p) => p.filter((r) => r.id !== id));
  }

  if (rows.length === 0) return null;

  return (
    <div
      role="status"
      className="rounded-lg border border-amber-500/40 bg-amber-500/[0.08] p-4 shadow-sm dark:border-amber-400/35 dark:bg-amber-400/[0.09]"
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Wrench className="h-4 w-4 text-amber-700 dark:text-amber-300" aria-hidden />
        Active maintenance alerts
      </div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-md border border-amber-500/25 bg-background/60 p-3 dark:border-amber-400/20">
            <div className="font-medium">{r.title}</div>
            <div className="text-xs text-muted-foreground">{r.machine_name}</div>
            {r.description && <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>}
            {maintenanceAssigneeNames(r) && (
              <div className="mt-1 text-xs font-medium text-foreground">Assigned: {maintenanceAssigneeNames(r)}</div>
            )}
            {r.instructions?.trim() && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{r.instructions}</p>
            )}
            <div className="mt-2 text-xs text-muted-foreground">
              Window: {formatDate(r.starts_at)} – {formatDate(r.ends_at)}
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-2 h-8 text-xs" onClick={() => dismiss(r.id)}>
              Dismiss for me
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
