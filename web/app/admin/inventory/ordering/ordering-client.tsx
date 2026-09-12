"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { useConfirmAction } from "@/components/confirm-dialog";
import { Check, Package, Plus, Search, Trash2 } from "lucide-react";

export type RestockOrder = {
  id: string;
  status: "pending" | "completed";
  kind: "inventory" | "ready_made";
  inventory_id: string | null;
  ready_made_row_id: string | null;
  ready_made_column_id: string | null;
  item_label: string;
  qty: number;
  notes: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type InvItem = { id: string; name: string; category?: string | null; quantity?: number | null; unit?: string | null };
type RmGroup = { id: string; name: string; sort_order: number };
type RmBoard = { id: string; name: string; group_id: string | null; sort_order: number };
type RmRow = { id: string; board_id: string; row_label: string; sort_order: number };
type RmCol = { id: string; board_id: string; header_name: string; sort_order: number };

const SELECT =
  "id, status, kind, inventory_id, ready_made_row_id, ready_made_column_id, item_label, qty, notes, created_by, completed_at, created_at, updated_at";

function formatQty(n: number) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function OrderingClient({
  initial,
  userId,
  missingTable,
}: {
  initial: RestockOrder[];
  userId: string;
  missingTable?: boolean;
}) {
  const supabase = createClient();
  const { ask, dialog: confirmDialog } = useConfirmAction();
  const [rows, setRows] = useState<RestockOrder[]>(initial);
  const [tab, setTab] = useState<"pending" | "completed">("pending");
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pending = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);
  const completed = useMemo(() => rows.filter((r) => r.status === "completed"), [rows]);
  const shown = tab === "pending" ? pending : completed;

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("restock_orders")
      .select(SELECT)
      .order("created_at", { ascending: false });
    if (error) {
      setErr(error.message);
      return;
    }
    setRows((data as RestockOrder[]) || []);
    setErr(null);
  }, [supabase]);

  async function completeOrder(row: RestockOrder) {
    setBusyId(row.id);
    setErr(null);
    const now = new Date().toISOString();
    const qty = Number(row.qty);
    if (!qty || qty <= 0) {
      setErr("This row has an invalid quantity.");
      setBusyId(null);
      return;
    }

    if (row.kind === "inventory") {
      if (!row.inventory_id) {
        setErr("This inventory item is no longer available.");
        setBusyId(null);
        return;
      }
      const { data: inv, error: ie } = await supabase
        .from("inventory")
        .select("id,quantity")
        .eq("id", row.inventory_id)
        .maybeSingle();
      if (ie || !inv) {
        setErr(ie?.message || "Inventory item was not found.");
        setBusyId(null);
        return;
      }
      const newQty = (Number(inv.quantity) || 0) + qty;
      const { error: ue } = await supabase
        .from("inventory")
        .update({ quantity: newQty, updated_at: now })
        .eq("id", inv.id);
      if (ue) {
        setErr(ue.message);
        setBusyId(null);
        return;
      }
    } else {
      if (!row.ready_made_row_id || !row.ready_made_column_id) {
        setErr("This ready-made cell is no longer available.");
        setBusyId(null);
        return;
      }
      const [{ data: rmRow }, { data: rmCol }] = await Promise.all([
        supabase.from("ready_made_rows").select("id,row_label,board_id").eq("id", row.ready_made_row_id).maybeSingle(),
        supabase.from("ready_made_columns").select("id,header_name").eq("id", row.ready_made_column_id).maybeSingle(),
      ]);
      if (!rmRow || !rmCol) {
        setErr("Ready-made row or column was not found.");
        setBusyId(null);
        return;
      }
      const { data: board } = rmRow.board_id
        ? await supabase.from("ready_made_boards").select("id,name").eq("id", rmRow.board_id).maybeSingle()
        : { data: null };
      const { data: cell } = await supabase
        .from("ready_made_cells")
        .select("id,value")
        .eq("row_id", row.ready_made_row_id)
        .eq("column_id", row.ready_made_column_id)
        .maybeSingle();
      const currentVal = parseFloat(cell?.value ?? "0") || 0;
      const newVal = String(currentVal + qty);
      const contextPatch = {
        board_name_cache: board?.name ?? null,
        row_label_cache: rmRow.row_label ?? null,
        col_header_cache: rmCol.header_name ?? null,
      };
      if (cell?.id) {
        const { error: ce } = await supabase
          .from("ready_made_cells")
          .update({ value: newVal, ...contextPatch })
          .eq("id", cell.id);
        if (ce) {
          const fallback = await supabase.from("ready_made_cells").update({ value: newVal }).eq("id", cell.id);
          if (fallback.error) {
            setErr(fallback.error.message);
            setBusyId(null);
            return;
          }
        }
      } else {
        const { error: ce } = await supabase
          .from("ready_made_cells")
          .insert({
            row_id: row.ready_made_row_id,
            column_id: row.ready_made_column_id,
            value: newVal,
            ...contextPatch,
          });
        if (ce) {
          const fallback = await supabase.from("ready_made_cells").insert({
            row_id: row.ready_made_row_id,
            column_id: row.ready_made_column_id,
            value: newVal,
          });
          if (fallback.error) {
            setErr(fallback.error.message);
            setBusyId(null);
            return;
          }
        }
      }
    }

    const { error: oe } = await supabase
      .from("restock_orders")
      .update({ status: "completed", completed_at: now, updated_at: now })
      .eq("id", row.id)
      .eq("status", "pending");
    if (oe) {
      setErr(oe.message);
      setBusyId(null);
      return;
    }
    setBusyId(null);
    await refresh();
  }

  function askComplete(row: RestockOrder) {
    ask({
      title: "Complete restock?",
      description: `Add ${formatQty(row.qty)} to “${row.item_label}” and mark this order complete.`,
      confirmLabel: "Complete",
      destructive: false,
      onConfirm: () => completeOrder(row),
    });
  }

  function askDelete(row: RestockOrder) {
    ask({
      title: "Remove this order?",
      description: `“${row.item_label}” will be removed from the list. Stock will not change.`,
      confirmLabel: "Remove",
      destructive: true,
      onConfirm: async () => {
        const { error } = await supabase.from("restock_orders").delete().eq("id", row.id);
        if (error) setErr(error.message);
        else await refresh();
      },
    });
  }

  if (missingTable) {
    return (
      <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
        Run migration <code className="font-mono text-foreground">106_restock_orders.sql</code> in Supabase to enable this page.
      </p>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Add items that are currently on order. When the stock arrives, mark the row complete to restock{" "}
        <Link href="/admin/inventory" className="text-primary underline-offset-4 hover:underline">inventory</Link>
        {" or "}
        <Link href="/admin/inventory/ready-made" className="text-primary underline-offset-4 hover:underline">ready-made</Link>
        {" automatically."}
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setTab("pending")}
            className={`rounded px-3 py-1.5 text-sm ${tab === "pending" ? "bg-accent font-medium" : "text-muted-foreground"}`}
          >
            On order ({pending.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("completed")}
            className={`rounded px-3 py-1.5 text-sm ${tab === "completed" ? "bg-accent font-medium" : "text-muted-foreground"}`}
          >
            Completed ({completed.length})
          </button>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add item
        </Button>
      </div>

      {err && <p className="mb-3 text-sm text-destructive">{err}</p>}

      <div className="grid gap-3">
        {shown.map((row) => (
          <Card key={row.id} className="card-hover">
            <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold">{row.item_label}</div>
                  <Badge variant={row.kind === "inventory" ? "blue" : "purple"}>
                    {row.kind === "inventory" ? "Inventory" : "Ready-made"}
                  </Badge>
                  <Badge variant={row.status === "pending" ? "amber" : "green"}>
                    {row.status === "pending" ? "Pending" : "Completed"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.status === "pending" ? "Pending restock" : "Restocked"}:{" "}
                  <span className="font-medium text-foreground">{formatQty(row.qty)}</span>
                  {row.notes?.trim() ? ` · ${row.notes.trim()}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Added {formatWhen(row.created_at)}
                  {row.completed_at ? ` · Completed ${formatWhen(row.completed_at)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {row.status === "pending" && (
                  <Button
                    size="sm"
                    className="h-8 gap-1"
                    disabled={busyId === row.id}
                    onClick={() => askComplete(row)}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {busyId === row.id ? "Restocking…" : "Complete"}
                  </Button>
                )}
                <button
                  type="button"
                  onClick={() => askDelete(row)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
        {shown.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {tab === "pending"
              ? "Nothing on order yet. Add an inventory item or a ready-made cell."
              : "No completed restocks yet."}
          </p>
        )}
      </div>

      <AddOrderDialog
        open={open}
        onClose={() => setOpen(false)}
        userId={userId}
        onSaved={refresh}
      />
      {confirmDialog}
    </>
  );
}

function AddOrderDialog({
  open,
  onClose,
  userId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  onSaved: () => Promise<void>;
}) {
  const supabase = createClient();
  const [kind, setKind] = useState<"inventory" | "ready_made">("inventory");
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [invItems, setInvItems] = useState<InvItem[]>([]);
  const [invSearch, setInvSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<InvItem | null>(null);

  const [rmGroups, setRmGroups] = useState<RmGroup[]>([]);
  const [rmBoards, setRmBoards] = useState<RmBoard[]>([]);
  const [groupId, setGroupId] = useState("");
  const [boardId, setBoardId] = useState("");
  const [rmRows, setRmRows] = useState<RmRow[]>([]);
  const [rmCols, setRmCols] = useState<RmCol[]>([]);
  const [rowId, setRowId] = useState("");
  const [colId, setColId] = useState("");
  const [cellQty, setCellQty] = useState<number | null>(null);
  const [loadingGrid, setLoadingGrid] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind("inventory");
    setQty("1");
    setNotes("");
    setErr(null);
    setInvSearch("");
    setSelectedItem(null);
    setGroupId("");
    setBoardId("");
    setRmRows([]);
    setRmCols([]);
    setRowId("");
    setColId("");
    setCellQty(null);
    void (async () => {
      const [{ data: items }, { data: groups }, { data: boards }] = await Promise.all([
        supabase.from("inventory").select("id,name,category,quantity,unit").order("name"),
        supabase.from("ready_made_sheet_groups").select("id,name,sort_order").order("sort_order"),
        supabase.from("ready_made_boards").select("id,name,group_id,sort_order").order("sort_order"),
      ]);
      const nextGroups = (groups as RmGroup[]) || [];
      setInvItems((items as InvItem[]) || []);
      setRmGroups(nextGroups);
      setRmBoards((boards as RmBoard[]) || []);
      if (nextGroups[0]) setGroupId(nextGroups[0].id);
    })();
  }, [open, supabase]);

  const filteredInv = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    if (!q) return invItems;
    return invItems.filter((i) => `${i.name} ${i.category || ""}`.toLowerCase().includes(q));
  }, [invItems, invSearch]);

  const boardsInGroup = useMemo(() => {
    if (!groupId) return rmBoards.filter((b) => !b.group_id);
    return rmBoards.filter((b) => b.group_id === groupId);
  }, [rmBoards, groupId]);

  async function loadBoard(id: string) {
    if (!id) {
      setRmRows([]);
      setRmCols([]);
      setRowId("");
      setColId("");
      setCellQty(null);
      return;
    }
    setLoadingGrid(true);
    const [{ data: rows }, { data: cols }] = await Promise.all([
      supabase.from("ready_made_rows").select("id,board_id,row_label,sort_order").eq("board_id", id).order("sort_order"),
      supabase.from("ready_made_columns").select("id,board_id,header_name,sort_order").eq("board_id", id).order("sort_order"),
    ]);
    const nextRows = (rows as RmRow[]) || [];
    const nextCols = (cols as RmCol[]) || [];
    setRmRows(nextRows);
    setRmCols(nextCols);
    const nextRow = nextRows[0]?.id ?? "";
    const nextCol = nextCols[0]?.id ?? "";
    setRowId(nextRow);
    setColId(nextCol);
    setLoadingGrid(false);
    if (nextRow && nextCol) void loadCellQty(nextRow, nextCol);
    else setCellQty(null);
  }

  async function loadCellQty(nextRow: string, nextCol: string) {
    if (!nextRow || !nextCol) {
      setCellQty(null);
      return;
    }
    const { data } = await supabase
      .from("ready_made_cells")
      .select("value")
      .eq("row_id", nextRow)
      .eq("column_id", nextCol)
      .maybeSingle();
    const n = parseFloat(data?.value ?? "");
    setCellQty(Number.isFinite(n) ? n : 0);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(qty);
    if (!amount || amount <= 0) {
      setErr("Enter a quantity greater than 0.");
      return;
    }
    setBusy(true);
    setErr(null);

    let item_label = "";
    let inventory_id: string | null = null;
    let ready_made_row_id: string | null = null;
    let ready_made_column_id: string | null = null;

    if (kind === "inventory") {
      if (!selectedItem) {
        setErr("Select an inventory item.");
        setBusy(false);
        return;
      }
      inventory_id = selectedItem.id;
      item_label = selectedItem.name;
    } else {
      if (!groupId && rmGroups.length > 0 && boardsInGroup.length === 0) {
        setErr("Select a ready-made group that has a sheet.");
        setBusy(false);
        return;
      }
      if (!boardId || !rowId || !colId) {
        setErr("Select group, sheet, row, and column.");
        setBusy(false);
        return;
      }
      const group = rmGroups.find((g) => g.id === groupId);
      const board = rmBoards.find((b) => b.id === boardId);
      const row = rmRows.find((r) => r.id === rowId);
      const col = rmCols.find((c) => c.id === colId);
      item_label = [group?.name, board?.name, row?.row_label, col?.header_name].filter(Boolean).join(" › ");
      ready_made_row_id = rowId;
      ready_made_column_id = colId;
    }

    const { error } = await supabase.from("restock_orders").insert({
      status: "pending",
      kind,
      inventory_id,
      ready_made_row_id,
      ready_made_column_id,
      item_label,
      qty: amount,
      notes: notes.trim() || null,
      created_by: userId,
    });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
    await onSaved();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add item on order"
      description="Choose an inventory item or a ready-made cell, then enter the quantity still pending."
      size="lg"
    >
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setKind("inventory")}
            className={`flex items-start gap-2 rounded-lg border p-3 text-left text-sm ${kind === "inventory" ? "border-primary bg-accent" : "hover:bg-accent"}`}
          >
            <Package className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">Inventory</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Current stock items</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setKind("ready_made")}
            className={`flex items-start gap-2 rounded-lg border p-3 text-left text-sm ${kind === "ready_made" ? "border-primary bg-accent" : "hover:bg-accent"}`}
          >
            <Package className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">Ready-made</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">Group › sheet › cell</span>
            </span>
          </button>
        </div>

        {kind === "inventory" ? (
          !selectedItem ? (
            <div className="space-y-2">
              <Label>Inventory item</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search items…"
                  value={invSearch}
                  onChange={(e) => setInvSearch(e.target.value)}
                />
              </div>
              <div className="max-h-52 overflow-y-auto rounded-md border">
                {filteredInv.length === 0 && (
                  <p className="p-3 text-center text-sm text-muted-foreground">No items found.</p>
                )}
                {filteredInv.map((item) => (
                  <button
                    key={item.id}
                    type="button"
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
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
              <div>
                <div className="font-semibold">{selectedItem.name}</div>
                <div className="text-xs text-muted-foreground">
                  On hand: {selectedItem.quantity ?? 0} {selectedItem.unit || "pcs"}
                </div>
              </div>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedItem(null)}>
                Change
              </Button>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Group</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={groupId}
                onChange={(e) => {
                  const next = e.target.value;
                  setGroupId(next);
                  setBoardId("");
                  setRmRows([]);
                  setRmCols([]);
                  setRowId("");
                  setColId("");
                  setCellQty(null);
                }}
              >
                <option value="">Ungrouped</option>
                {rmGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Sheet</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={boardId}
                onChange={(e) => {
                  setBoardId(e.target.value);
                  void loadBoard(e.target.value);
                }}
              >
                <option value="">Select sheet</option>
                {boardsInGroup.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            {loadingGrid ? (
              <p className="text-sm text-muted-foreground">Loading sheet…</p>
            ) : boardId ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Row</Label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={rowId}
                    onChange={(e) => {
                      setRowId(e.target.value);
                      void loadCellQty(e.target.value, colId);
                    }}
                  >
                    {rmRows.map((r) => <option key={r.id} value={r.id}>{r.row_label}</option>)}
                    {rmRows.length === 0 && <option value="">— no rows —</option>}
                  </select>
                </div>
                <div>
                  <Label>Column / cell</Label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={colId}
                    onChange={(e) => {
                      setColId(e.target.value);
                      void loadCellQty(rowId, e.target.value);
                    }}
                  >
                    {rmCols.map((c) => <option key={c.id} value={c.id}>{c.header_name}</option>)}
                    {rmCols.length === 0 && <option value="">— no columns —</option>}
                  </select>
                </div>
              </div>
            ) : null}
            {cellQty != null && rowId && colId && (
              <p className="text-xs text-muted-foreground">On hand in this cell: {formatQty(cellQty)}</p>
            )}
          </div>
        )}

        <div>
          <Label>Pending quantity</Label>
          <Input
            type="number"
            min={0.01}
            step="0.01"
            className="mt-1 w-36"
            value={qty}
            onChange={(e) => { setQty(e.target.value); setErr(null); }}
          />
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <Input
            className="mt-1"
            placeholder="Supplier, PO number, expected date…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add to on order"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
