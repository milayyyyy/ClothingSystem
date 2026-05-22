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
  filterNewExpenseImports,
  parseExpensesWorkbook,
  type ParsedExpenseImportRow,
} from "@/lib/expenses-excel-import";
import { insertExpensesBatched } from "@/lib/expenses-batch-db";

type ExistingExpense = {
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
};

export function ExpensesExcelImportButton({
  existing,
  onImported,
}: {
  existing: ExistingExpense[];
  onImported: () => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedExpenseImportRow[]>([]);
  const [skipReasons, setSkipReasons] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { toImport, duplicates } = useMemo(
    () => filterNewExpenseImports(parsed, existing),
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
      const result = parseExpensesWorkbook(wb);
      setParsed(result.rows);
      setSkipReasons(result.skipReasons);
      setSheetName(result.sheetName);
      setFileName(file.name);
      if (result.rows.length === 0) {
        setError(
          result.skipReasons.length
            ? result.skipReasons.join(" ")
            : "No expense rows found. Use the Expenses table sheet (DATE, EXPENSE CATEGORY, TOTAL EXPENSES).",
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
        expense_date: row.expense_date,
        category: row.category,
        description: row.description,
        amount: row.amount,
        notes: [row.notes, `Imported from Excel (${fileName || "file"}).`].filter(Boolean).join(" · "),
        supplier_id: null,
        paid_through: null,
        finance_account_id: null,
        receipt_path: null,
      }));

      const { insertedCount } = await insertExpensesBatched(supabase, payloads);
      if (insertedCount < payloads.length) {
        setError(`Only ${insertedCount} of ${payloads.length} expenses were saved. Refresh before importing again.`);
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
        <FileSpreadsheet className="mr-1 h-4 w-4" /> Import Excel
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        title="Import expenses from Excel"
        description="Business Bookkeeping export: sheet with DATE, EXPENSE DESCRIPTION, EXPENSE CATEGORY, TOTAL EXPENSES."
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
            Reads the <span className="font-medium text-foreground">Expenses</span> sheet (e.g. 2.2 Expenses). Each row
            becomes one expense. Imports do not deduct finance accounts — link or adjust balances separately if needed.
          </div>

          <div>
            <Label htmlFor="expenses-import-file">Expenses workbook (.xlsx)</Label>
            <input
              id="expenses-import-file"
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
                  <span className="text-amber-800 dark:text-amber-200">
                    {" "}
                    · {duplicates} duplicate(s) skipped
                  </span>
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
                    <th className="px-2 py-1 text-left">Category</th>
                    <th className="px-2 py-1 text-left">Description</th>
                    <th className="px-2 py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {toImport.slice(0, 40).map((r, i) => (
                    <tr key={`${r.sourceRow}-${i}`} className="border-t">
                      <td className="px-2 py-1 whitespace-nowrap">{formatDate(r.expense_date)}</td>
                      <td className="px-2 py-1">{r.category}</td>
                      <td className="px-2 py-1 max-w-[12rem] truncate">{r.description || "—"}</td>
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
              {saving ? "Importing…" : `Import ${toImport.length} expense(s)`}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
