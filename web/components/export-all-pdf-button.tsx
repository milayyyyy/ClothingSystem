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
  defaultExportDate,
  downloadExportReportPdf,
  fetchExportReportData,
} from "@/lib/export-all-report";

export function ExportAllPdfButton({ className }: { className?: string }) {
  const supabase = useMemo(() => createClient(), []);

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultExportDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function runExport() {
    const reportDate = date.trim().slice(0, 10);
    if (!reportDate) {
      setError("Choose a report date.");
      return;
    }

    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const data = await fetchExportReportData(supabase, { date: reportDate });
      const blob = await buildExportReportPdf(data);
      downloadExportReportPdf(blob, `printshop_full_export_${reportDate}`);
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
          setOpen(true);
          setError(null);
          setDone(false);
          setDate(defaultExportDate());
        }}
      >
        <FileText className="mr-2 h-4 w-4" />
        Export everything as PDF
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Full export (single PDF)" size="md">
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Downloads <strong>one PDF</strong> for the date you pick: stock inventory, ready-made sheets, finance
            balances, money in/out, sales, expenses, and activity log.
          </p>
          <p className="text-xs text-muted-foreground">
            Inventory and ready-made are always the <strong>current snapshot</strong>. Sales, expenses, money flow,
            and activity log are filtered to the selected date only.
          </p>

          <div>
            <Label htmlFor="pdf-date">Report date</Label>
            <Input
              id="pdf-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 max-w-[12rem]"
            />
          </div>

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
