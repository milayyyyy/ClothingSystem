"use client";

import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn, formatSupabaseError, peso } from "@/lib/utils";
import { Banknote } from "lucide-react";
import { parseTikTokSettlementWorkbook } from "@/lib/tiktok-shop-settlement";
import {
  applySettlementToOrderNotes,
  fetchTikTokOrdersForSettlement,
  planTikTokSettlementUpdates,
  type TikTokSettlementPlannedUpdate,
} from "@/lib/tiktok-settlement-update";

export function TikTokSettlementUpdateButton({
  onUpdated,
}: {
  onUpdated: () => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [settlementByOrderId, setSettlementByOrderId] = useState<Map<string, number> | null>(null);
  const [updates, setUpdates] = useState<TikTokSettlementPlannedUpdate[]>([]);
  const [unmatchedSettlementCount, setUnmatchedSettlementCount] = useState(0);
  const [ordersWithoutSettlement, setOrdersWithoutSettlement] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [matchedOrderCount, setMatchedOrderCount] = useState(0);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function resetState() {
    setFileName("");
    setSettlementByOrderId(null);
    setUpdates([]);
    setUnmatchedSettlementCount(0);
    setOrdersWithoutSettlement(0);
    setOrderCount(0);
    setMatchedOrderCount(0);
    setError("");
  }

  async function parseSettlementFile(file: File) {
    setParsing(true);
    setError("");
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const map = parseTikTokSettlementWorkbook(wb);
      setSettlementByOrderId(map);
      setFileName(file.name);

      if (map.size === 0) {
        setUpdates([]);
        setError(
          "Could not read settlement amounts. Use TikTok Finance → Settlement export (Order details: Order/Adjustment ID + Total settlement amount).",
        );
        return;
      }

      const { orders, error: loadError } = await fetchTikTokOrdersForSettlement(supabase);
      if (loadError) {
        setError(loadError);
        return;
      }
      setOrderCount(orders.length);

      const plan = planTikTokSettlementUpdates(orders, map);
      setUpdates(plan.updates);
      setUnmatchedSettlementCount(plan.unmatchedSettlementCount);
      setOrdersWithoutSettlement(plan.ordersWithoutSettlement);
      setMatchedOrderCount(plan.matchedOrderCount);

      if (plan.updates.length === 0) {
        if (orders.length === 0) {
          setError("No orders with Order ID found. Import TikTok completed orders first.");
        } else if (plan.matchedOrderCount === 0) {
          setError(
            `None of the ${map.size} settlement Order/Adjustment ID(s) match Order ID in your database (${orders.length} orders loaded). Export settlement for the same date range as your completed orders.`,
          );
        } else {
          setError(
            `${plan.matchedOrderCount} order(s) already have these settlement amounts — nothing to change.`,
          );
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to read settlement file");
      setUpdates([]);
    } finally {
      setParsing(false);
    }
  }

  const updateTotal = useMemo(
    () => updates.reduce((s, u) => s + u.newAmount, 0),
    [updates],
  );

  async function applyUpdates() {
    if (updates.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const orderIds = updates.map((u) => u.orderId);
      const notesById = new Map<string, string>();

      const chunk = 200;
      for (let i = 0; i < orderIds.length; i += chunk) {
        const slice = orderIds.slice(i, i + chunk);
        const { data, error: notesError } = await supabase
          .from("orders")
          .select("id,notes")
          .in("id", slice);
        if (notesError) throw notesError;
        for (const row of data || []) {
          notesById.set(row.id, applySettlementToOrderNotes(row.notes, fileName));
        }
      }

      const batchSize = 25;
      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map((u) =>
            supabase
              .from("orders")
              .update({
                unit_price: u.newAmount,
                total: u.newAmount,
                down_payment: u.newAmount,
                notes: notesById.get(u.orderId) ?? applySettlementToOrderNotes(null, fileName),
              })
              .eq("id", u.orderId),
          ),
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
      }

      setOpen(false);
      resetState();
      onUpdated();
    } catch (e: unknown) {
      setError(formatSupabaseError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Banknote className="mr-1 h-4 w-4" /> Apply TikTok settlement
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          resetState();
        }}
        title="Apply TikTok settlement"
        description="Match settlement Order/Adjustment ID to each order's Order ID in the database, then set unit price to Total settlement amount."
        size="lg"
      >
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
            Upload TikTok Finance → Settlement export. Each row’s{" "}
            <span className="font-medium text-foreground">Order/Adjustment ID</span> is matched to{" "}
            <span className="font-medium text-foreground">Order ID</span> (<code className="text-xs">external_order_no</code>
            ) on imported orders; <span className="font-medium text-foreground">Total settlement amount</span> becomes unit
            price, total, and down payment.
          </div>

          <div>
            <Label htmlFor="tiktok-settlement-only-file">Settlement export (.xlsx)</Label>
            <input
              id="tiktok-settlement-only-file"
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="mt-1 block w-full text-sm"
              disabled={parsing || saving}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void parseSettlementFile(f);
                e.target.value = "";
              }}
            />
            {settlementByOrderId && settlementByOrderId.size > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {settlementByOrderId.size} settlement row(s) in file
                {fileName ? ` (${fileName})` : ""}.
              </p>
            )}
            {parsing && <p className="mt-1 text-xs text-muted-foreground">Matching to TikTok orders…</p>}
          </div>

          {orderCount > 0 && settlementByOrderId && settlementByOrderId.size > 0 && (
            <div className="rounded-md border p-3 text-sm">
              <p>
                <span className="font-medium text-foreground">{settlementByOrderId.size}</span> settlement row(s) in file ·{" "}
                <span className="font-medium text-foreground">{orderCount}</span> order(s) with Order ID in database ·{" "}
                <span className="font-medium text-emerald-700 dark:text-emerald-400">{matchedOrderCount}</span> ID match(es)
              </p>
              {updates.length > 0 && (
                <p className="mt-1">
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">{updates.length}</span> order(s)
                  will get a new unit price (
                  <span className="font-medium text-foreground">{peso(updateTotal)}</span> combined).
                </p>
              )}
              {unmatchedSettlementCount > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {unmatchedSettlementCount} settlement row(s) did not match any imported order.
                </p>
              )}
              {ordersWithoutSettlement > 0 && (
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                  {ordersWithoutSettlement} TikTok order(s) still have no settlement row in this file.
                </p>
              )}
            </div>
          )}

          {updates.length > 0 && (
            <div className="max-h-40 overflow-auto rounded-md border text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-muted/80">
                  <tr>
                    <th className="px-2 py-1 text-left">Order ID</th>
                    <th className="px-2 py-1 text-left">Customer</th>
                    <th className="px-2 py-1 text-right">Was</th>
                    <th className="px-2 py-1 text-right">Settlement</th>
                  </tr>
                </thead>
                <tbody>
                  {updates.slice(0, 40).map((u) => (
                    <tr key={u.orderId} className="border-t">
                      <td className="px-2 py-1 font-mono">{u.externalOrderNo}</td>
                      <td className="px-2 py-1">{u.customerName || "—"}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{peso(u.previousAmount)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{peso(u.newAmount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {updates.length > 40 && (
                <p className="border-t px-2 py-1 text-muted-foreground">…and {updates.length - 40} more</p>
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
                resetState();
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={() => void applyUpdates()} disabled={saving || parsing || updates.length === 0}>
              {saving ? "Updating…" : `Update ${updates.length} order(s)`}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
