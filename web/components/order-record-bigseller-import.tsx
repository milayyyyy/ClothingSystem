"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  buildBigSellerImportResultForRecord,
  linesFromExcelOrders,
  linesFromPdfRows,
  mergeBigSellerImportIntoSheets,
  SHIRT_SIZE_LABELS,
  type BigSellerImportResult,
} from "@/lib/order-record-bigseller-import";
import { parseBigSellerExcelRows, pickMarketplaceOrderSheetName } from "@/lib/bigseller-excel-import";
import { parseBigSellerRowsFromText } from "@/lib/bigseller-pdf-pick-list";
import type { ManualUsageSheet } from "@/lib/order-records";
import { FileSpreadsheet, FileText, Loader2, Upload } from "lucide-react";

type Props = {
  disabled?: boolean;
  existingSheets: ManualUsageSheet[];
  onApply: (sheets: ManualUsageSheet[], summary: string) => void;
};

async function parseBigSellerExcelFileRaw(file: File) {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = pickMarketplaceOrderSheetName(wb);
  if (!sheetName) throw new Error("Workbook has no sheets.");
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "" });
  return parseBigSellerExcelRows(rawRows);
}

async function parseBigSellerPdfFileRaw(file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfVersion = (pdfjs as { version?: string }).version ?? "5.7.284";
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfVersion}/build/pdf.worker.min.mjs`;
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  const chunks: string[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const text = await page.getTextContent();
    const pageText = text.items
      .map((it) => ("str" in it ? String(it.str || "").trim() : ""))
      .filter(Boolean)
      .join("\n");
    chunks.push(pageText);
  }
  const joined = chunks.join("\n");
  const parsed = parseBigSellerRowsFromText(joined);
  if (parsed.length === 0) {
    throw new Error("No orders found. Use a BigSeller Summary List or Pick List PDF export.");
  }
  return { lines: linesFromPdfRows(parsed), format: "pdf" as const };
}

export function OrderRecordBigSellerImport({ disabled, existingSheets, onApply }: Props) {
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<BigSellerImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    const name = file.name.toLowerCase();
    setParsing(true);
    setError("");
    setPreview(null);
    try {
      let result: BigSellerImportResult;
      if (name.endsWith(".pdf")) {
        const { lines, format } = await parseBigSellerPdfFileRaw(file);
        result = buildBigSellerImportResultForRecord(lines, existingSheets, { format });
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) {
        const parsed = await parseBigSellerExcelFileRaw(file);
        if (parsed.orders.length === 0) {
          const hint = parsed.skipReasons.length ? ` ${parsed.skipReasons.join("; ")}` : "";
          throw new Error(`No completed orders found in this file.${hint}`);
        }
        const lines = linesFromExcelOrders(parsed.orders);
        result = buildBigSellerImportResultForRecord(lines, existingSheets, {
          skippedRows: parsed.skippedRows,
          format: parsed.format,
        });
      } else {
        throw new Error("Upload a BigSeller Excel (.xlsx) or Pick List / Summary PDF.");
      }
      if (result.lines.length === 0 && (result.duplicateCount ?? 0) > 0) {
        setError(
          `All ${result.duplicateCount} line(s) from this file are already on this record. Nothing new to import.`,
        );
        setPreview(null);
        return;
      }
      if (result.lines.length === 0) {
        throw new Error("No new orders to import.");
      }
      setPreview(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setParsing(false);
    }
  }

  async function onFiles(files: FileList | File[] | null) {
    const file = files && files[0];
    if (!file) return;
    await handleFile(file);
  }

  function applyImport() {
    if (!preview || preview.lines.length === 0) return;
    const dup = preview.duplicateCount ?? 0;
    const summary = `${preview.orderCount} new order(s), ${preview.lines.length} new line(s)${dup ? ` (${dup} duplicate(s) skipped)` : ""} · Black ${preview.blackTotal} · White ${preview.whiteTotal}`;
    const merged = mergeBigSellerImportIntoSheets(existingSheets, preview.lines);
    onApply(merged, summary);
    setPreview(null);
    setError("");
  }

  const dropDisabled = disabled || parsing;

  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div>
        <Label>Import BigSeller orders</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Upload BigSeller Excel or Pick List PDF. Orders already on this record are skipped; only new
          lines are added. Totals are recalculated from all order lines.
        </p>
      </div>

      <div
        className={cn(
          "rounded-lg border-2 border-dashed p-5 text-center transition-colors",
          dragOver && !dropDisabled && "border-primary bg-primary/5",
          !dragOver && "border-muted-foreground/25",
          dropDisabled && "pointer-events-none opacity-60",
        )}
        onDragOver={(e) => {
          if (dropDisabled) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          if (dropDisabled) return;
          e.preventDefault();
          setDragOver(false);
          void onFiles(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          className="sr-only"
          id="bigseller-order-record-import"
          accept=".xlsx,.xls,.csv,.pdf,application/pdf"
          disabled={dropDisabled}
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <label
          htmlFor="bigseller-order-record-import"
          className={cn("flex cursor-pointer flex-col items-center gap-2", dropDisabled && "cursor-not-allowed")}
        >
          {parsing ? (
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          ) : (
            <div className="flex gap-2 text-muted-foreground">
              <FileSpreadsheet className="h-7 w-7" />
              <FileText className="h-7 w-7" />
            </div>
          )}
          <span className="text-sm font-medium">
            {parsing ? "Reading file…" : dragOver ? "Drop file here" : "Drag Excel or PDF here"}
          </span>
          <span className="text-xs text-muted-foreground">or click to browse</span>
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {preview && (
        <div className="space-y-3 rounded-md border bg-background p-3 text-sm">
          <p className="font-medium">Ready to import (new only)</p>
          <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <li>{preview.orderCount} new orders</li>
            <li>{preview.lines.length} new line items</li>
            {(preview.duplicateCount ?? 0) > 0 && (
              <li className="text-amber-600 dark:text-amber-400">
                {preview.duplicateCount} duplicate(s) skipped
              </li>
            )}
            <li>Black shirts (new): {preview.blackTotal}</li>
            <li>White shirts (new): {preview.whiteTotal}</li>
            <li>Sized lines: {preview.linesWithSize}</li>
            {preview.format && <li>Format: {preview.format}</li>}
            {preview.skippedRows != null && preview.skippedRows > 0 && (
              <li>{preview.skippedRows} file rows skipped</li>
            )}
          </ul>
          <p className="text-xs text-muted-foreground">
            New lines are appended to BigSeller order lines; size totals are refreshed for all lines.
            Your other manual sheets are unchanged.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={applyImport}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              Add to usage sheets
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setPreview(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
