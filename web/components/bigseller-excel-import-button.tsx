"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { ADMIN_ORDERS_SELECT } from "@/lib/admin-orders-select";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn, formatSupabaseError, peso } from "@/lib/utils";
import { FileSpreadsheet } from "lucide-react";
import {
  buildHistoricalBigSellerOrderPayload,
  parseBigSellerExcelRows,
  parsePlatformSkuVariation,
  pickMarketplaceOrderSheetName,
  type BigSellerExcelFormat,
  type BigSellerExcelGroupedOrder,
} from "@/lib/bigseller-excel-import";
import { resolveStoreId, type StoreOption } from "@/lib/bigseller-store-resolve";
import {
  fetchExistingImportDedupeSets,
  orderMatchesImportDedupe,
  type ImportDedupeSets,
} from "@/lib/bigseller-import-dedupe";
import { fetchOrdersByIdsBatched, insertOrdersBatched } from "@/lib/orders-batch-db";

const selectClass = cn(
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary",
);

function storeLabelForOrder(
  storeList: StoreOption[],
  order: BigSellerExcelGroupedOrder,
  manualStoreId: string,
): string {
  if (manualStoreId) {
    return storeList.find((s) => s.id === manualStoreId)?.name ?? "—";
  }
  const { matchedName } = resolveStoreId(storeList, order.storeName);
  return matchedName || order.storeName || "—";
}

export function BigSellerExcelImportButton({
  onImported,
}: {
  onImported: (insertedRows: Record<string, unknown>[]) => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [orderFormat, setOrderFormat] = useState<BigSellerExcelFormat | null>(null);
  const [orders, setOrders] = useState<BigSellerExcelGroupedOrder[]>([]);
  const [pendingSettlementCount, setPendingSettlementCount] = useState(0);
  const [sheetRows, setSheetRows] = useState(0);
  const [mergedSkuRows, setMergedSkuRows] = useState(0);
  const [skippedRows, setSkippedRows] = useState(0);
  const [skipReasons, setSkipReasons] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  /** Applies to every order in this import when set (overrides file store column). */
  const [manualStoreId, setManualStoreId] = useState("");
  const [dedupeSets, setDedupeSets] = useState<ImportDedupeSets>({
    packages: new Set(),
    external: new Set(),
    waybills: new Set(),
  });
  const [dedupeLoading, setDedupeLoading] = useState(false);

  async function refreshDedupeSets() {
    setDedupeLoading(true);
    const { sets, error } = await fetchExistingImportDedupeSets(supabase);
    setDedupeSets(sets);
    setDedupeLoading(false);
    if (error) console.warn("Could not load existing orders for duplicate check:", error);
    return sets;
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: storeData } = await supabase.from("stores").select("id,name,pdf_label").order("name");
      if (cancelled) return;
      setStores((storeData as StoreOption[]) || []);
      if (!cancelled) await refreshDedupeSets();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supabase]);

  useEffect(() => {
    if (open) return;
    setOrders([]);
    setSkippedRows(0);
    setSkipReasons([]);
    setFileName("");
    setOrderFormat(null);
    setPendingSettlementCount(0);
    setSheetRows(0);
    setMergedSkuRows(0);
    setError("");
    setManualStoreId("");
  }, [open]);

  function applyParseResult(
    result: ReturnType<typeof parseBigSellerExcelRows>,
    orderFileLabel: string,
  ) {
    setOrders(result.orders);
    setSkippedRows(result.skippedRows);
    setSkipReasons(result.skipReasons);
    setOrderFormat(result.format);
    setPendingSettlementCount(result.orders.filter((o) => o.unitPricePendingSettlement).length);
    setSheetRows(result.sheetRows);
    setMergedSkuRows(result.mergedSkuRows);
    setFileName(orderFileLabel);
    if (result.orders.length === 0) {
      setError(
        result.skipReasons.length
          ? `No orders to import. Skipped: ${result.skipReasons.join(", ")}.`
          : "No completed orders found in this file.",
      );
    } else {
      setError("");
    }
  }

  async function runParse(rawRows: Record<string, unknown>[], orderFileLabel: string) {
    await refreshDedupeSets();
    const result = parseBigSellerExcelRows(rawRows);
    applyParseResult(result, orderFileLabel);
  }

  const { toImport, duplicates } = useMemo(() => {
    const dup: BigSellerExcelGroupedOrder[] = [];
    const ok: BigSellerExcelGroupedOrder[] = [];
    for (const o of orders) {
      if (orderMatchesImportDedupe(o, dedupeSets)) dup.push(o);
      else ok.push(o);
    }
    return { toImport: ok, duplicates: dup };
  }, [orders, dedupeSets]);

  const ordersMissingStoreInFile = useMemo(
    () => toImport.filter((o) => !o.storeName.trim()).length,
    [toImport],
  );

  async function parseOrdersFile(file: File) {
    setParsing(true);
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = pickMarketplaceOrderSheetName(wb);
      if (!sheetName) throw new Error("Workbook has no sheets.");
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
        defval: "",
      });
      setManualStoreId("");
      await runParse(rawRows, file.name);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to read orders file");
      setOrders([]);
    } finally {
      setParsing(false);
    }
  }

  async function importOrders() {
    if (toImport.length === 0) return;
    setSaving(true);
    setError("");
    try {
      let storeList = stores;
      if (storeList.length === 0) {
        const { data } = await supabase.from("stores").select("id,name,pdf_label").order("name");
        storeList = (data as StoreOption[]) || [];
        setStores(storeList);
      }

      const manualStore = manualStoreId ? storeList.find((s) => s.id === manualStoreId) : null;
      const payload = toImport.map((order) => {
        let storeId: string | null = null;
        let storeLabel: string | null = null;
        if (manualStore) {
          storeId = manualStore.id;
          storeLabel = manualStore.name;
        } else {
          const resolved = resolveStoreId(storeList, order.storeName);
          storeId = resolved.id;
          storeLabel = resolved.matchedName || order.storeName || null;
        }
        return buildHistoricalBigSellerOrderPayload(order, {
          fileName,
          storeId,
          storeLabel,
        });
      });

      let ids: string[] = [];
      try {
        const result = await insertOrdersBatched(supabase, payload);
        ids = result.ids;
      } catch (insertErr: unknown) {
        const msg = formatSupabaseError(insertErr);
        const details = (insertErr as { details?: string })?.details;
        setError(
          details
            ? `${msg} ${details} Refresh the page before importing again — some rows may have been saved.`
            : msg,
        );
        await refreshDedupeSets();
        return;
      }

      if (payload.length > 0 && ids.length === 0) {
        setError("Import may have succeeded but no row ids returned. Refresh before importing again.");
        onImported([]);
        return;
      }

      if (ids.length < payload.length) {
        setError(
          `Only ${ids.length} of ${payload.length} orders were saved. Refresh the page — do not import the full file again.`,
        );
        await refreshDedupeSets();
        return;
      }

      let inserted: Record<string, unknown>[] = [];
      try {
        inserted = await fetchOrdersByIdsBatched(supabase, ids, ADMIN_ORDERS_SELECT);
      } catch (loadErr: unknown) {
        setError(
          `Imported ${ids.length} order(s), but could not load them for preview (${formatSupabaseError(loadErr)}). Refresh the page — do not import again.`,
        );
        await refreshDedupeSets();
        setOpen(false);
        onImported([]);
        return;
      }

      await refreshDedupeSets();
      setOpen(false);
      onImported(inserted);
    } catch (e: unknown) {
      setError(formatSupabaseError(e));
    } finally {
      setSaving(false);
    }
  }

  const importTotal = toImport.reduce((s, o) => s + o.orderTotal, 0);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="mr-1 h-4 w-4" /> Import historical Excel
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Import BigSeller Excel (historical)"
        description="BigSeller, Shopee, or TikTok Shop completed order exports — recorded as completed and fully withdrawn (no finance entries)."
        size="xl"
      >
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
            Upload <span className="font-medium text-foreground">Order-SKU</span> (BigSeller),{" "}
            <span className="font-medium text-foreground">Order.completed</span> (Shopee), or{" "}
            <span className="font-medium text-foreground">Completed order</span> (TikTok Shop).
            Shopee uses <span className="font-medium text-foreground">Products&apos; Price Paid by Buyer</span>. TikTok
            orders import with no price until you run{" "}
            <span className="font-medium text-foreground">Apply TikTok settlement</span> with the Finance settlement file.
          </div>
          <div className="space-y-3">
            <div>
              <Label htmlFor="bigseller-orders-file">Orders export (.xlsx)</Label>
              <input
                id="bigseller-orders-file"
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="mt-1 block w-full text-sm"
                disabled={parsing || saving}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  void parseOrdersFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            {parsing && (
              <p className="text-xs text-muted-foreground">
                {dedupeLoading ? "Checking existing orders & reading spreadsheet…" : "Reading spreadsheet…"}
              </p>
            )}
          </div>

          {orders.length > 0 && (
            <div className="space-y-2 rounded-md border p-3">
              <div>
                <Label htmlFor="bigseller-excel-store">Store for imported orders</Label>
                <select
                  id="bigseller-excel-store"
                  className={cn(selectClass, "mt-1")}
                  value={manualStoreId}
                  disabled={parsing || saving || stores.length === 0}
                  onChange={(e) => setManualStoreId(e.target.value)}
                >
                  <option value="">Auto from file (PDF label match)</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.pdf_label ? ` — PDF: ${s.pdf_label}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              {ordersMissingStoreInFile > 0 && !manualStoreId && (
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  {ordersMissingStoreInFile} order(s) have no store in the file (e.g. Shopee Order.completed). Select a
                  store above to assign <span className="font-medium">all {toImport.length}</span> imports to that store.
                </p>
              )}
              {manualStoreId && toImport.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  All {toImport.length} order(s) will use{" "}
                  <span className="font-medium text-foreground">
                    {stores.find((s) => s.id === manualStoreId)?.name ?? "selected store"}
                  </span>
                  .
                </p>
              )}
            </div>
          )}

          {orders.length > 0 && (
            <div className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {sheetRows > 0 && (
                  <span>
                    <span className="font-medium text-foreground">{sheetRows}</span> row(s) in file
                  </span>
                )}
                <span>
                  <span className="font-medium text-foreground">{orders.length}</span> order(s)
                  {mergedSkuRows > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({mergedSkuRows} extra product line{mergedSkuRows === 1 ? "" : "s"} merged)
                    </span>
                  )}
                </span>
                <span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">{toImport.length}</span> to import
                </span>
                {duplicates.length > 0 && (
                  <span>
                    <span className="font-medium text-amber-700 dark:text-amber-400">{duplicates.length}</span> duplicate
                    (skipped)
                  </span>
                )}
                {skippedRows > 0 && (
                  <span className="text-muted-foreground">{skippedRows} row(s) skipped in file</span>
                )}
                {orderFormat === "tiktok_order_sku" && (
                  <span className="text-muted-foreground">TikTok Shop format</span>
                )}
              </div>
              {pendingSettlementCount > 0 && orderFormat === "tiktok_order_sku" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Totals are hidden until settlement — run{" "}
                  <span className="font-medium text-foreground">Apply TikTok settlement</span> to set unit prices.
                </p>
              )}
              {toImport.length > 0 && orderFormat !== "tiktok_order_sku" && (
                <p className="mt-2 text-muted-foreground">
                  Import total (new orders): <span className="font-medium text-foreground">{peso(importTotal)}</span>
                </p>
              )}
            </div>
          )}

          {toImport.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-md border text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-muted/80">
                  <tr>
                    <th className="px-2 py-1 text-left">Package</th>
                    <th className="px-2 py-1 text-left">Order no.</th>
                    <th className="px-2 py-1 text-left">Store</th>
                    {orderFormat === "tiktok_order_sku" ? (
                      <>
                        <th className="px-2 py-1 text-left">Type</th>
                        <th className="px-2 py-1 text-left">Size</th>
                      </>
                    ) : (
                      <th className="px-2 py-1 text-right">Total</th>
                    )}
                    <th className="px-2 py-1 text-left">Items</th>
                  </tr>
                </thead>
                <tbody>
                  {toImport.slice(0, 50).map((o) => (
                    <tr key={o.packageNo} className="border-t">
                      <td className="px-2 py-1 font-mono">{o.packageNo}</td>
                      <td className="px-2 py-1 font-mono">{o.externalOrderNo}</td>
                      <td className="px-2 py-1">{storeLabelForOrder(stores, o, manualStoreId)}</td>
                      {orderFormat === "tiktok_order_sku" ? (
                        <>
                          {(() => {
                            const v = parsePlatformSkuVariation(o.lineItems[0]?.variation || "");
                            return (
                              <>
                                <td className="px-2 py-1">{v.shirtType || "—"}</td>
                                <td className="px-2 py-1">{v.shirtSize || "—"}</td>
                              </>
                            );
                          })()}
                        </>
                      ) : (
                        <td className="px-2 py-1 text-right tabular-nums">{peso(o.orderTotal)}</td>
                      )}
                      <td className="px-2 py-1">
                        <div className="line-clamp-2 max-w-[14rem]">{o.lineItems[0]?.title || "—"}</div>
                        {o.lineItems.length > 1 && (
                          <div className="text-muted-foreground">+{o.lineItems.length - 1} more in dropdown</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {toImport.length > 50 && (
                <p className="border-t px-2 py-1 text-muted-foreground">…and {toImport.length - 50} more</p>
              )}
            </div>
          )}

          {duplicates.length > 0 && (
            <p className="text-xs text-amber-800 dark:text-amber-200">
              {duplicates.length} order(s) already exist (same waybill, order no., or BigSeller code) and will not be
              imported again.
            </p>
          )}

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void importOrders()}
              disabled={saving || parsing || toImport.length === 0}
            >
              {saving ? "Importing…" : `Import ${toImport.length} order(s)`}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
