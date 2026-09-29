"use client";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatSupabaseError, peso } from "@/lib/utils";
import { FileSpreadsheet } from "lucide-react";
import { normalizeImportDedupeKey } from "@/lib/bigseller-import-dedupe";
import { resolveStoreId, type StoreOption } from "@/lib/bigseller-store-resolve";
import {
  afterSalesIdsFromImport,
  mapExcelReturnStatus,
  mergeReturnImport,
  orderTimeIsoFromReturn,
  parseBigSellerReturnExcelRows,
  pickBigSellerReturnSheetName,
  RETURN_ORDER_SELECT,
  RETURN_ORDER_SELECT_BASE,
  type BigSellerReturnExcelRow,
} from "@/lib/bigseller-return-excel";

const MATCH_SELECT =
  "id,order_no,customer_name,sku_code,external_order_no,waybill_no,return_status,return_reason,return_import,return_inventory_type,return_inventory_ref,kind,order_type,source,stage,status,total,down_payment,updated_at,created_at";
const MATCH_SELECT_BASE =
  "id,order_no,customer_name,sku_code,external_order_no,waybill_no,return_status,return_reason,return_inventory_type,return_inventory_ref,kind,order_type,source,stage,status,total,down_payment,updated_at,created_at";

type MatchOrder = {
  id: string;
  order_no?: number;
  customer_name?: string;
  sku_code?: string | null;
  external_order_no?: string | null;
  waybill_no?: string | null;
  return_status?: string | null;
  return_reason?: string | null;
  return_import?: unknown;
};

function matchOrder(row: BigSellerReturnExcelRow, orders: MatchOrder[]): MatchOrder | null {
  const pkg = normalizeImportDedupeKey(row.packageNo);
  const ext = normalizeImportDedupeKey(row.orderNo);
  const track = normalizeImportDedupeKey(row.trackingNo);
  const retTrack = normalizeImportDedupeKey(row.returnTrackingNo);

  if (pkg) {
    const hit = orders.find((o) => normalizeImportDedupeKey(o.sku_code) === pkg);
    if (hit) return hit;
  }
  if (ext) {
    const hit = orders.find((o) => normalizeImportDedupeKey(o.external_order_no) === ext);
    if (hit) return hit;
  }
  if (track) {
    const hit = orders.find((o) => normalizeImportDedupeKey(o.waybill_no) === track);
    if (hit) return hit;
  }
  if (retTrack) {
    const hit = orders.find((o) => normalizeImportDedupeKey(o.waybill_no) === retTrack);
    if (hit) return hit;
  }
  return null;
}

async function fetchMatchOrders(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ orders: MatchOrder[]; error: string | null }> {
  const all: MatchOrder[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    let { data, error } = await supabase
      .from("orders")
      .select(MATCH_SELECT)
      .or("sku_code.not.is.null,external_order_no.not.is.null,waybill_no.not.is.null,return_import.not.is.null")
      .range(from, from + pageSize - 1);
    if (error && /return_import/i.test(error.message)) {
      const fb = await supabase
        .from("orders")
        .select(MATCH_SELECT_BASE)
        .or("sku_code.not.is.null,external_order_no.not.is.null,waybill_no.not.is.null")
        .range(from, from + pageSize - 1);
      data = fb.data;
      error = fb.error;
    }
    if (error) return { orders: [], error: error.message };
    const batch = (data || []) as MatchOrder[];
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return { orders: all, error: null };
}

export function BigSellerReturnExcelImportButton({
  canEdit,
  onImported,
}: {
  canEdit: boolean;
  onImported: (updated: Record<string, unknown>[]) => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<BigSellerReturnExcelRow[]>([]);
  const [skippedRows, setSkippedRows] = useState(0);
  const [skipReasons, setSkipReasons] = useState<string[]>([]);
  const [sheetRows, setSheetRows] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [existing, setExisting] = useState<MatchOrder[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [matchedCount, setMatchedCount] = useState(0);
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [{ data: storeData }, match] = await Promise.all([
        supabase.from("stores").select("id,name,pdf_label").order("name"),
        fetchMatchOrders(supabase),
      ]);
      if (cancelled) return;
      setStores((storeData as StoreOption[]) || []);
      if (match.error) setError(match.error);
      setExisting(match.orders);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  useEffect(() => {
    if (open) return;
    setRows([]);
    setSkippedRows(0);
    setSkipReasons([]);
    setFileName("");
    setError("");
    setDuplicateCount(0);
    setMatchedCount(0);
    setNewCount(0);
  }, [open]);

  function classify(parsed: BigSellerReturnExcelRow[], orders: MatchOrder[]) {
    const seenAfter = new Set<string>();
    for (const o of orders) {
      for (const id of afterSalesIdsFromImport(o.return_import)) seenAfter.add(id);
    }
    let dup = 0;
    let matched = 0;
    let fresh = 0;
    const toImport: BigSellerReturnExcelRow[] = [];
    for (const row of parsed) {
      const aid = normalizeImportDedupeKey(row.afterSalesId);
      if (aid && seenAfter.has(aid)) {
        dup += 1;
        continue;
      }
      if (aid) seenAfter.add(aid);
      toImport.push(row);
      if (matchOrder(row, orders)) matched += 1;
      else fresh += 1;
    }
    return { toImport, dup, matched, fresh };
  }

  async function parseFile(file: File) {
    setParsing(true);
    setError("");
    setFileName(file.name);
    try {
      const match = await fetchMatchOrders(supabase);
      if (match.error) setError(match.error);
      const orders = match.orders;
      setExisting(orders);
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName = pickBigSellerReturnSheetName(wb);
      if (!sheetName || !wb.Sheets[sheetName]) {
        setError("No sheet found in this file.");
        setRows([]);
        return;
      }
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "" });
      const result = parseBigSellerReturnExcelRows(rawRows);
      setSheetRows(result.sheetRows);
      setSkippedRows(result.skippedRows);
      setSkipReasons(result.skipReasons);
      const { toImport, dup, matched, fresh } = classify(result.rows, orders);
      setRows(toImport);
      setDuplicateCount(dup);
      setMatchedCount(matched);
      setNewCount(fresh);
      if (result.rows.length === 0 && result.skipReasons[0]) setError(result.skipReasons[0]);
    } catch (e: unknown) {
      setError(formatSupabaseError(e));
      setRows([]);
    } finally {
      setParsing(false);
    }
  }

  async function importRows() {
    if (!rows.length) return;
    setSaving(true);
    setError("");
    try {
      const match = await fetchMatchOrders(supabase);
      if (match.error) throw new Error(match.error);
      const live = match.orders;
      const { toImport } = classify(rows, live);
      const updatedIds: string[] = [];
      const working = [...live];

      for (const row of toImport) {
        const mappedStatus = mapExcelReturnStatus(row.returnStatus, row.stockInStatus);
        const reason = row.returnReason || null;
        const ts = orderTimeIsoFromReturn(row);
        const refundTotal =
          row.refunds > 0 ? Math.round(row.refunds * 100) / 100 : Math.round(row.sellingPrice * (row.qty || 1) * 100) / 100;
        const hit = matchOrder(row, working);

        if (hit) {
          const alreadyReturned = hit.return_status === "returned";
          const merged = mergeReturnImport(hit.return_import, [row], fileName);
          const patch: Record<string, unknown> = {
            return_import: merged,
            return_reason: reason || hit.return_reason,
            updated_at: new Date().toISOString(),
          };
          if (!alreadyReturned) patch.return_status = mappedStatus;
          if (!hit.waybill_no && (row.trackingNo || row.returnTrackingNo)) {
            patch.waybill_no = row.trackingNo || row.returnTrackingNo;
          }
          let { error: ue } = await supabase.from("orders").update(patch).eq("id", hit.id);
          if (ue && /return_import/i.test(ue.message)) {
            const { return_import: _omit, ...without } = patch;
            const retry = await supabase.from("orders").update(without).eq("id", hit.id);
            ue = retry.error;
          }
          if (ue) throw ue;
          hit.return_import = merged;
          hit.return_status = alreadyReturned ? hit.return_status : mappedStatus;
          hit.return_reason = (reason || hit.return_reason) as string | null;
          updatedIds.push(hit.id);
          continue;
        }

        const { id: storeId } = resolveStoreId(stores, row.bigsellerStore);
        const payload: Record<string, unknown> = {
          customer_name: row.buyer || `Return ${row.orderNo || row.packageNo || row.afterSalesId}`,
          customer_social: row.buyer ? `BS-${row.buyer}` : null,
          external_order_no: row.orderNo || null,
          waybill_no: row.trackingNo || row.returnTrackingNo || null,
          courier: row.logistics || null,
          sku_code: row.packageNo || null,
          kind: "online",
          order_type: "online",
          source: "BigSeller",
          stage: "completed",
          status: "delivered",
          quantity: Math.max(1, Math.round(row.qty) || 1),
          unit_price: Math.round(row.sellingPrice * 100) / 100,
          total: refundTotal,
          down_payment: refundTotal,
          design_ref: row.productName || null,
          return_status: mappedStatus,
          return_reason: reason,
          return_import: mergeReturnImport(null, [row], fileName),
          notes: `Imported from BigSeller Order-Return Excel (${fileName || "file"}).`,
          ...(storeId ? { store_id: storeId } : {}),
          ...(ts ? { created_at: ts, updated_at: ts } : {}),
        };
        let { data: created, error: ie } = await supabase.from("orders").insert(payload).select("id").single();
        if (ie && /return_import/i.test(ie.message)) {
          const { return_import: _omit, ...without } = payload;
          const retry = await supabase.from("orders").insert(without).select("id").single();
          created = retry.data;
          ie = retry.error;
        }
        if (ie) throw ie;
        const nid = (created as { id: string }).id;
        working.push({
          id: nid,
          sku_code: row.packageNo,
          external_order_no: row.orderNo,
          waybill_no: row.trackingNo || row.returnTrackingNo,
          return_status: mappedStatus,
          return_reason: reason,
          return_import: payload.return_import,
        });
        updatedIds.push(nid);
      }

      const uniqueIds = [...new Set(updatedIds)];
      let { data: loaded, error: le } = await supabase.from("orders").select(RETURN_ORDER_SELECT).in("id", uniqueIds);
      if (le && /return_import/i.test(le.message)) {
        const fb = await supabase.from("orders").select(RETURN_ORDER_SELECT_BASE).in("id", uniqueIds);
        loaded = fb.data;
        le = fb.error;
      }
      if (le) throw le;
      setOpen(false);
      onImported((loaded as Record<string, unknown>[]) || []);
    } catch (e: unknown) {
      setError(formatSupabaseError(e));
    } finally {
      setSaving(false);
    }
  }

  if (!canEdit) return null;

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="mr-1 h-4 w-4" /> Import BigSeller Excel
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Import BigSeller returns"
        description="Upload a BigSeller Order-Return export. Rows match existing orders by package no., order no., or tracking no."
        size="xl"
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="bigseller-return-file">Order-Return export (.xlsx)</Label>
            <input
              id="bigseller-return-file"
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
          </div>
          {parsing && <p className="text-xs text-muted-foreground">Reading spreadsheet…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {rows.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {sheetRows} row(s) in file
                {skippedRows ? ` · ${skippedRows} skipped` : ""}
                {duplicateCount ? ` · ${duplicateCount} already imported` : ""}
                {" · "}
                {matchedCount} match existing order(s)
                {newCount ? ` · ${newCount} new` : ""}
              </p>
              {skipReasons[0] && <p className="text-xs text-muted-foreground">{skipReasons[0]}</p>}
              <div className="max-h-72 overflow-auto rounded-md border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-muted/80">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Platform</th>
                      <th className="px-2 py-1.5 font-medium">Store</th>
                      <th className="px-2 py-1.5 font-medium">Order No</th>
                      <th className="px-2 py-1.5 font-medium">Product</th>
                      <th className="px-2 py-1.5 font-medium">Qty</th>
                      <th className="px-2 py-1.5 font-medium">Refunds</th>
                      <th className="px-2 py-1.5 font-medium">Return Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.afterSalesId || `${r.orderNo}:${r.packageNo}`} className="border-t">
                        <td className="px-2 py-1.5">{r.platform || "—"}</td>
                        <td className="px-2 py-1.5">{r.bigsellerStore || "—"}</td>
                        <td className="break-all px-2 py-1.5 font-mono">{r.orderNo || "—"}</td>
                        <td className="max-w-[14rem] truncate px-2 py-1.5" title={r.productName}>
                          {r.productName || "—"}
                        </td>
                        <td className="px-2 py-1.5">{r.qty || "—"}</td>
                        <td className="px-2 py-1.5">{r.refunds ? peso(r.refunds) : "—"}</td>
                        <td className="px-2 py-1.5">{r.returnStatus || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void importRows()} disabled={saving}>
                  {saving ? "Importing…" : `Import ${rows.length} return${rows.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
