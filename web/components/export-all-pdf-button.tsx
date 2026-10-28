"use client";

import { useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildExportReportPdf,
  defaultExportRange,
  downloadExportReportPdf,
  exportRangeLabel,
  fetchExportReportData,
} from "@/lib/export-all-report";
import { localDateKeyFromIso, localTodayYmd } from "@/lib/sales-list";

export function ExportAllPdfButton({ className }: { className?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const initial = defaultExportRange();

  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function applyPreset(kind: "today" | "7" | "month") {
    const today = localTodayYmd();
    if (kind === "today") {
      setFrom(today);
      setTo(today);
      return;
    }
    if (kind === "month") {
      setFrom(`${today.slice(0, 7)}-01`);
      setTo(today);
      return;
    }
    const start = new Date();
    start.setDate(start.getDate() - 6);
    setFrom(localDateKeyFromIso(start.toISOString()) || today);
    setTo(today);
  }

  async function runExport() {
    const reportFrom = from.trim().slice(0, 10);
    const reportTo = to.trim().slice(0, 10);
    if (!reportFrom || !reportTo) {
      setError("Choose a start and end date.");
      return;
    }
    if (reportFrom > reportTo) {
      setError("Start date must be on or before the end date.");
      return;
    }

    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const data = await fetchExportReportData(supabase, { from: reportFrom, to: reportTo });
      const blob = await buildExportReportPdf(data);
      const tag = reportFrom === reportTo ? reportFrom : `${reportFrom}_${reportTo}`;
      downloadExportReportPdf(blob, `printshop_full_export_${tag}`);
      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        className={className}
        onClick={() => {
          const range = defaultExportRange();
          setOpen(true);
          setError(null);
          setDone(false);
          setFrom(range.from);
          setTo(range.to);
        }}
      >
        <FileText className="mr-2 h-4 w-4" />
        Export everything as PDF
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Full export (single PDF)" size="md">
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Downloads <strong>one PDF</strong> for the dates you pick: stock inventory, ready-made sheets, finance
            balances, money in/out, sales, expenses, and activity log.
          </p>
          <p className="text-xs text-muted-foreground">
            Inventory and ready-made are always the <strong>current snapshot</strong>. Sales, expenses, money flow,
            and activity log include every local calendar day from start through end.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("today")}>
              Today
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("7")}>
              Last 7 days
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("month")}>
              This month
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pdf-from">From</Label>
              <Input
                id="pdf-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="pdf-to">To</Label>
              <Input
                id="pdf-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Selected: {exportRangeLabel(from, to)}</p>

          {error && <p className="text-destructive">{error}</p>}
          {done && (
            <p className="text-green-600 dark:text-green-400">
              PDF downloaded. Open it in your viewer or share as needed.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="button" onClick={() => void runExport()} disabled={busy}>
              <FileText className="mr-1.5 h-4 w-4" />
              {busy ? "Building PDF…" : "Download PDF"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
