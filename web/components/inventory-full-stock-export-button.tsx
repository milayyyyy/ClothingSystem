"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localTodayYmd } from "@/lib/sales-list";
import {
  buildInventoryStockPdf,
  downloadCsvFile,
  downloadPdfBlob,
  exportDateTag,
  fetchAllInventoryStock,
  fetchReadyMadeStockGrids,
  inventoryExportFilename,
  inventoryStockToCsv,
  readyMadeExportFilename,
  readyMadeStockGridsToCsv,
} from "@/lib/inventory-stock-export";

export type StockExportMode = "both" | "inventory" | "ready-made";

type Props = {
  className?: string;
  compact?: boolean;
  /** Which file(s) to download. Default: both. */
  mode?: StockExportMode;
};

function buttonLabel(mode: StockExportMode) {
  if (mode === "inventory") return "Export inventory";
  if (mode === "ready-made") return "Export ready-made";
  return "Export all stock";
}

function dialogTitle(mode: StockExportMode) {
  if (mode === "inventory") return "Export stock inventory";
  if (mode === "ready-made") return "Export ready-made inventory";
  return "Export stock";
}

function dialogDescription(mode: StockExportMode) {
  if (mode === "inventory") {
    return "Pick one day. The file shows stock as of the end of that day (not today's quantities unless you pick today).";
  }
  if (mode === "ready-made") {
    return "Pick one day. Ready-made sheet grids use cell values as of the end of that day.";
  }
  return "Pick one day. Inventory and ready-made exports use stock as of the end of that day.";
}

function csvActionLabel(mode: StockExportMode) {
  return mode === "both" ? "Download CSVs" : "Download CSV";
}

export function InventoryFullStockExportButton({ className, mode = "both" }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inventory: number; readyMadeSheets: number; readyMadeCells: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [asOfYmd, setAsOfYmd] = useState(localTodayYmd);

  function errorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
    return "Export failed";
  }

  async function runExport(format: "csv" | "pdf") {
    setBusy(true);
    setError(null);
    setResult(null);
    const supabase = createClient();
    const asOf = asOfYmd || localTodayYmd();
    const tag = exportDateTag(asOf);
    const asOfOpts = { asOfYmd: asOf };
    let inventoryCount = 0;
    let readyMadeSheets = 0;
    let readyMadeCells = 0;
    const failures: string[] = [];

    const exportInventory = mode === "both" || mode === "inventory";
    const exportReadyMade = mode === "both" || mode === "ready-made";

    try {
      const inventory = exportInventory ? await fetchAllInventoryStock(supabase, asOfOpts) : [];
      inventoryCount = inventory.length;
      const grids = exportReadyMade ? await fetchReadyMadeStockGrids(supabase, asOfOpts) : [];
      readyMadeSheets = grids.length;
      readyMadeCells = grids.reduce(
        (n, g) => n + g.rows.reduce((m, r) => m + Math.max(r.values.length, g.columns.length ? 0 : 1), 0),
        0,
      );

      if (format === "pdf") {
        const blob = await buildInventoryStockPdf({
          ...(exportInventory ? { inventory } : {}),
          ...(exportReadyMade ? { readyMade: grids } : {}),
          asOfYmd: asOf,
        });
        const name =
          mode === "ready-made"
            ? `ready_made_inventory_${tag}`
            : mode === "inventory"
              ? `inventory_stock_${tag}`
              : `all_stock_${tag}`;
        downloadPdfBlob(blob, name);
      } else {
        if (exportInventory) {
          downloadCsvFile(inventoryStockToCsv(inventory), inventoryExportFilename(tag));
        }
        if (exportReadyMade) {
          if (exportInventory) await new Promise((r) => setTimeout(r, 300));
          downloadCsvFile(readyMadeStockGridsToCsv(grids), readyMadeExportFilename(tag));
        }
      }

      if (inventoryCount > 0 || readyMadeSheets > 0) {
        setResult({ inventory: inventoryCount, readyMadeSheets, readyMadeCells });
      } else {
        setError("No stock rows to export.");
      }
    } catch (e: unknown) {
      failures.push(errorMessage(e));
    }

    if (failures.length > 0) {
      setError(failures.join(" "));
    }
    setBusy(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={() => {
          setOpen(true);
          setResult(null);
          setError(null);
          setAsOfYmd(localTodayYmd());
        }}
      >
        <Download className="mr-1.5 h-4 w-4" />
        {buttonLabel(mode)}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title={dialogTitle(mode)} size="md">
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">{dialogDescription(mode)}</p>
          <div>
            <Label htmlFor="stock-export-date">Stock date</Label>
            <Input
              id="stock-export-date"
              type="date"
              className="mt-1 max-w-[12rem]"
              value={asOfYmd}
              max={localTodayYmd()}
              onChange={(e) => setAsOfYmd(e.target.value.slice(0, 10))}
            />
            <p className="mt-1 text-xs text-muted-foreground">One day only. Leave as today for current stock.</p>
          </div>
          {error && <p className="text-destructive">{error}</p>}
          {result && (
            <p className="text-green-600 dark:text-green-400">
              {mode === "inventory" && (
                <>
                  Downloaded {result.inventory} inventory row{result.inventory === 1 ? "" : "s"}.
                </>
              )}
              {mode === "ready-made" && (
                <>
                  Downloaded {result.readyMadeSheets} sheet{result.readyMadeSheets === 1 ? "" : "s"} (
                  {result.readyMadeCells} stock cell{result.readyMadeCells === 1 ? "" : "s"}).
                </>
              )}
              {mode === "both" && (
                <>
                  Downloaded {result.inventory} inventory row{result.inventory === 1 ? "" : "s"} and{" "}
                  {result.readyMadeSheets} ready-made sheet{result.readyMadeSheets === 1 ? "" : "s"}.
                </>
              )}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="button" variant="outline" onClick={() => void runExport("csv")} disabled={busy || !asOfYmd}>
              <Download className="mr-1.5 h-4 w-4" />
              {busy ? "Preparing…" : csvActionLabel(mode)}
            </Button>
            <Button type="button" onClick={() => void runExport("pdf")} disabled={busy || !asOfYmd}>
              <FileText className="mr-1.5 h-4 w-4" />
              {busy ? "Preparing…" : "Download PDF"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
