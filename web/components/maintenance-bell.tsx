"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Wrench, X } from "lucide-react";
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

export function MaintenanceBell({ userId }: { userId: string }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<MaintenanceScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchActiveMaintenanceAlerts(supabase, userId);
      setRows(next);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    load();
    function onDoc(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, load]);

  async function dismiss(id: string) {
    await dismissMaintenanceAlert(supabase, userId, id);
    setRows((p) => p.filter((r) => r.id !== id));
  }

  const n = rows.length;

  return (
    <div className="relative" ref={panelRef}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="relative h-9 w-9 shrink-0"
        aria-label={n ? `${n} maintenance reminder${n > 1 ? "s" : ""}` : "Maintenance reminders"}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-4 w-4" />
        {n > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-bold text-white">
            {n > 9 ? "9+" : n}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(calc(100vw-2rem),22rem)] rounded-lg border bg-popover p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Machine maintenance</span>
            <button type="button" className="rounded p-1 hover:bg-muted" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {!loading && n === 0 && (
            <p className="text-xs text-muted-foreground">No active maintenance alerts right now.</p>
          )}
          <ul className="max-h-[min(60dvh,20rem)] space-y-2 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.id} className="rounded-md border bg-card p-2.5 text-sm">
                <div className="flex gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-amber-500/15 text-amber-800 dark:text-amber-200">
                    <Wrench className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-tight">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{r.machine_name}</div>
                    {r.description && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.description}</p>}
                    {maintenanceAssigneeNames(r) && (
                      <div className="mt-1 text-[11px] font-medium text-foreground">Assigned: {maintenanceAssigneeNames(r)}</div>
                    )}
                    {r.instructions?.trim() && (
                      <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">{r.instructions}</p>
                    )}
                    <div className="mt-1.5 text-[11px] text-muted-foreground">
                      {formatDate(r.starts_at)} – {formatDate(r.ends_at)}
                    </div>
                    <button
                      type="button"
                      className="mt-2 text-xs font-medium text-primary hover:underline"
                      onClick={() => dismiss(r.id)}
                    >
                      Dismiss for me
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
