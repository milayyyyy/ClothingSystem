"use client";

import { useMemo, useState } from "react";
import { Plus, ShoppingBag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useWorkspaceShell } from "@/components/workspace-shell-context";
import { isResellerRole, isStaffRole } from "@/lib/roles";
import { formatDateTime, formatSupabaseError, peso } from "@/lib/utils";
import type { ResellerProduct } from "@/lib/reseller-products";
import {
  orderTotal,
  parseResellerOrder,
  type ResellerOrder,
  type ResellerOrderStatus,
} from "@/lib/reseller-orders";
import { ResellerPlaceOrderDialog } from "../reseller-place-order-dialog";

function statusBadge(status: ResellerOrderStatus): "amber" | "green" | "muted" {
  if (status === "confirmed") return "green";
  if (status === "cancelled") return "muted";
  return "amber";
}

export function ResellerOrdersClient({
  initial,
  products,
  tableMissing,
}: {
  initial: ResellerOrder[];
  products: ResellerProduct[];
  tableMissing?: boolean;
}) {
  const supabase = createClient();
  const { role, userId } = useWorkspaceShell();
  const canOrder = isResellerRole(role);
  const canManage = isStaffRole(role);
  const [orders, setOrders] = useState(initial);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  const listed = useMemo(() => orders, [orders]);

  async function refresh() {
    const { data, error: loadErr } = await supabase
      .from("reseller_orders")
      .select("*, profiles!reseller_id(full_name,email)")
      .order("created_at", { ascending: false });
    if (loadErr) {
      setError(formatSupabaseError(loadErr));
      return;
    }
    setOrders((data || []).map((row) => parseResellerOrder(row as Record<string, unknown>)));
  }

  async function setStatus(id: string, status: ResellerOrderStatus) {
    const { error: upErr } = await supabase.from("reseller_orders").update({ status }).eq("id", id);
    if (upErr) {
      setError(formatSupabaseError(upErr));
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
  }

  return (
    <div className="space-y-4">
      {tableMissing && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Apply migration 113 (reseller account), then reload.
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
            <p className="text-sm font-medium text-muted-foreground">No reseller orders yet.</p>
            {canOrder && (
              <Button type="button" className="mt-4" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> Place order
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {listed.map((order) => (
            <Card key={order.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    {canManage && <div className="text-sm font-medium">{order.reseller_name}</div>}
                    <div className="text-xs text-muted-foreground">{formatDateTime(order.created_at)}</div>
                  </div>
                  <Badge variant={statusBadge(order.status)}>{order.status}</Badge>
                </div>
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">Total {peso(orderTotal(order.items))}</div>
                  {canManage && order.status === "pending" && (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void setStatus(order.id, "cancelled")}>
                        Cancel
                      </Button>
                      <Button type="button" size="sm" onClick={() => void setStatus(order.id, "confirmed")}>
                        Confirm
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
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
