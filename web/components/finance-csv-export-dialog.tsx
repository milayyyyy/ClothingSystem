"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchFinanceMergedCsv } from "@/lib/finance-csv-export";

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

export function FinanceCsvExportDialog({ supabase }: { supabase: SupabaseClient }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";

  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [allTime, setAllTime] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ accounts: number; txs: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doExport() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { csv, accountCount, txCount } = await fetchFinanceMergedCsv(
        supabase,
        allTime ? null : from || null,
        allTime ? null : to || null,
      );
      if (accountCount === 0 && txCount === 0) {
        setResult({ accounts: 0, txs: 0 });
        return;
      }
      const rangeTag = allTime ? "all" : `${from}_${to}`;
      downloadCsv(csv, `finance_${rangeTag}`);
      setResult({ accounts: accountCount, txs: txCount });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setOpen(true); setResult(null); setError(null); }}>
        <Download className="mr-1.5 h-4 w-4" />
        Export CSV
      </Button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Export finance to CSV" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Downloads one file with an <strong>Accounts</strong> section (current balances) and a{" "}
            <strong>Money flow</strong> section. Each in/out row includes the account balance after that entry.
          </p>

          <div className="flex items-center gap-2">
            <input
              id="finance-csv-all-time"
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={allTime}
              onChange={(e) => setAllTime(e.target.checked)}
            />
            <Label htmlFor="finance-csv-all-time" className="cursor-pointer font-normal">
              All money flow (ignore date range)
            </Label>
          </div>

          <div className={`grid grid-cols-2 gap-3 transition-opacity ${allTime ? "pointer-events-none opacity-40" : ""}`}>
            <div>
              <Label htmlFor="finance-csv-from">Money flow from</Label>
              <Input
                id="finance-csv-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                disabled={allTime}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="finance-csv-to">Money flow to</Label>
              <Input
                id="finance-csv-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                disabled={allTime}
                className="mt-1"
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && result.accounts === 0 && result.txs === 0 && (
            <p className="text-sm text-muted-foreground">No accounts or money flow to export.</p>
          )}
          {result && (result.accounts > 0 || result.txs > 0) && (
            <p className="text-sm text-green-600 dark:text-green-400">
              ✓ Downloaded {result.accounts} account{result.accounts !== 1 ? "s" : ""} and {result.txs} money flow row
              {result.txs !== 1 ? "s" : ""}.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
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
