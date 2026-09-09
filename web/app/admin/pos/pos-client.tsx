"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, Package,
  CheckCircle2, ChevronDown, Receipt, User, Banknote, X, Clock,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type InventoryItem = {
  id: string;
  name: string;
  category?: string | null;
  item_type?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unit_cost?: number | null;
};

type FinanceAccount = { id: string; name: string; kind: string; balance?: number | null };

type CartItem = {
  _key: string;
  product_name: string;
  inventory_id?: string | null;
  inventory_stock?: number | null;
  unit?: string | null;
  quantity: number;
  unit_price: number;
};

type OrderStatus = "pending" | "completed";

type Props = {
  inventoryItems: InventoryItem[];
  financeAccounts: FinanceAccount[];
  viewerRole: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function peso(n: number) {
  return "₱" + n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let _keyCounter = 0;
function nextKey() { return `ci_${++_keyCounter}`; }

// ─── Component ─────────────────────────────────────────────────────────────

export function PosClient({ inventoryItems, financeAccounts, viewerRole }: Props) {
  const supabase = createClient();
  const router = useRouter();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState<string>("");
  const [orderStatus, setOrderStatus] = useState<OrderStatus>("completed");
  const [saving, setSaving] = useState(false);
  const [successOrderNo, setSuccessOrderNo] = useState<number | null>(null);
  const [successStatus, setSuccessStatus] = useState<OrderStatus>("completed");

  const [productSearch, setProductSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customQty, setCustomQty] = useState("1");

  // ─── Derived ────────────────────────────────────────────────────────────

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const item of inventoryItems) { if (item.category) cats.add(item.category); }
    return Array.from(cats).sort();
  }, [inventoryItems]);

  const filteredInventory = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return inventoryItems.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [inventoryItems, productSearch, selectedCategory]);

  const subtotal = useMemo(
    () => cart.reduce((s, ci) => s + ci.quantity * ci.unit_price, 0),
    [cart],
  );

  // ─── Cart helpers ────────────────────────────────────────────────────────

  function addInventoryItem(item: InventoryItem) {
    setCart((prev) => {
      const existing = prev.find((ci) => ci.inventory_id === item.id);
      if (existing) return prev.map((ci) => ci._key === existing._key ? { ...ci, quantity: ci.quantity + 1 } : ci);
      return [...prev, {
        _key: nextKey(),
        product_name: item.name,
        inventory_id: item.id,
        inventory_stock: item.quantity ?? null,
        unit: item.unit ?? null,
        quantity: 1,
        unit_price: item.unit_cost ?? 0,
      }];
    });
  }

  function addCustomItem() {
    const name = customName.trim();
    const price = parseFloat(customPrice) || 0;
    const qty   = parseFloat(customQty)   || 1;
    if (!name) return;
    setCart((prev) => [...prev, {
      _key: nextKey(), product_name: name,
      inventory_id: null, quantity: qty, unit_price: price,
    }]);
    setCustomName(""); setCustomPrice(""); setCustomQty("1");
    setShowCustomForm(false);
  }

  function updateCartItem(key: string, field: "quantity" | "unit_price", value: number) {
    setCart((prev) => prev.map((ci) => ci._key === key ? { ...ci, [field]: Math.max(0, value) } : ci));
  }

  function removeCartItem(key: string) {
    setCart((prev) => prev.filter((ci) => ci._key !== key));
  }

  // ─── Submit order ────────────────────────────────────────────────────────

  async function submitOrder() {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      // 1. Get current user id (needed for order_records.submitted_by)
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id;

      // 2. Insert the POS order
      const stage = orderStatus === "completed" ? "completed" : "design_layout";
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          kind: "pos",
          order_type: "POS",
          customer_name: customerName.trim() || null,
          total: subtotal,
          quantity: cart.reduce((s, ci) => s + ci.quantity, 0),
          notes: notes.trim() || null,
          stage,
          status: orderStatus,
        })
        .select("id, order_no")
        .single();

      if (orderErr || !order) { alert(orderErr?.message ?? "Failed to create order"); setSaving(false); return; }

      // 3. Insert POS line items
      const { error: itemsErr } = await supabase.from("pos_order_items").insert(
        cart.map((ci, idx) => ({
          order_id: order.id,
          product_name: ci.product_name,
          product_source: ci.inventory_id ? "inventory" : "custom",
          inventory_id: ci.inventory_id ?? null,
          quantity: ci.quantity,
          unit_price: ci.unit_price,
          sort_order: idx,
        }))
      );
      if (itemsErr) { alert(itemsErr.message); setSaving(false); return; }

      if (orderStatus === "completed") {
        // 4a. Record payment to finance account if selected
        if (paymentAccountId) {
          await supabase.from("finance_transactions").insert({
            account_id: paymentAccountId,
            direction: "in",
            amount: subtotal,
            description: `POS Sale #${order.order_no}${customerName ? ` — ${customerName.trim()}` : ""}`,
            occurred_at: new Date().toISOString(),
          });
        }

        // 4b. Create a Daily Order Record so manager can review and deduct stocks
        if (userId) {
          // Build stock_lines as a simple table sheet
          const colProduct  = "col-product";
          const colQty      = "col-qty";
          const colPrice    = "col-price";
          const colTotal    = "col-total";

          const stockLines = [{
            id: "sheet-pos",
            name: `POS Sale #${order.order_no} — Items`,
            columns: [
              { id: colProduct, label: "Product" },
              { id: colQty,     label: "Qty" },
              { id: colPrice,   label: "Unit Price" },
              { id: colTotal,   label: "Total" },
            ],
            rows: cart.map((ci, i) => ({
              id: `row-${i}`,
              cells: {
                [colProduct]: ci.product_name,
                [colQty]:     String(ci.quantity),
                [colPrice]:   peso(ci.unit_price),
                [colTotal]:   peso(ci.quantity * ci.unit_price),
              },
            })),
          }];

          await supabase.from("order_records").insert({
            submitted_by: userId,
            record_date: new Date().toISOString().slice(0, 10),
            title: `POS Sale #${order.order_no}${customerName ? ` — ${customerName.trim()}` : ""}`,
            notes: `POS sale total: ${peso(subtotal)}${notes.trim() ? `\n${notes.trim()}` : ""}`,
            status: "submitted",   // ready for admin/manager to review
            stock_lines: stockLines,
          });
        }
      }

      setSuccessOrderNo(order.order_no as number);
      setSuccessStatus(orderStatus);
      setCart([]); setCustomerName(""); setNotes(""); setPaymentAccountId("");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // ─── Success screen ───────────────────────────────────────────────────────

  if (successOrderNo != null) {
    const isPending = successStatus === "pending";
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <div className={"flex h-20 w-20 items-center justify-center rounded-full " + (isPending ? "bg-amber-500/15" : "bg-green-500/15")}>
          {isPending ? <Clock className="h-10 w-10 text-amber-500" /> : <CheckCircle2 className="h-10 w-10 text-green-500" />}
        </div>
        <div>
          <h2 className="text-2xl font-bold">{isPending ? "Order Saved as Pending!" : "Sale Complete!"}</h2>
          <p className="mt-1 text-muted-foreground">
            {isPending
              ? `Order #${successOrderNo} is now in the POS queue.`
              : `Order #${successOrderNo} recorded. A Daily Order Record has been submitted for stock review.`}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            onClick={() => setSuccessOrderNo(null)}
          >
            <Plus className="h-4 w-4" /> New Sale
          </button>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
            onClick={() => router.push("/admin/orders?type=pos")}
          >
            <Receipt className="h-4 w-4" /> View POS Orders
          </button>
          {!isPending && (
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
              onClick={() => router.push("/admin/order-records")}
            >
              <Receipt className="h-4 w-4" /> Daily Order Records
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─── Main POS Layout ─────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 overflow-hidden">
      {/* ── LEFT: Product Browser ───────────────────────────────────────── */}
      <div className="flex w-[55%] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h2 className="mb-3 text-base font-semibold">Products</h2>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
              placeholder="Search products…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            {productSearch && (
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setProductSearch("")}>
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              className={"h-7 rounded-full px-3 text-xs font-medium transition-colors " + (selectedCategory === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground")}
              onClick={() => setSelectedCategory("all")}
            >All</button>
            {categories.map((cat) => (
              <button
                key={cat}
                className={"h-7 rounded-full px-3 text-xs font-medium transition-colors " + (selectedCategory === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground")}
                onClick={() => setSelectedCategory(cat)}
              >{cat}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {/* Custom item */}
          <button
            className="mb-3 flex w-full items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
            onClick={() => setShowCustomForm(true)}
          >
            <Plus className="h-4 w-4" /> Add custom item (not in inventory)
          </button>

          {showCustomForm && (
            <div className="mb-3 rounded-lg border border-border bg-background p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Custom item</span>
                <button onClick={() => setShowCustomForm(false)}><X className="h-4 w-4 text-muted-foreground" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className="col-span-2 h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary/60" placeholder="Product / item name *" value={customName} onChange={(e) => setCustomName(e.target.value)} />
                <input type="number" min={0} step="0.01" className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary/60" placeholder="Unit price" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} />
                <input type="number" min={1} step="1" className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary/60" placeholder="Qty" value={customQty} onChange={(e) => setCustomQty(e.target.value)} />
              </div>
              <button className="mt-2 w-full rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50" onClick={addCustomItem} disabled={!customName.trim()}>Add to cart</button>
            </div>
          )}

          {/* Product grid */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filteredInventory.length === 0 ? (
              <div className="col-span-3 py-10 text-center text-sm text-muted-foreground">No products found</div>
            ) : filteredInventory.map((item) => {
              const inCart = cart.find((ci) => ci.inventory_id === item.id);
              const outOfStock = (item.quantity ?? 0) <= 0;
              return (
                <button
                  key={item.id}
                  className={"group relative flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all " + (inCart ? "border-primary/60 bg-primary/5 shadow-sm" : outOfStock ? "cursor-not-allowed border-border opacity-50" : "border-border bg-background hover:border-primary/40 hover:bg-accent/50 hover:shadow-sm")}
                  onClick={() => !outOfStock && addInventoryItem(item)}
                  disabled={outOfStock}
                  title={outOfStock ? "Out of stock" : undefined}
                >
                  <div className="flex w-full items-start justify-between gap-1">
                    <span className="line-clamp-2 text-[12px] font-medium leading-tight">{item.name}</span>
                    {inCart && <span className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{inCart.quantity}</span>}
                  </div>
                  {item.category && <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{item.category}</span>}
                  <div className="mt-auto flex w-full items-center justify-between pt-1">
                    <span className="text-xs font-semibold text-primary">{item.unit_cost != null ? peso(item.unit_cost) : "—"}</span>
                    <span className={"text-[10px] " + (outOfStock ? "text-destructive" : (item.quantity ?? 0) <= 5 ? "text-amber-500" : "text-muted-foreground")}>
                      {outOfStock ? "Out of stock" : `${item.quantity ?? 0}${item.unit ? " " + item.unit : ""} left`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── RIGHT: Cart ──────────────────────────────────────────────────── */}
      <div className="flex w-[45%] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          <h2 className="flex-1 text-base font-semibold">Current Order</h2>
          {cart.length > 0 && <button className="text-xs text-destructive hover:underline" onClick={() => setCart([])}>Clear all</button>}
        </div>

        <div className="border-b border-border px-4 py-3">
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
              placeholder="Customer name (optional)"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
              <Package className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Click a product to add it to the cart</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {cart.map((ci) => (
                <div key={ci._key} className="flex items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{ci.product_name}</p>
                    {ci.inventory_stock != null && (
                      <p className="text-[10px] text-muted-foreground">Stock: {ci.inventory_stock}{ci.unit ? " " + ci.unit : ""}</p>
                    )}
                  </div>
                  <input
                    type="number" min={0} step="0.01"
                    className="h-7 w-24 shrink-0 rounded border border-border bg-transparent px-2 text-right text-xs font-mono outline-none focus:border-primary/60"
                    value={ci.unit_price}
                    onChange={(e) => updateCartItem(ci._key, "unit_price", parseFloat(e.target.value) || 0)}
                    title="Unit price"
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <button className="flex h-6 w-6 items-center justify-center rounded border border-border bg-muted hover:bg-accent" onClick={() => updateCartItem(ci._key, "quantity", ci.quantity - 1)}><Minus className="h-3 w-3" /></button>
                    <input type="number" min={1} step="1" className="h-6 w-10 rounded border border-border bg-transparent text-center text-xs font-mono outline-none focus:border-primary/60" value={ci.quantity} onChange={(e) => updateCartItem(ci._key, "quantity", parseFloat(e.target.value) || 1)} />
                    <button className="flex h-6 w-6 items-center justify-center rounded border border-border bg-muted hover:bg-accent" onClick={() => updateCartItem(ci._key, "quantity", ci.quantity + 1)}><Plus className="h-3 w-3" /></button>
                  </div>
                  <div className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">{peso(ci.quantity * ci.unit_price)}</div>
                  <button className="ml-1 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeCartItem(ci._key)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-muted/20 px-4 py-4">
          <textarea
            className="mb-3 h-14 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
            placeholder="Order notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {/* Status selector */}
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              className={"flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-all " + (orderStatus === "completed" ? "border-green-500/60 bg-green-500/10 text-green-600 dark:text-green-400" : "border-border bg-background text-muted-foreground hover:bg-accent")}
              onClick={() => setOrderStatus("completed")}
            >
              <CheckCircle2 className="h-4 w-4" /> Complete Sale
            </button>
            <button
              className={"flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-all " + (orderStatus === "pending" ? "border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400" : "border-border bg-background text-muted-foreground hover:bg-accent")}
              onClick={() => setOrderStatus("pending")}
            >
              <Clock className="h-4 w-4" /> Pending
            </button>
          </div>

          {/* Payment account (complete only) */}
          {orderStatus === "completed" && financeAccounts.length > 0 && (
            <div className="relative mb-3">
              <Banknote className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                className="h-9 w-full appearance-none rounded-md border border-border bg-background pl-9 pr-8 text-sm outline-none focus:border-primary/60"
                value={paymentAccountId}
                onChange={(e) => setPaymentAccountId(e.target.value)}
              >
                <option value="">Record payment to… (optional)</option>
                {financeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} — {a.kind}{a.balance != null ? ` (₱${Number(a.balance).toLocaleString()})` : ""}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          )}

          {orderStatus === "completed" && (
            <p className="mb-2 text-[11px] text-muted-foreground">
              A Daily Order Record will be submitted automatically for stock review.
            </p>
          )}

          {/* Totals */}
          <div className="mb-4 space-y-1 rounded-lg bg-background px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Items ({cart.reduce((s, ci) => s + ci.quantity, 0)})</span>
              <span className="font-mono">{peso(subtotal)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1 text-base font-bold">
              <span>Total</span>
              <span className="font-mono text-primary">{peso(subtotal)}</span>
            </div>
          </div>

          <button
            className={"flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold text-primary-foreground shadow transition-all disabled:cursor-not-allowed disabled:opacity-50 " + (orderStatus === "pending" ? "bg-amber-500 hover:bg-amber-600" : "bg-primary hover:bg-primary/90")}
            disabled={cart.length === 0 || saving}
            onClick={submitOrder}
          >
            {saving ? <span className="animate-pulse">Processing…</span>
              : orderStatus === "pending"
              ? <><Clock className="h-4 w-4" /> Save as Pending — {peso(subtotal)}</>
              : <><CheckCircle2 className="h-4 w-4" /> Complete Sale — {peso(subtotal)}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
