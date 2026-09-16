"use client";

import { useMemo, useState } from "react";
import { FileImage } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildMediaArchivePdf,
  downloadMediaArchivePdf,
  fetchMediaArchiveItems,
  formatMediaArchiveRangeLabel,
  mediaArchiveFilename,
  type MediaArchiveRange,
} from "@/lib/media-archive-export";

function todayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function MediaArchivePdfButton() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayYmd();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [allTime, setAllTime] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<MediaArchiveRange | null>(null);
  const [exportedCount, setExportedCount] = useState(0);
  const [phase, setPhase] = useState<"form" | "cleanup">("form");
  const [cleanupNote, setCleanupNote] = useState<string | null>(null);

  function resetOnOpen() {
    setError(null);
    setStatus(null);
    setCleanupNote(null);
    setPhase("form");
    setRange(null);
    setExportedCount(0);
    setAllTime(false);
    setFrom(monthStart);
    setTo(today);
  }

  async function runExport() {
    const nextRange: MediaArchiveRange = allTime
      ? { from: null, to: null }
      : { from: from || null, to: to || null };
    if (!allTime && (!nextRange.from || !nextRange.to)) {
      setError("Choose a start and end date.");
      return;
    }
    if (!allTime && nextRange.from && nextRange.to && nextRange.from > nextRange.to) {
      setError("Start date must be on or before the end date.");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus("Loading files…");
    setCleanupNote(null);
    try {
      const items = await fetchMediaArchiveItems(supabase, nextRange);
      if (!items.length) {
        setStatus(null);
        setError("No receipts, screenshots, or designs in that date range.");
        return;
      }
      const blob = await buildMediaArchivePdf(items, nextRange, supabase, setStatus);
      downloadMediaArchivePdf(blob, mediaArchiveFilename(nextRange));
      setRange(nextRange);
      setExportedCount(items.length);
      setPhase("cleanup");
      setStatus(`PDF downloaded (${items.length} file${items.length === 1 ? "" : "s"}).`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Export failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function runCleanup() {
    if (!range) return;
    setBusy(true);
    setError(null);
    setCleanupNote(null);
    try {
      const res = await fetch("/api/admin/media-archive-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(range),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Cleanup failed");
      const r = Number(json.receipts) || 0;
      const s = Number(json.screenshots) || 0;
      const d = Number(json.designs) || 0;
      setCleanupNote(
        `Removed ${r} receipt${r === 1 ? "" : "s"}, ${s} screenshot${s === 1 ? "" : "s"}, and ${d} design file${d === 1 ? "" : "s"} for ${formatMediaArchiveRangeLabel(range)}. Expense and order rows were kept.`,
      );
      setPhase("form");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          resetOnOpen();
          setOpen(true);
        }}
      >
        <FileImage className="mr-1.5 h-4 w-4" />
        Export photos as PDF
      </Button>

      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title={phase === "cleanup" ? "Remove exported files?" : "Export receipts, screenshots & designs"}
        description={
          phase === "cleanup"
            ? `PDF is saved. Delete the files from Storage for ${range ? formatMediaArchiveRangeLabel(range) : "this range"}?`
            : "One PDF, grouped by category, with date and name on each file."
        }
        size="md"
      >
        <div className="space-y-4 text-sm">
          {phase === "form" && (
            <>
              <div className="flex items-center gap-2">
                <input
                  id="media-all-time"
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={allTime}
                  onChange={(e) => setAllTime(e.target.checked)}
                  disabled={busy}
                />
                <Label htmlFor="media-all-time" className="cursor-pointer font-normal">
                  All dates
                </Label>
              </div>
              <div className={`grid grid-cols-2 gap-3 ${allTime ? "pointer-events-none opacity-40" : ""}`}>
                <div>
                  <Label htmlFor="media-from">From</Label>
                  <Input
                    id="media-from"
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    disabled={allTime || busy}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="media-to">To</Label>
                  <Input
                    id="media-to"
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    disabled={allTime || busy}
                    className="mt-1"
                  />
                </div>
              </div>
            </>
          )}

          {phase === "cleanup" && (
            <p className="text-muted-foreground">
              {exportedCount} file{exportedCount === 1 ? "" : "s"} were included. Expense records and order sheets stay;
              only the attached photos/PDFs in this date range are removed. This cannot be undone.
            </p>
          )}

          {status && <p className="text-muted-foreground">{status}</p>}
          {cleanupNote && <p className="text-green-600 dark:text-green-400">{cleanupNote}</p>}
          {error && <p className="text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            {phase === "form" ? (
              <>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                  Close
                </Button>
                <Button type="button" onClick={() => void runExport()} disabled={busy}>
                  <FileImage className="mr-1.5 h-4 w-4" />
                  {busy ? "Building PDF…" : "Download PDF"}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
                  Keep files
                </Button>
                <Button type="button" variant="destructive" onClick={() => void runCleanup()} disabled={busy}>
                  {busy ? "Removing…" : "Remove exported files"}
                </Button>
              </>
            )}
          </div>
        </div>
      </Dialog>
    </>
  );
}
