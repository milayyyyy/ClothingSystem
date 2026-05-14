"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { peso } from "@/lib/utils";

type Order = any;
type FinanceAccount = { id: string; name: string; kind: string; balance?: number | null };

// ---------------------------------------------------------------------------
// Withdrawal dialog
// ---------------------------------------------------------------------------
function WithdrawalDialog({
  open,
  order,
  financeAccounts,
  onClose,
  onRecorded,
}: {
  open: boolean;
  order: Order | null;
  financeAccounts: FinanceAccount[];
  onClose: () => void;
  onRecorded: (updatedOrder: Order) => void;
}) {
  const supabase = createClient();
  const total = Number(order?.total || 0);
  const withdrawn = Number(order?.down_payment || 0);
  const pending = Math.max(0, total - withdrawn);

  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function reset() {
    setAmount(pending > 0 ? String(pending) : "");
    setAccountId(financeAccounts[0]?.id ?? "");
    setNotes("");
    setMsg(null);
  }

  useMemo(() => { if (open) reset(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!order) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) { setMsg("Enter a valid withdrawal amount."); return; }
    if (!accountId) { setMsg("Select a finance account."); return; }
    setSaving(true);
    setMsg(null);
    try {
      const newWithdrawn = withdrawn + amt;
      const { error: oe } = await supabase
        .from("orders")
        .update({ down_payment: newWithdrawn, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (oe) throw oe;

      const today = new Date().toISOString().slice(0, 10);
      const storeName = order.store?.name ? ` (${order.store.name})` : "";
      const desc = `BigSeller withdrawal: #${order.order_no}${storeName} — ${order.customer_name || ""}${notes.trim() ? ` | ${notes.trim()}` : ""}`;
      const { error: te } = await supabase.from("finance_transactions").insert({
        occurred_at: today,
        account_id: accountId,
        direction: "in",
        amount: amt,
        description: desc,
        notes: `bigseller_order:${order.id}`,
      });
      if (te) throw te;

      onRecorded({ ...order, down_payment: newWithdrawn });
    } catch (err: unknown) {
      setMsg("Error: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  if (!order) return null;

  return (
    <Dialog open={open} onClose={onClose} title="Record withdrawal" size="md">
      <div className="space-y-4">
        {/* Order summary */}
        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <div className="font-semibold">
            #{order.order_no}
            {order.external_order_no && <span className="ml-1.5 font-normal text-muted-foreground">· {order.external_order_no}</span>}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {order.customer_name}{order.store?.name ? ` · ${order.store.name}` : ""}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs">
            <span>Sale total: <span className="font-semibold text-foreground">{peso(total)}</span></span>
            <span>Already withdrawn: <span className="font-medium text-green-600">{peso(withdrawn)}</span></span>
            <span>Pending: <span className="font-semibold text-amber-600">{peso(pending)}</span></span>
          </div>
        </div>

        {pending <= 0 ? (
          <>
            <p className="text-sm text-green-600 dark:text-green-400">All earnings already withdrawn.</p>
            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </>
        ) : (
          <form onSubmit={save} className="space-y-3">
            <div>
              <Label>Withdrawal amount (₱)</Label>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
                required
              />
              {Number(amount) > 0 && Number(amount) < pending && (
                <p className="mt-1 text-xs text-amber-600">
                  Partial withdrawal — {peso(pending - Number(amount))} will remain pending.
                </p>
              )}
            </div>

            <div>
              <Label>Finance account (where the money went)</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
              >
                <option value="">— select account —</option>
                {financeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.kind}){a.balance != null ? ` — ₱${Number(a.balance).toLocaleString()}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label>Notes <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Shopee payout ref #12345"
                className="mt-1"
              />
            </div>

            {msg && <p className="text-sm text-destructive">{msg}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Record withdrawal"}</Button>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function BigSellerSalesClient({
  orders: initialOrders,
  financeAccounts,
}: {
  orders: Order[];
  financeAccounts: FinanceAccount[];
}) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "partial" | "withdrawn">("all");
  const [withdrawOrder, setWithdrawOrder] = useState<Order | null>(null);

  const stores = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => { if (o.store?.name) s.add(o.store.name); });
    return Array.from(s).sort();
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (storeFilter !== "all" && o.store?.name !== storeFilter) return false;
      const total = Number(o.total || 0);
      const withdrawn = Number(o.down_payment || 0);
      if (statusFilter === "pending" && withdrawn > 0) return false;
      if (statusFilter === "partial" && (withdrawn <= 0 || withdrawn >= total)) return false;
      if (statusFilter === "withdrawn" && withdrawn < total) return false;
      if (q) {
        const blob = [
          o.order_no, o.customer_name, o.external_order_no, o.waybill_no, o.sku_code, o.store?.name
        ].join(" ").toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, storeFilter, statusFilter]);

  // Summary stats (all orders, not filtered)
  const completedOrders = useMemo(() => orders.filter((o) => {
    const stage = String(o.stage || "").toLowerCase();
    return stage === "completed" || stage === "for_pickup";
  }), [orders]);

  const totals = useMemo(() => {
    const saleTotal = completedOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const totalWithdrawn = completedOrders.reduce((s, o) => s + Number(o.down_payment || 0), 0);
    return { saleTotal, totalWithdrawn, pending: saleTotal - totalWithdrawn };
  }, [completedOrders]);

  function handleRecorded(updatedOrder: Order) {
    setOrders((prev) => prev.map((o) => o.id === updatedOrder.id ? updatedOrder : o));
    setWithdrawOrder(null);
  }

  return (
    <>
      <WithdrawalDialog
        open={!!withdrawOrder}
        order={withdrawOrder}
        financeAccounts={financeAccounts}
        onClose={() => setWithdrawOrder(null)}
        onRecorded={handleRecorded}
      />

      {/* Summary cards */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Sales</div>
          <div className="mt-1 text-2xl font-bold">{peso(totals.saleTotal)}</div>
          <div className="text-xs text-muted-foreground">{completedOrders.length} completed orders</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Withdrawn</div>
          <div className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">{peso(totals.totalWithdrawn)}</div>
          <div className="text-xs text-muted-foreground">Received in finance accounts</div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-800 dark:bg-amber-900/10">
          <div className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">Pending Withdrawal</div>
          <div className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">{peso(totals.pending)}</div>
          <div className="text-xs text-amber-600/80 dark:text-amber-500">Still in marketplace wallet</div>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex-1 min-w-[180px]">
            <Label htmlFor="bs-search">Search</Label>
            <Input
              id="bs-search"
              placeholder="Order #, customer, waybill, SKU…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Store / platform</Label>
            <select className="mt-1 h-9 rounded-md border bg-transparent px-3 text-sm" value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}>
              <option value="all">All stores</option>
              {stores.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <Label>Withdrawal status</Label>
            <select className="mt-1 h-9 rounded-md border bg-transparent px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
              <option value="all">All</option>
              <option value="pending">Not yet withdrawn</option>
              <option value="partial">Partially withdrawn</option>
              <option value="withdrawn">Fully withdrawn</option>
            </select>
          </div>
          <div className="text-xs text-muted-foreground self-end pb-1">
            {filtered.length} of {orders.length} orders
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">#</th>
                <th className="py-3 text-left font-medium">External / Waybill</th>
                <th className="py-3 text-left font-medium">Customer</th>
                <th className="py-3 text-left font-medium">Store</th>
                <th className="py-3 text-left font-medium">Stage</th>
                <th className="py-3 text-right font-medium">Sale total</th>
                <th className="py-3 text-right font-medium text-green-700">Withdrawn</th>
                <th className="py-3 text-right font-medium text-amber-700">Pending</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const total = Number(o.total || 0);
                const withdrawn = Number(o.down_payment || 0);
                const pending = Math.max(0, total - withdrawn);
                const stage = String(o.stage || "").toLowerCase();
                const isCompleted = stage === "completed" || stage === "for_pickup";
                const fullyWithdrawn = withdrawn >= total && total > 0;
                const partiallyWithdrawn = withdrawn > 0 && withdrawn < total;

                return (
                  <tr key={o.id} className={`border-t hover:bg-muted/20 ${fullyWithdrawn ? "opacity-60" : ""}`}>
                    <td className="px-4 py-2.5 font-mono text-xs">
                      #{o.order_no}
                      {o.sku_code && <div className="text-[10px] text-muted-foreground">{o.sku_code}</div>}
                    </td>
                    <td className="py-2.5 text-xs">
                      {o.external_order_no && <div className="font-mono">{o.external_order_no}</div>}
                      {o.waybill_no && <div className="text-muted-foreground">Waybill: {o.waybill_no}</div>}
                      {!o.external_order_no && !o.waybill_no && <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5">
                      <div className="font-medium">{o.customer_name}</div>
                      {o.customer_social && <div className="text-[11px] text-muted-foreground">{o.customer_social}</div>}
                    </td>
                    <td className="py-2.5 text-xs text-muted-foreground">{o.store?.name || "—"}</td>
                    <td className="py-2.5">
                      <Badge variant={isCompleted ? "green" : "outline"} className="text-xs">
                        {isCompleted ? "Completed" : stage || "pending"}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs">{peso(total)}</td>
                    <td className="py-2.5 text-right font-mono text-xs text-green-600 dark:text-green-400">
                      {withdrawn > 0 ? peso(withdrawn) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5 text-right font-mono text-xs">
                      {pending > 0 ? (
                        <span className="font-semibold text-amber-700 dark:text-amber-400">{peso(pending)}</span>
                      ) : (
                        <span className="text-green-600">✓ Done</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {!fullyWithdrawn && isCompleted && (
                        <Button
                          size="sm"
                          variant={partiallyWithdrawn ? "outline" : "default"}
                          className="h-7 text-xs"
                          onClick={() => setWithdrawOrder(o)}
                        >
                          {partiallyWithdrawn ? "Add withdrawal" : "Withdraw"}
                        </Button>
                      )}
                      {fullyWithdrawn && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setWithdrawOrder(o)}>
                          Edit
                        </Button>
                      )}
                      {!isCompleted && (
                        <span className="text-xs text-muted-foreground">Not completed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    No BigSeller orders match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
