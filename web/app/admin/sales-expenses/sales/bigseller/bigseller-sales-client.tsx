"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { peso } from "@/lib/utils";

type Order = any;
type FinanceAccount = { id: string; name: string; kind: string; balance?: number | null };

// ---------------------------------------------------------------------------
// Inline withdrawal row
// ---------------------------------------------------------------------------
function InlineWithdrawRow({
  order,
  financeAccounts,
  onCancel,
  onRecorded,
}: {
  order: Order;
  financeAccounts: FinanceAccount[];
  onCancel: () => void;
  onRecorded: (updated: Order) => void;
}) {
  const supabase = createClient();
  const total = Number(order.total || 0);
  const withdrawn = Number(order.down_payment || 0);
  const pending = Math.max(0, total - withdrawn);

  const [amount, setAmount] = useState(String(pending > 0 ? pending : ""));
  const [accountId, setAccountId] = useState(financeAccounts[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setErr("Enter a valid amount."); return; }
    if (!accountId) { setErr("Select a finance account."); return; }
    setSaving(true);
    setErr(null);
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
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const amtNum = Number(amount);
  const afterPending = Math.max(0, pending - amtNum);

  return (
    <tr className="border-t bg-amber-50/60 dark:bg-amber-900/10">
      <td colSpan={9} className="px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          {/* Context */}
          <div className="text-sm">
            <span className="font-semibold">#{order.order_no}</span>
            <span className="ml-2 text-muted-foreground">
              Pending: <span className="font-semibold text-amber-700 dark:text-amber-400">{peso(pending)}</span>
            </span>
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Withdrawal amount (₱)</Label>
            <Input
              type="number"
              min={0.01}
              step="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setErr(null); }}
              className="h-8 w-36 text-sm"
              autoFocus
            />
            {amtNum > 0 && afterPending > 0 && (
              <span className="text-[11px] text-amber-600">{peso(afterPending)} will remain pending</span>
            )}
          </div>

          {/* Finance account */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Finance account</Label>
            <select
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {financeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.kind})
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Shopee payout ref #…"
              className="h-8 w-48 text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex items-end gap-2 pb-0.5">
            <Button size="sm" disabled={saving} onClick={save} className="h-8">
              {saving ? "Saving…" : "Confirm withdrawal"}
            </Button>
            <Button size="sm" variant="outline" onClick={onCancel} className="h-8">
              Cancel
            </Button>
          </div>

          {err && <p className="w-full text-xs text-destructive">{err}</p>}
        </div>
      </td>
    </tr>
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        const blob = [o.order_no, o.customer_name, o.external_order_no, o.waybill_no, o.sku_code, o.store?.name]
          .join(" ").toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, storeFilter, statusFilter]);

  const completedOrders = useMemo(() =>
    orders.filter((o) => {
      const s = String(o.stage || "").toLowerCase();
      return s === "completed" || s === "for_pickup";
    }), [orders]);

  const totals = useMemo(() => {
    const saleTotal = completedOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const totalWithdrawn = completedOrders.reduce((s, o) => s + Number(o.down_payment || 0), 0);
    return { saleTotal, totalWithdrawn, pending: saleTotal - totalWithdrawn };
  }, [completedOrders]);

  function handleRecorded(updated: Order) {
    setOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o));
    setExpandedId(null);
  }

  return (
    <>
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
            <select
              className="mt-1 h-9 rounded-md border bg-transparent px-3 text-sm"
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
            >
              <option value="all">All stores</option>
              {stores.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <Label>Withdrawal status</Label>
            <select
              className="mt-1 h-9 rounded-md border bg-transparent px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "pending" | "partial" | "withdrawn")}
            >
              <option value="all">All</option>
              <option value="pending">Not yet withdrawn</option>
              <option value="partial">Partially withdrawn</option>
              <option value="withdrawn">Fully withdrawn</option>
            </select>
          </div>
          <div className="self-end pb-1 text-xs text-muted-foreground">
            {filtered.length} of {orders.length} orders
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] text-sm">
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
                const fullyWithdrawn = total > 0 && withdrawn >= total;
                const partiallyWithdrawn = withdrawn > 0 && withdrawn < total;
                const isExpanded = expandedId === o.id;

                return [
                  // Main data row
                  <tr
                    key={o.id}
                    className={`border-t hover:bg-muted/20 ${fullyWithdrawn ? "opacity-60" : ""} ${isExpanded ? "bg-amber-50/40 dark:bg-amber-900/10" : ""}`}
                  >
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
                      {isCompleted && !fullyWithdrawn && !isExpanded && (
                        <Button
                          size="sm"
                          variant={partiallyWithdrawn ? "outline" : "default"}
                          className="h-7 text-xs"
                          onClick={() => setExpandedId(o.id)}
                        >
                          {partiallyWithdrawn ? "+ Withdraw" : "Withdraw"}
                        </Button>
                      )}
                      {isCompleted && fullyWithdrawn && !isExpanded && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => setExpandedId(o.id)}
                        >
                          + Add more
                        </Button>
                      )}
                      {isExpanded && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setExpandedId(null)}
                        >
                          ✕
                        </Button>
                      )}
                      {!isCompleted && (
                        <span className="text-xs text-muted-foreground">Not completed</span>
                      )}
                    </td>
                  </tr>,

                  // Inline withdrawal row (expands beneath)
                  isExpanded && (
                    <InlineWithdrawRow
                      key={`${o.id}-withdraw`}
                      order={o}
                      financeAccounts={financeAccounts}
                      onCancel={() => setExpandedId(null)}
                      onRecorded={handleRecorded}
                    />
                  ),
                ];
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
