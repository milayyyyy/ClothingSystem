"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatSupabaseError, peso, formatDate } from "@/lib/utils";
import { FileSpreadsheet } from "lucide-react";
import {
  filterNewRevenueImports,
  parseRevenueWorkbook,
  type ParsedRevenueImportRow,
} from "@/lib/revenue-excel-import";
import { insertManualSalesBatched } from "@/lib/manual-sales-batch-db";

export type ExistingManualSale = {
  sale_date: string;
  revenue_channel: string | null;
  product_service: string | null;
  description: string;
  amount: number;
  import_key?: string | null;
};

export function RevenueExcelImportButton({
  existing,
  onImported,
}: {
  existing: ExistingManualSale[];
  onImported: () => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedRevenueImportRow[]>([]);
  const [skipReasons, setSkipReasons] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { toImport, duplicates } = useMemo(
    () => filterNewRevenueImports(parsed, existing),
    [parsed, existing],
  );

  const importTotal = useMemo(() => toImport.reduce((s, r) => s + r.amount, 0), [toImport]);

  function reset() {
    setFileName("");
    setParsed([]);
    setSkipReasons([]);
    setSheetName(null);
    setError("");
  }

  async function parseFile(file: File) {
    setParsing(true);
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const result = parseRevenueWorkbook(wb);
      setParsed(result.rows);
      setSkipReasons(result.skipReasons);
      setSheetName(result.sheetName);
      setFileName(file.name);
      if (result.rows.length === 0) {
        setError(
          result.skipReasons.length
            ? result.skipReasons.join(" ")
            : "No revenue rows found. Use the Revenue sheet (DATE, REVENUE CHANNEL, REVENUE).",
        );
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to read file");
      setParsed([]);
    } finally {
      setParsing(false);
    }
  }

  async function runImport() {
    if (toImport.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const payloads = toImport.map((row) => ({
        sale_date: row.sale_date,
        amount: row.amount,
        description: row.description,
        channel: row.channel,
        revenue_channel: row.revenue_channel,
        product_service: row.product_service,
        external_id: row.external_id,
        import_key: row.import_key,
        notes: [row.notes, `Imported from Excel (${fileName || "file"}).`].filter(Boolean).join(" · "),
      }));

      const { insertedCount } = await insertManualSalesBatched(supabase, payloads);
      if (insertedCount < payloads.length) {
        setError(`Only ${insertedCount} of ${payloads.length} rows were saved. Refresh before importing again.`);
        onImported();
        return;
      }
      setOpen(false);
      reset();
      onImported();
    } catch (e: unknown) {
      setError(formatSupabaseError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="mr-1 h-4 w-4" /> Import revenue Excel
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="Import revenue from Excel"
        description="Business Bookkeeping export: sheet with DATE, PRODUCT/SERVICE, REVENUE CHANNEL, REVENUE."
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
            Reads the <span className="font-medium text-foreground">Revenue</span> sheet (e.g. 2.1 Revenue). Each row
            is saved as a manual sale and appears in this sales list. BigSeller marketplace orders stay separate.
          </div>

          <div>
            <Label htmlFor="revenue-import-file">Revenue workbook (.xlsx)</Label>
            <input
              id="revenue-import-file"
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="mt-1 block w-full text-sm"
              disabled={parsing || saving}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void parseFile(f);
                e.target.value = "";
              }}
            />
            {parsing && <p className="mt-1 text-xs text-muted-foreground">Reading spreadsheet…</p>}
          </div>

          {parsed.length > 0 && (
            <div className="rounded-md border p-3 text-sm">
              {sheetName && (
                <p>
                  Sheet: <span className="font-medium text-foreground">{sheetName}</span>
                  {fileName ? ` · ${fileName}` : ""}
                </p>
              )}
              <p className="mt-1">
                <span className="font-medium text-foreground">{parsed.length}</span> row(s) in file ·{" "}
                <span className="font-medium text-emerald-700 dark:text-emerald-400">{toImport.length}</span> to import
                {duplicates > 0 && (
                  <span className="text-amber-800 dark:text-amber-200"> · {duplicates} duplicate(s) skipped</span>
                )}
              </p>
              {toImport.length > 0 && (
                <p className="mt-1 text-muted-foreground">
                  Import total: <span className="font-medium text-foreground">{peso(importTotal)}</span>
                </p>
              )}
              {skipReasons.map((r) => (
                <p key={r} className="mt-1 text-xs text-muted-foreground">
                  {r}
                </p>
              ))}
            </div>
          )}

          {toImport.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-md border text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-muted/80">
                  <tr>
                    <th className="px-2 py-1 text-left">Date</th>
                    <th className="px-2 py-1 text-left">Channel</th>
                    <th className="px-2 py-1 text-left">Product</th>
                    <th className="px-2 py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {toImport.slice(0, 40).map((r, i) => (
                    <tr key={`${r.sourceRow}-${i}`} className="border-t">
                      <td className="px-2 py-1 whitespace-nowrap">{formatDate(r.sale_date)}</td>
                      <td className="px-2 py-1 max-w-[8rem] truncate">{r.revenue_channel}</td>
                      <td className="px-2 py-1 max-w-[10rem] truncate">{r.product_service || r.description}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{peso(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {toImport.length > 40 && (
                <p className="border-t px-2 py-1 text-muted-foreground">…and {toImport.length - 40} more</p>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void runImport()} disabled={saving || parsing || toImport.length === 0}>
              {saving ? "Importing…" : `Import ${toImport.length} row(s)`}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
