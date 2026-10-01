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
import { formatDateTime, formatSupabaseError, peso } from "@/lib/utils";
import type { ResellerProduct } from "@/lib/reseller-products";
import { RESELLER_ORDER_RECEIPTS_BUCKET } from "@/lib/media-storage";
import { uploadResellerOrderReceipt } from "@/lib/reseller-order-receipt";
import {
  orderTotal,
  parseResellerOrder,
  RESELLER_ORDER_SELECT,
  RESELLER_ORDER_SELECT_BASE,
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

  const listed = useMemo(() => orders, [orders]);

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
          Apply migrations 113, 115, 123, and 124 (reseller orders, downpayment, process), then reload.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {canOrder && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Place order
          </Button>
        </div>
      )}

      {listed.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <ShoppingBag className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">
              {canManage && !canAssign ? "No reseller orders assigned to you." : "No reseller orders yet."}
            </p>
            {canOrder && (
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
            return (
              <Card key={order.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      {canManage && <div className="text-sm font-medium">{order.reseller_name}</div>}
                      <div className="text-xs text-muted-foreground">{formatDateTime(order.created_at)}</div>
                    </div>
                    {due > 0 && <Badge variant={paymentBadge(order.payment_status)}>{paymentLabel(order.payment_status)}</Badge>}
                  </div>
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
                  <ul className="space-y-1 text-sm">
                    {order.items.map((item, i) => (
                      <li key={`${order.id}-${i}`} className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {item.qty} × {item.name}
                          {item.option_labels.length ? ` (${item.option_labels.join(" / ")})` : ""}
                        </span>
                        <span className="shrink-0 tabular-nums">{peso(item.price * item.qty)}</span>
                      </li>
                    ))}
                  </ul>
                  {order.notes && <p className="text-sm text-muted-foreground">{order.notes}</p>}
                  {due > 0 && (
                    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
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
                  <div className="text-sm font-medium">Total {peso(orderTotal(order.items))}</div>
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
