"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

type Props<T> = {
  label?: string;
  filename: string;
  columns: CsvColumn<T>[];
  /** Pass a function so the dialog can call it with the chosen date range */
  fetchRows: (from: string | null, to: string | null) => Promise<T[]> | T[];
};

function escapeCsv(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const header = columns.map((c) => escapeCsv(c.header)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escapeCsv(c.value(r))).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function CsvExportDialog<T>({ label = "Export CSV", filename, columns, fetchRows }: Props<T>) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";

  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [allTime, setAllTime] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<number | null>(null);

  async function doExport() {
    setBusy(true);
    setCount(null);
    const rows = await fetchRows(allTime ? null : from || null, allTime ? null : to || null);
    setBusy(false);
    if (rows.length === 0) { setCount(0); return; }
    const csv = buildCsv(columns, rows);
    const rangeTag = allTime ? "all" : `${from}_${to}`;
    downloadCsv(csv, `${filename}_${rangeTag}`);
    setCount(rows.length);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setOpen(true); setCount(null); }}>
        <Download className="mr-1.5 h-4 w-4" />
        {label}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Export to CSV" size="sm">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <input
              id="csv-all-time"
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={allTime}
              onChange={(e) => setAllTime(e.target.checked)}
            />
            <Label htmlFor="csv-all-time" className="cursor-pointer font-normal">Export all records (ignore date range)</Label>
          </div>

          <div className={`grid grid-cols-2 gap-3 transition-opacity ${allTime ? "pointer-events-none opacity-40" : ""}`}>
            <div>
              <Label htmlFor="csv-from">From</Label>
              <Input id="csv-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={allTime} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="csv-to">To</Label>
              <Input id="csv-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={allTime} className="mt-1" />
            </div>
          </div>

          {count === 0 && (
            <p className="text-sm text-muted-foreground">No records found for the selected range.</p>
          )}
          {count != null && count > 0 && (
            <p className="text-sm text-green-600 dark:text-green-400">✓ Downloaded {count} row{count !== 1 ? "s" : ""}.</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void doExport()} disabled={busy}>
              <Download className="mr-1.5 h-4 w-4" />
              {busy ? "Preparing…" : "Download CSV"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
