"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { BIGSELLER_KNOWN_STORE_NAMES } from "@/lib/bigseller-store-labels";

export type ShopType = "physical" | "online";

type StoreRow = { id: string; name: string; shop_type: ShopType; notes: string | null; pdf_label: string | null };

function shopTypeLabel(t: string | null | undefined): string {
  return t === "physical" ? "Physical shop" : "Online shop";
}

export function StoresClient({ initial }: { initial: StoreRow[] }) {
  const supabase = createClient();
  const [list, setList] = useState<StoreRow[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StoreRow | null>(null);

  async function refresh() {
    const { data } = await supabase.from("stores").select("id,name,shop_type,notes,pdf_label").order("name");
    setList((data as StoreRow[]) || []);
  }

  async function remove(id: string) {
    if (!confirm("Delete this store? Product inventory rows using it will have the store cleared.")) return;
    await supabase.from("stores").delete().eq("id", id);
    refresh();
  }

  return (
    <>
      <p className="mb-2 text-sm text-muted-foreground">
        These stores appear when you add product inventory and when importing BigSeller PDFs (orders are linked by{" "}
        <span className="font-medium text-foreground">PDF store label</span> if set, otherwise by store name).{" "}
        <Link href="/admin/inventory" className="text-primary underline-offset-4 hover:underline">Inventory</Link>
        {" · "}
        <Link href="/admin/orders" className="text-primary underline-offset-4 hover:underline">Orders</Link>
      </p>
      <p className="mb-4 rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">BigSeller buyer line</span> often ends with one of:{" "}
        {BIGSELLER_KNOWN_STORE_NAMES.join(", ")}. Put that exact text in the{" "}
        <span className="font-medium text-foreground">PDF store label</span> field on the
        matching store.
      </p>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" /> Add store</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => (
          <Card key={s.id} className="card-hover">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{s.name}</div>
                  {s.pdf_label?.trim() ? (
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      PDF: <span className="text-foreground">{s.pdf_label.trim()}</span>
                    </p>
                  ) : null}
                  <div className="mt-1.5">
                    <Badge variant={s.shop_type === "physical" ? "blue" : "purple"}>
                      {shopTypeLabel(s.shop_type)}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button type="button" onClick={() => { setEditing(s); setOpen(true); }} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => remove(s.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              {s.notes && <p className="mt-3 rounded bg-muted/40 p-2 text-xs text-muted-foreground">{s.notes}</p>}
            </CardContent>
          </Card>
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground">No stores yet. Add Shopee, TikTok Shop, or your own channels.</p>}
      </div>
      <StoreForm open={open} onClose={() => setOpen(false)} row={editing} onSaved={refresh} />
    </>
  );
}

function StoreForm({ open, onClose, row, onSaved }: { open: boolean; onClose: () => void; row: StoreRow | null; onSaved: () => void }) {
  const supabase = createClient();
  const [form, setForm] = useState<{ name: string; notes: string; shop_type: ShopType; pdf_label: string }>({
    name: "",
    notes: "",
    shop_type: "online",
    pdf_label: "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (row) {
      setForm({
        name: row.name,
        notes: row.notes || "",
        shop_type: row.shop_type === "physical" ? "physical" : "online",
        pdf_label: row.pdf_label?.trim() || "",
      });
    } else {
      setForm({ name: "", notes: "", shop_type: "online", pdf_label: "" });
    }
  }, [open, row]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const name = form.name.trim();
    if (!name) {
      setBusy(false);
      setErr("Name is required.");
      return;
    }
    const pdfRaw = form.pdf_label.trim();
    const payload = {
      name,
      shop_type: form.shop_type,
      notes: form.notes.trim() || null,
      pdf_label: pdfRaw ? pdfRaw : null,
    };
    const q = row
      ? supabase.from("stores").update(payload).eq("id", row.id)
      : supabase.from("stores").insert(payload);
    const { error } = await q;
    setBusy(false);
    if (error) {
      setErr(
        error.message.includes("stores_name_unique") || error.message.includes("stores_name")
          ? "A store with this name already exists."
          : error.message.includes("stores_pdf_label") || error.message.includes("pdf_label")
            ? "Another store already uses this PDF label."
            : error.message,
      );
      return;
    }
    onClose();
    onSaved();
  }

  return (
    <Dialog open={open} onClose={onClose} title={row ? "Edit store" : "Add store"}>
      <form onSubmit={save} className="grid gap-3">
        <div>
          <Label>Store name</Label>
          <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Likha — Shopee" />
        </div>
        <div>
          <Label>PDF store label (BigSeller)</Label>
          <Input
            value={form.pdf_label}
            onChange={(e) => setForm((f) => ({ ...f, pdf_label: e.target.value }))}
            placeholder="e.g. Likha. Shopee — exact text after Buyer Message"
            list="bigseller-pdf-store-suggestions"
          />
          <datalist id="bigseller-pdf-store-suggestions">
            {BIGSELLER_KNOWN_STORE_NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional. If set, BigSeller PDF import matches this text first (then falls back to store name).
          </p>
        </div>
        <div>
          <Label>Type of shop</Label>
          <select
            className="mt-1 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            value={form.shop_type}
            onChange={(e) => setForm((f) => ({ ...f, shop_type: e.target.value as ShopType }))}
          >
            <option value="online">Online shop</option>
            <option value="physical">Physical shop</option>
          </select>
        </div>
        <div>
          <Label>Notes (optional)</Label>
          <textarea className="min-h-[72px] w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
