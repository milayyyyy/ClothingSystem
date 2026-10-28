"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
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
  return "Export current stock";
}

function dialogDescription(mode: StockExportMode) {
  if (mode === "inventory") {
    return "Download all stock inventory items and current quantities as CSV or PDF.";
  }
  if (mode === "ready-made") {
    return "Download every sheet group and sheet as a stock grid (rows × size columns) — CSV or PDF, same layout as Ready-made inventory.";
  }
  return "Download stock inventory and ready-made sheet grids as CSV files, or one PDF of all current stock.";
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
    const tag = exportDateTag();
    let inventoryCount = 0;
    let readyMadeSheets = 0;
    let readyMadeCells = 0;
    const failures: string[] = [];

    const exportInventory = mode === "both" || mode === "inventory";
    const exportReadyMade = mode === "both" || mode === "ready-made";

    try {
      const inventory = exportInventory ? await fetchAllInventoryStock(supabase) : [];
      inventoryCount = inventory.length;
      const grids = exportReadyMade ? await fetchReadyMadeStockGrids(supabase) : [];
      readyMadeSheets = grids.length;
      readyMadeCells = grids.reduce(
        (n, g) => n + g.rows.reduce((m, r) => m + Math.max(r.values.length, g.columns.length ? 0 : 1), 0),
        0,
      );

      if (format === "pdf") {
        const blob = await buildInventoryStockPdf({
          ...(exportInventory ? { inventory } : {}),
          ...(exportReadyMade ? { readyMade: grids } : {}),
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
        }}
      >
        <Download className="mr-1.5 h-4 w-4" />
        {buttonLabel(mode)}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title={dialogTitle(mode)} size="md">
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">{dialogDescription(mode)}</p>
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
            <Button type="button" variant="outline" onClick={() => void runExport("csv")} disabled={busy}>
              <Download className="mr-1.5 h-4 w-4" />
              {busy ? "Preparing…" : csvActionLabel(mode)}
            </Button>
            <Button type="button" onClick={() => void runExport("pdf")} disabled={busy}>
              <FileText className="mr-1.5 h-4 w-4" />
              {busy ? "Preparing…" : "Download PDF"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
