"use client";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { peso } from "@/lib/utils";
import { Plus, Pencil, Trash2 } from "lucide-react";

type Item = any;

function statusOf(i: Item) {
  const q = Number(i.quantity), m = Number(i.min_level);
  if (q <= m) return { label: "Low Stock", v: "red" as const };
  if (q <= m * 1.5) return { label: "Watch", v: "amber" as const };
  return { label: "OK", v: "green" as const };
}

export function InventoryClient({ initial, canEdit }: { initial: Item[]; canEdit: boolean }) {
  const supabase = createClient();
  const params = useSearchParams();
  const category = params.get("category");
  const [items, setItems] = useState<Item[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);

  const visible = useMemo(() => {
    if (!category) return items;
    return items.filter((i) => (i.category || "").toLowerCase() === category.toLowerCase());
  }, [items, category]);

  async function refresh() {
    const { data } = await supabase.from("inventory").select("*").order("name");
    setItems(data || []);
  }

  async function remove(id: string) {
    if (!confirm("Delete this item?")) return;
    await supabase.from("inventory").delete().eq("id", id);
    refresh();
  }

  const totalValue = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_cost || 0), 0);
  const lowCount = items.filter((i) => Number(i.quantity) <= Number(i.min_level)).length;

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Items</div><div className="text-2xl font-semibold">{items.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Low Stock</div><div className="text-2xl font-semibold text-destructive">{lowCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Value</div><div className="text-2xl font-semibold">{peso(totalValue)}</div></CardContent></Card>
      </div>

      {canEdit && (
        <div className="mb-3 flex justify-end">
          <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" /> Add Item</Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left"><tr>
              <th className="p-3">Item</th><th>Category</th><th>Qty</th><th>Min</th><th>Stock Level</th><th>Status</th><th>Supplier</th>{canEdit && <th></th>}
            </tr></thead>
            <tbody>
              {visible.map((i) => {
                const s = statusOf(i);
                const pct = Math.min(100, (Number(i.quantity) / Math.max(1, Number(i.min_level) * 2)) * 100);
                return (
                  <tr key={i.id} className="border-t hover:bg-muted/30">
                    <td className="p-3 font-medium">{i.name}</td>
                    <td>{i.category}</td>
                    <td>{i.quantity} {i.unit}</td>
                    <td>{i.min_level}</td>
                    <td className="w-40">
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className={"h-full " + (s.v === "red" ? "bg-destructive" : s.v === "amber" ? "bg-amber-500" : "bg-emerald-500")} style={{ width: pct + "%" }} />
                      </div>
                    </td>
                    <td><Badge variant={s.v}>{s.label}</Badge></td>
                    <td className="text-muted-foreground">{i.supplier || "—"}</td>
                    {canEdit && (
                      <td className="text-right pr-3">
                        <button onClick={() => { setEditing(i); setOpen(true); }} className="mr-2 text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => remove(i.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ItemForm open={open} onClose={() => setOpen(false)} item={editing} onSaved={refresh} />
    </>
  );
}

function ItemForm({ open, onClose, item, onSaved }: { open: boolean; onClose: () => void; item: Item | null; onSaved: () => void }) {
  const supabase = createClient();
  const empty = useMemo(() => ({
    name: "",
    category: "Materials",
    quantity: 0,
    unit: "pcs",
    min_level: 0,
    unit_cost: 0,
    supplier: "",
  }), []);

  const [form, setForm] = useState<any>(() => item || empty);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(item || empty);
  }, [open, item, empty]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setSuppliersLoading(true);
      const { data } = await supabase.from("suppliers").select("id,name").order("name");
      if (!alive) return;
      setSuppliers((data as any) || []);
      setSuppliersLoading(false);
    })();
    return () => { alive = false; };
  }, [open, supabase]);

  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (item) await supabase.from("inventory").update(form).eq("id", item.id);
    else await supabase.from("inventory").insert(form);
    onClose(); onSaved();
  }
  return (
    <Dialog open={open} onClose={onClose} title={item ? "Edit Item" : "Add Item"}>
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>Name</Label><Input required value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label>Category</Label><Input value={form.category || ""} onChange={(e) => set("category", e.target.value)} /></div>
        <div>
          <Label>Supplier</Label>
          <select
            value={form.supplier || ""}
            onChange={(e) => set("supplier", e.target.value)}
            className={[
              "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
            disabled={suppliersLoading}
          >
            <option value="">{suppliersLoading ? "Loading suppliers..." : "Select supplier"}</option>
            {form.supplier && !suppliers.some((s) => s.name === form.supplier) && (
              <option value={form.supplier}>{form.supplier} (current)</option>
            )}
            {suppliers.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>
        <div><Label>Quantity</Label><Input type="number" step="0.01" value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} /></div>
        <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => set("unit", e.target.value)} /></div>
        <div><Label>Min level</Label><Input type="number" step="0.01" value={form.min_level} onChange={(e) => set("min_level", Number(e.target.value))} /></div>
        <div><Label>Unit cost (₱)</Label><Input type="number" step="0.01" value={form.unit_cost} onChange={(e) => set("unit_cost", Number(e.target.value))} /></div>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Dialog>
  );
}
