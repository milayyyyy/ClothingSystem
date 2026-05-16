"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { peso } from "@/lib/utils";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CsvExportDialog } from "@/components/csv-export-dialog";

type Order = any;
type FinanceAccount = { id: string; name: string; kind: string; balance?: number | null };

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
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "partial" | "withdrawn">("all");

  // Withdraw panel state
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [accountId, setAccountId] = useState(financeAccounts[0]?.id ?? "");
  const [withdrawNotes, setWithdrawNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const stores = useMemo(() => {
    const s = new Set<string>();
    orders.forEach((o) => { if (o.store?.name) s.add(o.store.name); });
    return Array.from(s).sort();
  }, [orders]);

  const completedOrders = useMemo(() =>
    orders.filter((o) => {
      const s = String(o.stage || "").toLowerCase();
      return s === "completed" || s === "for_pickup";
    }), [orders]);

  // Orders with pending amount, sorted oldest-first (FIFO for distribution)
  const pendingOrders = useMemo(() =>
    completedOrders
      .filter((o) => Number(o.total || 0) > Number(o.down_payment || 0))
      .sort((a, b) => new Date(a.updated_at || a.created_at || 0).getTime() - new Date(b.updated_at || b.created_at || 0).getTime()),
    [completedOrders]);

  const totals = useMemo(() => {
    const saleTotal = completedOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const totalWithdrawn = completedOrders.reduce((s, o) => s + Number(o.down_payment || 0), 0);
    return { saleTotal, totalWithdrawn, pending: saleTotal - totalWithdrawn };
  }, [completedOrders]);

  // Preview: how the entered amount distributes across pending orders (FIFO)
  const withdrawPreview = useMemo(() => {
    const amt = Number(withdrawAmount);
    if (!amt || amt <= 0) return null;
    let remaining = amt;
    const touched: { order: Order; addAmount: number }[] = [];
    for (const o of pendingOrders) {
      if (remaining <= 0) break;
      const orderPending = Number(o.total || 0) - Number(o.down_payment || 0);
      const add = Math.min(orderPending, remaining);
      touched.push({ order: o, addAmount: add });
      remaining -= add;
    }
    return { touched, leftover: remaining };
  }, [withdrawAmount, pendingOrders]);

  function openWithdraw() {
    setWithdrawAmount(totals.pending > 0 ? String(Math.round(totals.pending * 100) / 100) : "");
    setAccountId(financeAccounts[0]?.id ?? "");
    setWithdrawNotes("");
    setSaveErr(null);
    setSaveMsg(null);
    setWithdrawOpen(true);
  }

  async function recordWithdrawal() {
    const amt = Number(withdrawAmount);
    if (!amt || amt <= 0) { setSaveErr("Enter a valid withdrawal amount."); return; }
    if (!accountId) { setSaveErr("Select a finance account."); return; }
    if (!withdrawPreview || withdrawPreview.touched.length === 0) { setSaveErr("No pending orders to apply this withdrawal to."); return; }
    setSaving(true);
    setSaveErr(null);
    setSaveMsg(null);

    try {
      const updatedOrders: Order[] = [];

      // Update each affected order's down_payment
      for (const { order, addAmount } of withdrawPreview.touched) {
        const newWithdrawn = Number(order.down_payment || 0) + addAmount;
        const { error } = await supabase
          .from("orders")
          .update({ down_payment: newWithdrawn, updated_at: new Date().toISOString() })
          .eq("id", order.id);
        if (error) throw error;
        updatedOrders.push({ ...order, down_payment: newWithdrawn });
      }

      // Record one finance transaction for the total withdrawal
      const today = new Date().toISOString().slice(0, 10);
      const orderCount = withdrawPreview.touched.length;
      const desc = `BigSeller withdrawal — ${orderCount} order${orderCount !== 1 ? "s" : ""}${withdrawNotes.trim() ? ` | ${withdrawNotes.trim()}` : ""}`;
      const { error: te } = await supabase.from("finance_transactions").insert({
        occurred_at: today,
        account_id: accountId,
        direction: "in",
        amount: amt,
        description: desc,
        notes: `bigseller_bulk_withdrawal`,
      });
      if (te) throw te;

      // Apply updated orders to state
      setOrders((prev) =>
        prev.map((o) => {
          const updated = updatedOrders.find((u) => u.id === o.id);
          return updated ?? o;
        })
      );

      const remaining = withdrawPreview.leftover;
      setSaveMsg(
        remaining > 0
          ? `₱${amt.toLocaleString()} recorded. ₱${remaining.toLocaleString()} exceeds current pending — check order totals.`
          : `₱${amt.toLocaleString()} withdrawal recorded across ${orderCount} order${orderCount !== 1 ? "s" : ""}.`
      );
      setWithdrawOpen(false);
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

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

  const amtNum = Number(withdrawAmount);
  const afterPending = Math.max(0, totals.pending - amtNum);

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

        {/* Pending card — hosts the main withdraw action */}
        <div className={`rounded-lg border p-4 transition-colors ${withdrawOpen ? "border-amber-400 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-900/20" : "border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-900/10"}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">Pending Withdrawal</div>
              <div className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">{peso(totals.pending)}</div>
              <div className="text-xs text-amber-600/80 dark:text-amber-500">
                {pendingOrders.length} order{pendingOrders.length !== 1 ? "s" : ""} in marketplace wallet
              </div>
            </div>
            {totals.pending > 0 && (
              <Button
                size="sm"
                variant={withdrawOpen ? "outline" : "default"}
                className="mt-0.5 shrink-0 gap-1"
                onClick={() => (withdrawOpen ? setWithdrawOpen(false) : openWithdraw())}
              >
                {withdrawOpen ? (
                  <><ChevronUp className="h-3.5 w-3.5" /> Cancel</>
                ) : (
                  <><ChevronDown className="h-3.5 w-3.5" /> Withdraw</>
                )}
              </Button>
            )}
          </div>

          {/* Inline withdrawal form */}
          {withdrawOpen && (
            <div className="mt-4 space-y-3 border-t border-amber-200 pt-4 dark:border-amber-700">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[120px]">
                  <Label className="text-xs">Amount to withdraw (₱)</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={withdrawAmount}
                    onChange={(e) => { setWithdrawAmount(e.target.value); setSaveErr(null); }}
                    className="mt-1 h-8 text-sm"
                    autoFocus
                  />
                  {amtNum > 0 && amtNum < totals.pending && (
                    <p className="mt-1 text-[11px] text-amber-700">
                      {peso(afterPending)} will remain pending
                    </p>
                  )}
                </div>

                <div className="flex-1 min-w-[150px]">
                  <Label className="text-xs">Finance account</Label>
                  <select
                    className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-sm"
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
              </div>

              <div>
                <Label className="text-xs">Notes <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input
                  value={withdrawNotes}
                  onChange={(e) => setWithdrawNotes(e.target.value)}
                  placeholder="e.g. Shopee payout ref #12345"
                  className="mt-1 h-8 text-sm"
                />
              </div>

              {/* Preview */}
              {withdrawPreview && withdrawPreview.touched.length > 0 && (
                <div className="rounded-md bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                  Will be applied to <span className="font-semibold text-foreground">{withdrawPreview.touched.length}</span> order{withdrawPreview.touched.length !== 1 ? "s" : ""}
                  {withdrawPreview.touched.length <= 5 && (
                    <span className="ml-1">
                      ({withdrawPreview.touched.map((t) => `#${t.order.order_no}`).join(", ")})
                    </span>
                  )}
                </div>
              )}

              {saveErr && <p className="text-xs text-destructive">{saveErr}</p>}

              <Button size="sm" className="w-full" disabled={saving} onClick={recordWithdrawal}>
                {saving ? "Saving…" : "Confirm withdrawal"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Success message */}
      {saveMsg && (
        <div className="mb-4 rounded-md bg-green-50 px-4 py-2 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-300">
          {saveMsg}
        </div>
      )}

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
          <div className="self-end">
            <CsvExportDialog
              label="Export CSV"
              filename="bigseller_sales"
              columns={[
                { header: "Order #",       value: (r: any) => r.order_no },
                { header: "External #",    value: (r: any) => r.external_order_no ?? "" },
                { header: "Waybill",       value: (r: any) => r.waybill_no ?? "" },
                { header: "Customer",      value: (r: any) => r.customer_name ?? "" },
                { header: "Store",         value: (r: any) => r.source ?? "" },
                { header: "Stage",         value: (r: any) => r.stage ?? "" },
                { header: "Sale Total",    value: (r: any) => r.total ?? 0 },
                { header: "Withdrawn",     value: (r: any) => r.withdrawn_amount ?? 0 },
                { header: "Pending",       value: (r: any) => (Number(r.total ?? 0) - Number(r.withdrawn_amount ?? 0)) },
                { header: "Created",       value: (r: any) => String(r.created_at ?? "").slice(0, 10) },
              ]}
              fetchRows={(from, to) => {
                return filtered.filter((r: any) => {
                  const d = String(r.created_at ?? "").slice(0, 10);
                  if (from && d < from) return false;
                  if (to && d > to) return false;
                  return true;
                });
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
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

                return (
                  <tr
                    key={o.id}
                    className={`border-t hover:bg-muted/20 ${fullyWithdrawn ? "opacity-60" : ""}`}
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
                    <td className="py-2.5 pr-4 text-right font-mono text-xs">
                      {pending > 0 ? (
                        <span className="font-semibold text-amber-700 dark:text-amber-400">{peso(pending)}</span>
                      ) : (
                        <span className="text-green-600">✓</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
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
