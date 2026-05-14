"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { peso } from "@/lib/utils";
import { PackageX, RotateCcw, Search } from "lucide-react";

type Order = {
  id: string;
  order_no: number;
  customer_name: string;
  kind?: string;
  order_type?: string;
  source?: string | null;
  stage?: string | null;
  status?: string | null;
  total?: number | null;
  down_payment?: number | null;
  return_status?: "returning" | "returned" | null;
  return_reason?: string | null;
  return_inventory_type?: "inventory" | "ready_made" | null;
  return_inventory_ref?: Record<string, unknown> | null;
  notes?: string | null;
  waybill_no?: string | null;
  external_order_no?: string | null;
  sku_code?: string | null;
  customer_social?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type InvItem = { id: string; name: string; category?: string | null; quantity?: number | null; unit?: string | null };
type RmGroup = { id: string; name: string; sort_order: number };
type RmBoard = { id: string; name: string; group_id?: string | null; sort_order: number };
type RmRow = { id: string; board_id: string; row_label: string; sort_order: number };
type RmCol = { id: string; board_id: string; header_name: string; sort_order: number };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function orderLabel(o: Order) {
  return `#${o.order_no} — ${o.customer_name}`;
}
function orderKindLabel(o: Order) {
  const k = String(o.kind || o.order_type || "").toLowerCase();
  if (k === "online" || k === "bigseller") return "Online";
  if (k === "local") return "Walk-in";
  if (k === "services") return "Services";
  if (k === "sublimation") return "Sublimation";
  return k || "—";
}
function formatDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

// ---------------------------------------------------------------------------
// New Return Dialog: browse completed orders → initiate return
// ---------------------------------------------------------------------------
function NewReturnDialog({
  completedOrders,
  onClose,
  onCreated,
}: {
  completedOrders: Order[];
  onClose: () => void;
  onCreated: (updated: Order) => void;
}) {
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return completedOrders;
    return completedOrders.filter((o) =>
      [o.order_no, o.customer_name, o.notes, o.waybill_no, o.external_order_no, o.sku_code, o.customer_social]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [completedOrders, search]);

  async function confirm() {
    if (!selected) { setErr("Select an order first."); return; }
    setSaving(true);
    setErr(null);
    const { data, error } = await supabase
      .from("orders")
      .update({ return_status: "returning", return_reason: reason.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", selected.id)
      .select("id,order_no,customer_name,kind,order_type,source,stage,status,total,down_payment,return_status,return_reason,return_inventory_type,return_inventory_ref,updated_at,created_at")
      .single();
    if (error) { setErr(error.message); setSaving(false); return; }
    onCreated(data as Order);
  }

  return (
    <Dialog open onClose={onClose} title="Initiate return" size="lg">
      <div className="space-y-4">
        {!selected ? (
          <>
            <p className="text-sm text-muted-foreground">
              Search and select the completed order being returned by the buyer.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-9"
                placeholder="Order #, customer name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border">
              {filtered.length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">No completed orders found.</p>
              )}
              {filtered.map((o) => {
                const total = Number(o.total || 0);
                const paid = Number(o.down_payment || 0);
                return (
                  <button
                    key={o.id}
                    className="flex w-full items-center justify-between border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-muted/40"
                    onClick={() => setSelected(o)}
                  >
                    <div>
                      <div className="font-semibold">#{o.order_no} — {o.customer_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {orderKindLabel(o)} · {formatDate(o.updated_at)}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-mono font-semibold">{peso(total)}</div>
                      {paid > 0 && <div className="text-muted-foreground">Paid: {peso(paid)}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </>
        ) : (
          <>
            {/* Selected order */}
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">#{selected.order_no} — {selected.customer_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {orderKindLabel(selected)} · Total: {peso(Number(selected.total || 0))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setSelected(null)}
                >
                  Change
                </Button>
              </div>
            </div>

            <div>
              <Label>Return reason <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
              <Input
                className="mt-1"
                placeholder="e.g. Wrong size, defective item, buyer changed mind…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
            </div>

            {err && <p className="text-sm text-destructive">{err}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={confirm} disabled={saving} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Mark as returning to seller"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Restock Dialog: when order is "returned to seller" → add to inventory
// ---------------------------------------------------------------------------
function RestockDialog({
  order,
  invItems,
  rmGroups,
  rmBoards,
  onClose,
  onRestocked,
}: {
  order: Order;
  invItems: InvItem[];
  rmGroups: RmGroup[];
  rmBoards: RmBoard[];
  onClose: () => void;
  onRestocked: (updated: Order) => void;
}) {
  const supabase = createClient();

  const [invType, setInvType] = useState<"inventory" | "ready_made">("inventory");
  // Inventory
  const [invSearch, setInvSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<InvItem | null>(null);
  const [qtyToAdd, setQtyToAdd] = useState("1");
  // Ready-made
  const [selectedBoardId, setSelectedBoardId] = useState(rmBoards[0]?.id ?? "");
  const [rmRows, setRmRows] = useState<RmRow[]>([]);
  const [rmCols, setRmCols] = useState<RmCol[]>([]);
  const [selectedRowId, setSelectedRowId] = useState("");
  const [selectedColId, setSelectedColId] = useState("");
  const [rmQtyToAdd, setRmQtyToAdd] = useState("1");
  const [loadingGrid, setLoadingGrid] = useState(false);

  const [step, setStep] = useState<"choose" | "inventory" | "ready_made">("choose");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadBoard(boardId: string) {
    setLoadingGrid(true);
    const [{ data: rows }, { data: cols }] = await Promise.all([
      supabase.from("ready_made_rows").select("id,board_id,row_label,sort_order").eq("board_id", boardId).order("sort_order"),
      supabase.from("ready_made_columns").select("id,board_id,header_name,sort_order").eq("board_id", boardId).order("sort_order"),
    ]);
    setRmRows((rows as RmRow[]) || []);
    setRmCols((cols as RmCol[]) || []);
    setSelectedRowId((rows as RmRow[])?.[0]?.id ?? "");
    setSelectedColId((cols as RmCol[])?.[0]?.id ?? "");
    setLoadingGrid(false);
  }

  function chooseType(t: "inventory" | "ready_made") {
    setInvType(t);
    setStep(t);
    if (t === "ready_made" && selectedBoardId) {
      void loadBoard(selectedBoardId);
    }
  }

  const filteredInvItems = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    if (!q) return invItems;
    return invItems.filter((i) => `${i.name} ${i.category || ""}`.toLowerCase().includes(q));
  }, [invItems, invSearch]);

  async function saveInventory() {
    if (!selectedItem) { setErr("Select an inventory item."); return; }
    const qty = Number(qtyToAdd);
    if (!qty || qty <= 0) { setErr("Enter a valid quantity."); return; }
    setSaving(true);
    setErr(null);

    // Add quantity to existing inventory item
    const newQty = (Number(selectedItem.quantity) || 0) + qty;
    const { error: ie } = await supabase
      .from("inventory")
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq("id", selectedItem.id);
    if (ie) { setErr(ie.message); setSaving(false); return; }

    // Update order
    const ref = { item_id: selectedItem.id, item_name: selectedItem.name, quantity: qty };
    const { data, error: oe } = await supabase
      .from("orders")
      .update({
        return_status: "returned",
        return_inventory_type: "inventory",
        return_inventory_ref: ref,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .select("id,order_no,customer_name,kind,order_type,source,stage,status,total,down_payment,return_status,return_reason,return_inventory_type,return_inventory_ref,updated_at,created_at")
      .single();
    if (oe) { setErr(oe.message); setSaving(false); return; }
    onRestocked(data as Order);
  }

  async function saveReadyMade() {
    if (!selectedBoardId || !selectedRowId || !selectedColId) { setErr("Select a sheet, row, and column."); return; }
    const qty = Number(rmQtyToAdd);
    if (!qty || qty <= 0) { setErr("Enter a valid quantity."); return; }
    setSaving(true);
    setErr(null);

    // Read current cell value, add qty
    const { data: cellData } = await supabase
      .from("ready_made_cells")
      .select("id,value")
      .eq("row_id", selectedRowId)
      .eq("column_id", selectedColId)
      .maybeSingle();

    const currentVal = parseFloat(cellData?.value ?? "0") || 0;
    const newVal = String(currentVal + qty);

    if (cellData?.id) {
      const { error: ce } = await supabase.from("ready_made_cells").update({ value: newVal }).eq("id", cellData.id);
      if (ce) { setErr(ce.message); setSaving(false); return; }
    } else {
      const { error: ce } = await supabase.from("ready_made_cells").insert({
        row_id: selectedRowId,
        column_id: selectedColId,
        board_id: selectedBoardId,
        value: newVal,
      });
      if (ce) { setErr(ce.message); setSaving(false); return; }
    }

    const board = rmBoards.find((b) => b.id === selectedBoardId);
    const row = rmRows.find((r) => r.id === selectedRowId);
    const col = rmCols.find((c) => c.id === selectedColId);
    const ref = {
      board_id: selectedBoardId,
      board_name: board?.name,
      row_id: selectedRowId,
      row_label: row?.row_label,
      col_id: selectedColId,
      col_name: col?.header_name,
      quantity: qty,
    };

    const { data, error: oe } = await supabase
      .from("orders")
      .update({
        return_status: "returned",
        return_inventory_type: "ready_made",
        return_inventory_ref: ref,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .select("id,order_no,customer_name,kind,order_type,source,stage,status,total,down_payment,return_status,return_reason,return_inventory_type,return_inventory_ref,updated_at,created_at")
      .single();
    if (oe) { setErr(oe.message); setSaving(false); return; }
    onRestocked(data as Order);
  }

  const boardsByGroup = useMemo(() => {
    const map = new Map<string | null, RmBoard[]>();
    for (const b of rmBoards) {
      const key = b.group_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return map;
  }, [rmBoards]);

  return (
    <Dialog open onClose={onClose} title="Restock returned item" size="lg">
      <div className="space-y-4">
        {/* Order summary */}
        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <div className="font-semibold">#{order.order_no} — {order.customer_name}</div>
          {order.return_reason && (
            <div className="mt-0.5 text-xs text-muted-foreground">Reason: {order.return_reason}</div>
          )}
          <div className="mt-0.5 text-xs text-muted-foreground">
            Total sale: {peso(Number(order.total || 0))}
          </div>
        </div>

        {/* Step 1: choose inventory type */}
        {step === "choose" && (
          <div>
            <p className="mb-3 text-sm font-medium">Where will the returned item be restocked?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className="flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
                onClick={() => chooseType("inventory")}
              >
                <span className="text-sm font-semibold">Inventory</span>
                <span className="text-xs text-muted-foreground">
                  Regular supplies, materials, and stock items
                </span>
              </button>
              <button
                className="flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
                onClick={() => chooseType("ready_made")}
              >
                <span className="text-sm font-semibold">Ready-made inventory</span>
                <span className="text-xs text-muted-foreground">
                  Shirts, jerseys, and finished products by sheet
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2a: regular inventory */}
        {step === "inventory" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Select inventory item to restock</p>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setStep("choose")}>
                ← Change
              </Button>
            </div>

            {!selectedItem ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    className="pl-9"
                    placeholder="Search items…"
                    value={invSearch}
                    onChange={(e) => setInvSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-52 overflow-y-auto rounded-md border">
                  {filteredInvItems.length === 0 && (
                    <p className="p-3 text-center text-sm text-muted-foreground">No items found.</p>
                  )}
                  {filteredInvItems.map((item) => (
                    <button
                      key={item.id}
                      className="flex w-full items-center justify-between border-b px-3 py-2.5 text-left text-sm last:border-0 hover:bg-muted/40"
                      onClick={() => setSelectedItem(item)}
                    >
                      <div>
                        <div className="font-medium">{item.name}</div>
                        {item.category && <div className="text-xs text-muted-foreground">{item.category}</div>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.quantity ?? 0} {item.unit || "pcs"}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
                  <div>
                    <div className="font-semibold">{selectedItem.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Current stock: {selectedItem.quantity ?? 0} {selectedItem.unit || "pcs"}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedItem(null)}>
                    Change
                  </Button>
                </div>
                <div>
                  <Label>Quantity to add back</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={qtyToAdd}
                    onChange={(e) => { setQtyToAdd(e.target.value); setErr(null); }}
                    className="mt-1 w-36"
                    autoFocus
                  />
                  {Number(qtyToAdd) > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      New stock: {(Number(selectedItem.quantity) || 0) + Number(qtyToAdd)} {selectedItem.unit || "pcs"}
                    </p>
                  )}
                </div>
                {err && <p className="text-sm text-destructive">{err}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                  <Button onClick={saveInventory} disabled={saving}>
                    {saving ? "Saving…" : "Confirm restock"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 2b: ready-made inventory */}
        {step === "ready_made" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Select sheet, row, and column</p>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setStep("choose")}>
                ← Change
              </Button>
            </div>

            <div>
              <Label>Sheet</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedBoardId}
                onChange={(e) => {
                  setSelectedBoardId(e.target.value);
                  void loadBoard(e.target.value);
                }}
              >
                {rmGroups.length > 0
                  ? rmGroups.map((g) => (
                      <optgroup key={g.id} label={g.name}>
                        {(boardsByGroup.get(g.id) ?? []).map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </optgroup>
                    ))
                  : rmBoards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)
                }
                {(boardsByGroup.get(null) ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {loadingGrid ? (
              <p className="text-sm text-muted-foreground">Loading sheet…</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Row (item / product)</Label>
                    <select
                      className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={selectedRowId}
                      onChange={(e) => setSelectedRowId(e.target.value)}
                    >
                      {rmRows.map((r) => <option key={r.id} value={r.id}>{r.row_label}</option>)}
                      {rmRows.length === 0 && <option value="">— no rows —</option>}
                    </select>
                  </div>
                  <div>
                    <Label>Column (size / variant)</Label>
                    <select
                      className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={selectedColId}
                      onChange={(e) => setSelectedColId(e.target.value)}
                    >
                      {rmCols.map((c) => <option key={c.id} value={c.id}>{c.header_name}</option>)}
                      {rmCols.length === 0 && <option value="">— no columns —</option>}
                    </select>
                  </div>
                </div>

                <div>
                  <Label>Quantity to add back</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={rmQtyToAdd}
                    onChange={(e) => { setRmQtyToAdd(e.target.value); setErr(null); }}
                    className="mt-1 w-36"
                  />
                </div>
              </>
            )}

            {err && <p className="text-sm text-destructive">{err}</p>}

            {!loadingGrid && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={saveReadyMade} disabled={saving || loadingGrid}>
                  {saving ? "Saving…" : "Confirm restock"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------
export function ReturnsClient({
  returnOrders: initialReturnOrders,
  completedOrders: initialCompleted,
  invItems,
  rmGroups,
  rmBoards,
  canEdit = true,
}: {
  returnOrders: Order[];
  completedOrders: Order[];
  invItems: InvItem[];
  rmGroups: RmGroup[];
  rmBoards: RmBoard[];
  canEdit?: boolean;
}) {
  const supabase = createClient();
  const [returnOrders, setReturnOrders] = useState<Order[]>(initialReturnOrders);
  const [completedOrders, setCompletedOrders] = useState<Order[]>(initialCompleted);
  const [tab, setTab] = useState<"returning" | "returned">("returning");
  const [newReturnOpen, setNewReturnOpen] = useState(false);
  const [restockOrder, setRestockOrder] = useState<Order | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Re-fetch on mount so navigating back always shows the latest persisted state
  useEffect(() => {
    async function refresh() {
      const [{ data: ro }, { data: co }] = await Promise.all([
        supabase
          .from("orders")
          .select("id,order_no,customer_name,kind,order_type,source,stage,status,total,down_payment,return_status,return_reason,return_inventory_type,return_inventory_ref,updated_at,created_at")
          .in("return_status", ["returning", "returned"])
          .order("updated_at", { ascending: false }),
        supabase
          .from("orders")
          .select("id,order_no,customer_name,kind,order_type,source,stage,status,total,down_payment,return_status,notes,waybill_no,external_order_no,sku_code,customer_social,updated_at,created_at")
          .or("stage.eq.completed,stage.eq.for_pickup,status.eq.delivered,status.eq.ready")
          .is("return_status", null)
          .order("updated_at", { ascending: false })
          .limit(200),
      ]);
      if (ro) setReturnOrders(ro as Order[]);
      if (co) setCompletedOrders(co as Order[]);
    }
    void refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const returning = useMemo(() => returnOrders.filter((o) => o.return_status === "returning"), [returnOrders]);
  const returned = useMemo(() => returnOrders.filter((o) => o.return_status === "returned"), [returnOrders]);

  function handleNewReturn(updated: Order) {
    setReturnOrders((prev) => [updated, ...prev]);
    setCompletedOrders((prev) => prev.filter((o) => o.id !== updated.id));
    setNewReturnOpen(false);
  }

  function handleRestocked(updated: Order) {
    setReturnOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o));
    setRestockOrder(null);
  }

  async function revertToCompleted(order: Order) {
    setErr(null);
    const { error } = await supabase
      .from("orders")
      .update({ return_status: null, return_reason: null, updated_at: new Date().toISOString() })
      .eq("id", order.id);
    if (error) { setErr(error.message); return; }
    setReturnOrders((prev) => prev.filter((o) => o.id !== order.id));
    setCompletedOrders((prev) => [{ ...order, return_status: null, return_reason: null }, ...prev]);
  }

  const displayList = tab === "returning" ? returning : returned;

  return (
    <>
      {newReturnOpen && (
        <NewReturnDialog
          completedOrders={completedOrders}
          onClose={() => setNewReturnOpen(false)}
          onCreated={handleNewReturn}
        />
      )}

      {restockOrder && (
        <RestockDialog
          order={restockOrder}
          invItems={invItems}
          rmGroups={rmGroups}
          rmBoards={rmBoards}
          onClose={() => setRestockOrder(null)}
          onRestocked={handleRestocked}
        />
      )}

      {/* Header actions + tabs */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
          {(["returning", "returned"] as const).map((t) => {
            const count = t === "returning" ? returning.length : returned.length;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "returning" ? "Returning to seller" : "Returned to seller"}
                {count > 0 && (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                    tab === t ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {canEdit && (
          <Button className="gap-1.5" onClick={() => setNewReturnOpen(true)}>
            <PackageX className="h-4 w-4" />
            New return
          </Button>
        )}
      </div>

      {err && (
        <div className="mb-3 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{err}</div>
      )}

      {/* Tab description */}
      {tab === "returning" && (
        <p className="mb-3 text-sm text-muted-foreground">
          These orders are in transit back to you. Their sales are excluded from totals until resolved.
          Once the item physically arrives, click <strong>Mark as returned</strong> to restock it.
        </p>
      )}
      {tab === "returned" && (
        <p className="mb-3 text-sm text-muted-foreground">
          These orders have been received back and restocked into inventory.
        </p>
      )}

      {/* Summary bar for returning tab */}
      {tab === "returning" && returning.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-800 dark:bg-amber-900/10">
          <div>
            <div className="text-xs font-medium text-amber-700 dark:text-amber-400">Returns in transit</div>
            <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{returning.length}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-amber-700 dark:text-amber-400">Sales withdrawn</div>
            <div className="text-xl font-bold text-amber-700 dark:text-amber-400">
              {peso(returning.reduce((s, o) => s + Number(o.total || 0), 0))}
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {displayList.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <PackageX className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">
              {tab === "returning"
                ? "No orders currently returning. Click \"New return\" to start one."
                : "No orders marked as returned yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {displayList.map((o) => {
            const total = Number(o.total || 0);
            const paid = Number(o.down_payment || 0);
            const ref = o.return_inventory_ref as Record<string, unknown> | null;
            return (
              <Card key={o.id}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">#{o.order_no}</span>
                        <span className="text-sm font-medium">{o.customer_name}</span>
                        <Badge variant="outline" className="text-xs">{orderKindLabel(o)}</Badge>
                        {o.return_status === "returning" && (
                          <Badge variant="amber" className="text-xs">Returning to seller</Badge>
                        )}
                        {o.return_status === "returned" && (
                          <Badge variant="green" className="text-xs">Returned ✓</Badge>
                        )}
                      </div>
                      {o.return_reason && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Reason: {o.return_reason}
                        </div>
                      )}
                      {ref && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Restocked to:{" "}
                          {o.return_inventory_type === "inventory"
                            ? `Inventory — ${String(ref.item_name || "")} (+${ref.quantity})`
                            : `Ready-made — ${String(ref.board_name || "")} › ${String(ref.row_label || "")} › ${String(ref.col_name || "")} (+${ref.quantity})`
                          }
                        </div>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">
                        Updated: {formatDate(o.updated_at)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-right">
                      <div className="text-sm">
                        <div className="font-mono font-semibold">{peso(total)}</div>
                        {paid > 0 && (
                          <div className="text-xs text-muted-foreground">Paid: {peso(paid)}</div>
                        )}
                      </div>

                      {o.return_status === "returning" && canEdit && (
                        <>
                          <Button
                            size="sm"
                            className="h-8 gap-1 text-xs"
                            onClick={() => setRestockOrder(o)}
                          >
                            <PackageX className="h-3.5 w-3.5" />
                            Mark as returned
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs text-muted-foreground"
                            onClick={() => revertToCompleted(o)}
                          >
                            Undo
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
