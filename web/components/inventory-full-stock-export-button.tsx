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
  fetchReadyMadeStockFlat,
  inventoryStockToCsv,
  readyMadeStockToCsv,
} from "@/lib/inventory-stock-export";

type Props = {
  className?: string;
  compact?: boolean;
};

export function InventoryFullStockExportButton({ className, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ inventory: number; readyMade: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runExport() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const supabase = createClient();
      const [inventory, readyMade] = await Promise.all([
        fetchAllInventoryStock(supabase),
        fetchReadyMadeStockFlat(supabase),
      ]);
      const tag = exportDateTag();
      downloadCsvFile(inventoryStockToCsv(inventory), `inventory_stock_${tag}`);
      await new Promise((r) => setTimeout(r, 300));
      downloadCsvFile(readyMadeStockToCsv(readyMade), `ready_made_stock_${tag}`);
      setResult({ inventory: inventory.length, readyMade: readyMade.length });
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
        {compact ? "Export all stock" : "Export all stock (CSV)"}
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Export current stock" size="md">
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Downloads two CSV files with current quantities: stock inventory and ready-made sheets.
          </p>
          {error && <p className="text-destructive">{error}</p>}
          {result && (
            <p className="text-green-600 dark:text-green-400">
              Downloaded {result.inventory} inventory row{result.inventory === 1 ? "" : "s"} and {result.readyMade}{" "}
              ready-made cell{result.readyMade === 1 ? "" : "s"}.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="button" onClick={() => void runExport()} disabled={busy}>
              <Download className="mr-1.5 h-4 w-4" />
              {busy ? "Preparing…" : "Download both CSVs"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
