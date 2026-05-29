"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  downloadCsvFile,
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

function buttonLabel(mode: StockExportMode, compact?: boolean) {
  if (mode === "inventory") return compact ? "Export inventory" : "Export inventory (CSV)";
  if (mode === "ready-made") return compact ? "Export ready-made" : "Export ready-made (CSV)";
  return compact ? "Export all stock" : "Export all stock (CSV)";
}

function dialogTitle(mode: StockExportMode) {
  if (mode === "inventory") return "Export stock inventory";
  if (mode === "ready-made") return "Export ready-made inventory";
  return "Export current stock";
}

function dialogDescription(mode: StockExportMode) {
  if (mode === "inventory") {
    return "Downloads one CSV listing all stock inventory items and current quantities.";
  }
  if (mode === "ready-made") {
    return "Downloads one CSV with every sheet group and sheet, each as a stock grid (rows × size columns) — same layout as Ready-made inventory.";
  }
  return "Downloads two CSV files: stock inventory list and ready-made sheet grids.";
}

function downloadActionLabel(mode: StockExportMode) {
  if (mode === "inventory") return "Download inventory CSV";
  if (mode === "ready-made") return "Download ready-made CSV";
  return "Download both CSVs";
}

export function InventoryFullStockExportButton({ className, compact, mode = "both" }: Props) {
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

  async function runExport() {
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

    if (exportInventory) {
      try {
        const inventory = await fetchAllInventoryStock(supabase);
        downloadCsvFile(inventoryStockToCsv(inventory), inventoryExportFilename(tag));
        inventoryCount = inventory.length;
      } catch (e: unknown) {
        failures.push(`Inventory: ${errorMessage(e)}`);
      }
    }

    if (exportReadyMade) {
      try {
        if (exportInventory) await new Promise((r) => setTimeout(r, 300));
        const grids = await fetchReadyMadeStockGrids(supabase);
        downloadCsvFile(readyMadeStockGridsToCsv(grids), readyMadeExportFilename(tag));
        readyMadeSheets = grids.length;
        readyMadeCells = grids.reduce(
          (n, g) => n + g.rows.reduce((m, r) => m + Math.max(r.values.length, g.columns.length ? 0 : 1), 0),
          0,
        );
      } catch (e: unknown) {
        failures.push(`Ready-made: ${errorMessage(e)}`);
      }
    }

    if (inventoryCount > 0 || readyMadeSheets > 0) {
      setResult({ inventory: inventoryCount, readyMadeSheets, readyMadeCells });
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
        {buttonLabel(mode, compact)}
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
            <Button type="button" onClick={() => void runExport()} disabled={busy}>
              <Download className="mr-1.5 h-4 w-4" />
              {busy ? "Preparing…" : downloadActionLabel(mode)}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
