"use client";

import { useMemo, useState } from "react";
import { Plus, ShoppingBag, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspaceShell } from "@/components/workspace-shell-context";
import { canWorkResellerDesk, isResellerRole, isStaffRole } from "@/lib/roles";
import { cn, formatDateTime, formatSupabaseError, peso } from "@/lib/utils";
import type { ResellerProduct } from "@/lib/reseller-products";
import { RESELLER_ORDER_RECEIPTS_BUCKET } from "@/lib/media-storage";
import { uploadResellerOrderReceipt } from "@/lib/reseller-order-receipt";
import {
  RESELLER_ORDER_PROCESSES,
  RESELLER_ORDER_SELECT,
  RESELLER_ORDER_SELECT_BASE,
  orderTotal,
  parseResellerOrder,
  resellerProcessAccent,
  resellerProcessBadge,
  resellerProcessLabel,
  type ResellerDeskAccount,
  type ResellerOrder,
  type ResellerOrderProcess,
  type ResellerPaymentStatus,
} from "@/lib/reseller-orders";
import { ResellerPlaceOrderDialog } from "../reseller-place-order-dialog";
import { ResellerOrderProcessBar, ResellerOrderProcessReadonly } from "./reseller-order-process";

function paymentBadge(status: ResellerPaymentStatus): "amber" | "green" | "red" {
  if (status === "approved") return "green";
  if (status === "rejected") return "red";
  return "amber";
}

function paymentLabel(status: ResellerPaymentStatus) {
  if (status === "approved") return "Downpayment approved";
  if (status === "rejected") return "Receipt rejected";
  return "Receipt pending review";
}

export function ResellerOrdersClient({
  initial,
  products,
  accounts,
  tableMissing,
}: {
  initial: ResellerOrder[];
  products: ResellerProduct[];
  accounts: ResellerDeskAccount[];
  tableMissing?: boolean;
}) {
  const supabase = createClient();
  const { role, userId } = useWorkspaceShell();
  const canOrder = isResellerRole(role);
  const canManage = canWorkResellerDesk(role);
  const canAssign = isStaffRole(role);
  const canReviewPayment = isStaffRole(role);
  const [orders, setOrders] = useState(initial);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [receiptFiles, setReceiptFiles] = useState<Record<string, File | null>>({});
  const [uploadingId, setUploadingId] = useState("");
  const [processFilter, setProcessFilter] = useState<"all" | ResellerOrderProcess>("all");

  const counts = useMemo(() => {
    const next: Record<string, number> = { all: orders.length };
    for (const row of RESELLER_ORDER_PROCESSES) next[row.value] = 0;
    for (const order of orders) next[order.process] = (next[order.process] || 0) + 1;
    return next;
  }, [orders]);

  const listed = useMemo(
    () => (processFilter === "all" ? orders : orders.filter((order) => order.process === processFilter)),
    [orders, processFilter],
  );

  async function refresh() {
    const full = await supabase
      .from("reseller_orders")
      .select(RESELLER_ORDER_SELECT)
      .order("created_at", { ascending: false });
    const res = full.error
      ? await supabase.from("reseller_orders").select(RESELLER_ORDER_SELECT_BASE).order("created_at", { ascending: false })
      : full;
    if (res.error) {
      setError(formatSupabaseError(res.error));
      return;
    }
    setOrders((res.data || []).map((row) => parseResellerOrder(row as Record<string, unknown>)));
  }

  async function setProcess(id: string, process: ResellerOrderProcess, assignedTo?: string) {
    const patch: Record<string, unknown> = { process };
    if (assignedTo) patch.assigned_to = assignedTo;
    const { error: upErr } = await supabase.from("reseller_orders").update(patch).eq("id", id);
    if (upErr) {
      setError(formatSupabaseError(upErr));
      return;
    }
    await refresh();
  }

  async function setPayment(id: string, payment_status: ResellerPaymentStatus) {
    const { error: upErr } = await supabase.from("reseller_orders").update({ payment_status }).eq("id", id);
    if (upErr) {
      setError(formatSupabaseError(upErr));
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, payment_status } : o)));
  }

  async function openReceipt(path: string) {
    const { data, error: urlErr } = await supabase.storage.from(RESELLER_ORDER_RECEIPTS_BUCKET).createSignedUrl(path, 3600);
    if (urlErr || !data?.signedUrl) {
      setError(urlErr?.message || "Could not open receipt.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function resubmitReceipt(order: ResellerOrder) {
    const file = receiptFiles[order.id];
    if (!file) {
      setError("Choose a receipt photo to resubmit.");
      return;
    }
    setUploadingId(order.id);
    setError("");
    try {
      const path = await uploadResellerOrderReceipt(order.reseller_id, order.id, file);
      const { error: upErr } = await supabase
        .from("reseller_orders")
        .update({ receipt_path: path, payment_status: "pending_review" })
        .eq("id", order.id);
      if (upErr) throw new Error(formatSupabaseError(upErr));
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, receipt_path: path, payment_status: "pending_review" } : o)),
      );
      setReceiptFiles((prev) => ({ ...prev, [order.id]: null }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload receipt.");
    }
    setUploadingId("");
  }

  return (
    <div className="space-y-4">
      {tableMissing && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Apply migrations 113, 115, 123, 124, and 125 (reseller orders, downpayment, process, chat), then reload.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => setProcessFilter("all")}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
              processFilter === "all"
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            All <span className="tabular-nums text-muted-foreground">{counts.all || 0}</span>
          </button>
          {RESELLER_ORDER_PROCESSES.map((row) => (
            <button
              key={row.value}
              type="button"
              onClick={() => setProcessFilter(row.value)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-xs font-medium",
                processFilter === row.value
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {row.label} <span className="tabular-nums text-muted-foreground">{counts[row.value] || 0}</span>
            </button>
          ))}
        </div>
        {canOrder && (
          <Button type="button" className="shrink-0 self-end sm:self-start" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Place order
          </Button>
        )}
      </div>

      {listed.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingBag className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">
              {orders.length === 0
                ? canManage && !canAssign
                  ? "No reseller orders assigned to you."
                  : "No reseller orders yet."
                : `No orders in ${processFilter === "all" ? "this list" : resellerProcessLabel(processFilter)}.`}
            </p>
            {canOrder && orders.length === 0 && (
              <Button type="button" className="mt-4" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Place order
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {listed.map((order) => {
            const due = order.downpayment_amount || 0;
            const checking = order.process === "pending_checking" || order.process === "draft";
            const total = orderTotal(order.items);
            return (
              <Card key={order.id} className={cn("overflow-hidden border-l-4", resellerProcessAccent(order.process))}>
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-semibold leading-snug">
                        {canManage ? order.reseller_name : order.items[0]?.name || "Order"}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(order.created_at)}</div>
                      {order.assigned_name && (
                        <div className="mt-1 text-xs text-muted-foreground">Sent to {order.assigned_name}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge variant={resellerProcessBadge(order.process)}>{resellerProcessLabel(order.process)}</Badge>
                      {due > 0 && <Badge variant={paymentBadge(order.payment_status)}>{paymentLabel(order.payment_status)}</Badge>}
                      <div className="text-sm font-semibold tabular-nums">{peso(total)}</div>
                    </div>
                  </div>

                  <ul className="divide-y rounded-lg border bg-muted/10">
                    {order.items.map((item, i) => (
                      <li key={`${order.id}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium leading-snug">
                            {item.qty} × {item.name}
                          </div>
                          {item.option_labels.length > 0 && (
                            <div className="mt-0.5 text-xs text-muted-foreground">{item.option_labels.join(" · ")}</div>
                          )}
                        </div>
                        <div className="shrink-0 tabular-nums text-muted-foreground">{peso(item.price * item.qty)}</div>
                      </li>
                    ))}
                    <li className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-semibold tabular-nums">{peso(total)}</span>
                    </li>
                  </ul>

                  {order.notes && (
                    <p className="rounded-md bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{order.notes}</p>
                  )}

                  {due > 0 && (
                    <div className="space-y-2 rounded-lg border bg-muted/15 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span>
                          Downpayment {order.downpayment_percent}% · {peso(due)}
                        </span>
                        {order.receipt_path && (
                          <Button type="button" size="sm" variant="outline" onClick={() => void openReceipt(order.receipt_path)}>
                            View receipt
                          </Button>
                        )}
                      </div>
                      {canReviewPayment && checking && order.payment_status === "pending_review" && (
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => void setPayment(order.id, "rejected")}>
                            Reject receipt
                          </Button>
                          <Button type="button" size="sm" onClick={() => void setPayment(order.id, "approved")}>
                            Approve downpayment
                          </Button>
                        </div>
                      )}
                      {canOrder && checking && order.payment_status === "rejected" && (
                        <div className="space-y-2">
                          <p className="text-xs text-destructive">Receipt was rejected. Upload a new photo to send it back for review.</p>
                          <Label htmlFor={`receipt-${order.id}`}>New receipt photo</Label>
                          <div className="flex flex-wrap items-center gap-2">
                            <Input
                              id={`receipt-${order.id}`}
                              type="file"
                              accept="image/*"
                              onChange={(e) => setReceiptFiles((prev) => ({ ...prev, [order.id]: e.target.files?.[0] || null }))}
                            />
                            <Button
                              type="button"
                              size="sm"
                              disabled={uploadingId === order.id}
                              onClick={() => void resubmitReceipt(order)}
                            >
                              <Upload className="h-3.5 w-3.5" />
                              {uploadingId === order.id ? "Uploading…" : "Resubmit"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rounded-lg border bg-background/60 p-3">
                    {canManage ? (
                      <ResellerOrderProcessBar
                        order={order}
                        canChange={canManage}
                        canAssign={canAssign}
                        accounts={accounts}
                        onChange={(process, assignedTo) => void setProcess(order.id, process, assignedTo)}
                      />
                    ) : (
                      <ResellerOrderProcessReadonly process={order.process} />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {canOrder && (
        <ResellerPlaceOrderDialog
          open={open}
          onClose={() => setOpen(false)}
          products={products}
          resellerId={userId}
          onPlaced={() => void refresh()}
        />
      )}
    </div>
  );
}
