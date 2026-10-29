"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { orderPaidAmount, orderUncollectedAmount } from "@/lib/order-balance";
import { getOrderKind, isBigSellerOnlineOrder, orderTypeLabel } from "@/lib/sales";
import { peso } from "@/lib/utils";

type UncollectedOrder = {
  id: string;
  order_no: string | number | null;
  customer_name: string | null;
  total: number | null;
  down_payment: number | null;
  uncollected_amount: number | null;
  uncollected_note: string | null;
  kind: string | null;
  order_type: string | null;
  source: string | null;
  notes: string | null;
};

function kindLabel(o: UncollectedOrder): string {
  if (String(o.kind || "").toLowerCase() === "pos") return "POS";
  return orderTypeLabel(
    getOrderKind({ kind: o.kind ?? undefined, order_type: o.order_type ?? undefined }),
  );
}

export function UncollectedGoodwillRecordButton() {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<UncollectedOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const { data, error: qErr } = await supabase
        .from("orders")
        .select(
          "id, order_no, customer_name, total, down_payment, uncollected_amount, uncollected_note, kind, order_type, source, notes",
        )
        .gt("uncollected_amount", 0)
        .order("uncollected_amount", { ascending: false });
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        setOrders([]);
      } else {
        setOrders((data || []) as UncollectedOrder[]);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  const rows = useMemo(
    () =>
      orders
        .filter((o) => !isBigSellerOnlineOrder(o) && orderUncollectedAmount(o) > 0)
        .sort((a, b) => orderUncollectedAmount(b) - orderUncollectedAmount(a)),
    [orders],
  );
  const grand = rows.reduce((s, o) => s + orderUncollectedAmount(o), 0);

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        Uncollected goodwill record
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Uncollected / Goodwill"
        description="Remaining balance the owner agreed not to collect."
        size="xl"
      >
        <div className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-muted-foreground">No uncollected / goodwill records.</p>
          )}
          {!loading && rows.length > 0 && (
            <>
              <p className="text-sm">
                <span className="font-semibold">{rows.length}</span> order{rows.length === 1 ? "" : "s"}
                {" · "}
                <span className="font-semibold">{peso(grand)}</span> uncollected
              </p>
              <div className="max-h-[min(60vh,28rem)] overflow-auto rounded-md border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="sticky top-0 bg-muted/80 text-xs uppercase tracking-wide text-muted-foreground backdrop-blur">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">#</th>
                      <th className="py-2 text-left font-medium">Customer</th>
                      <th className="py-2 text-left font-medium">Type</th>
                      <th className="py-2 text-right font-medium">Total</th>
                      <th className="py-2 text-right font-medium">Paid</th>
                      <th className="py-2 text-right font-medium">Uncollected</th>
                      <th className="px-3 py-2 text-left font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => (
                      <tr key={o.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">#{o.order_no}</td>
                        <td className="py-2 font-medium">{o.customer_name || "—"}</td>
                        <td className="py-2 text-xs text-muted-foreground">{kindLabel(o)}</td>
                        <td className="py-2 text-right font-mono text-xs">{peso(Number(o.total || 0))}</td>
                        <td className="py-2 text-right font-mono text-xs text-green-600">{peso(orderPaidAmount(o))}</td>
                        <td className="py-2 text-right font-mono text-xs font-semibold">
                          {peso(orderUncollectedAmount(o))}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {String(o.uncollected_note || "").trim() || "Goodwill"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
