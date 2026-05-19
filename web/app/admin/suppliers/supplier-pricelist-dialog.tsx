"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { peso } from "@/lib/utils";
import { Camera, Pencil, Plus, Trash2 } from "lucide-react";

const PRICELIST_BUCKET = "supplier-pricelist";

export type PricelistItem = {
  id: string;
  supplier_id: string;
  product_name: string;
  price: number;
  description?: string | null;
  sort_order: number;
};

type SupplierRef = {
  id: string;
  name: string;
  pricelist_image_url?: string | null;
};

const emptyProduct = { product_name: "", price: "", description: "" };

export function SupplierPricelistDialog({
  open,
  onClose,
  supplier,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  supplier: SupplierRef | null;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<PricelistItem[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addForm, setAddForm] = useState(emptyProduct);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyProduct);
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!supplier) return;
    setLoading(true);
    const [{ data: rows }, { data: sup }] = await Promise.all([
      supabase
        .from("supplier_pricelist_items")
        .select("*")
        .eq("supplier_id", supplier.id)
        .order("sort_order", { ascending: true })
        .order("product_name", { ascending: true }),
      supabase.from("suppliers").select("pricelist_image_url").eq("id", supplier.id).single(),
    ]);
    setItems((rows as PricelistItem[]) || []);
    setImageUrl(sup?.pricelist_image_url ?? supplier.pricelist_image_url ?? null);
    setLoading(false);
  }

  useEffect(() => {
    if (!open || !supplier) return;
    setAddForm(emptyProduct);
    setEditingId(null);
    void load();
  }, [open, supplier?.id]);

  async function uploadPricelistImage(file: File) {
    if (!supplier) return;
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${supplier.id}/pricelist.${ext}`;
      const { error: upErr } = await supabase.storage.from(PRICELIST_BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from(PRICELIST_BUCKET).getPublicUrl(path);
      const url = pub?.publicUrl || null;
      if (!url) throw new Error("Could not get image URL");
      const { error } = await supabase
        .from("suppliers")
        .update({ pricelist_image_url: url })
        .eq("id", supplier.id);
      if (error) throw error;
      setImageUrl(url);
      onSaved();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removePricelistImage() {
    if (!supplier || !confirm("Remove pricelist photo?")) return;
    const { error } = await supabase
      .from("suppliers")
      .update({ pricelist_image_url: null })
      .eq("id", supplier.id);
    if (error) {
      alert(error.message);
      return;
    }
    setImageUrl(null);
    onSaved();
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!supplier) return;
    const product_name = addForm.product_name.trim();
    if (!product_name) return alert("Product name is required.");
    const price = Number(addForm.price);
    if (Number.isNaN(price) || price < 0) return alert("Enter a valid price.");
    setBusy(true);
    const maxOrder = items.reduce((m, r) => Math.max(m, r.sort_order), 0);
    const { error } = await supabase.from("supplier_pricelist_items").insert({
      supplier_id: supplier.id,
      product_name,
      price,
      description: addForm.description.trim() || null,
      sort_order: maxOrder + 1,
    });
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    setAddForm(emptyProduct);
    await load();
    onSaved();
  }

  function startEdit(row: PricelistItem) {
    setEditingId(row.id);
    setEditForm({
      product_name: row.product_name,
      price: String(row.price),
      description: row.description || "",
    });
  }

  async function saveEdit(id: string) {
    const product_name = editForm.product_name.trim();
    if (!product_name) return alert("Product name is required.");
    const price = Number(editForm.price);
    if (Number.isNaN(price) || price < 0) return alert("Enter a valid price.");
    setBusy(true);
    const { error } = await supabase
      .from("supplier_pricelist_items")
      .update({
        product_name,
        price,
        description: editForm.description.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    setEditingId(null);
    await load();
    onSaved();
  }

  async function deleteProduct(row: PricelistItem) {
    if (!confirm(`Delete "${row.product_name}" from this pricelist?`)) return;
    const { error } = await supabase.from("supplier_pricelist_items").delete().eq("id", row.id);
    if (error) {
      alert(error.message);
      return;
    }
    if (editingId === row.id) setEditingId(null);
    await load();
    onSaved();
  }

  if (!supplier) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Pricelist — ${supplier.name}`}
      description="Upload a price list photo and manage product lines."
      size="xl"
    >
      <div className="space-y-5 max-h-[min(70dvh,32rem)] overflow-y-auto pr-1">
        {/* Pricelist image */}
        <section className="rounded-lg border bg-muted/20 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Label className="text-sm font-medium">Pricelist photo</Label>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadPricelistImage(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                <Camera className="mr-1 h-3.5 w-3.5" />
                {uploading ? "Uploading…" : imageUrl ? "Replace photo" : "Upload photo"}
              </Button>
              {imageUrl && (
                <Button type="button" variant="ghost" size="sm" onClick={() => void removePricelistImage()}>
                  Remove
                </Button>
              )}
            </div>
          </div>
          {imageUrl ? (
            <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Supplier pricelist"
                className="max-h-48 w-full rounded-md border object-contain bg-background"
              />
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">No photo yet — upload a scan or picture of their price list.</p>
          )}
        </section>

        {/* Product lines */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">Product price list</h3>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="p-2">Product name</th>
                    <th className="p-2 w-28 text-right">Price</th>
                    <th className="p-2 min-w-[12rem]">Description</th>
                    <th className="p-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) =>
                    editingId === row.id ? (
                      <tr key={row.id} className="border-t bg-primary/5">
                        <td className="p-1">
                          <Input
                            className="h-8 text-sm"
                            value={editForm.product_name}
                            onChange={(e) => setEditForm((f) => ({ ...f, product_name: e.target.value }))}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            className="h-8 text-right text-sm"
                            value={editForm.price}
                            onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))}
                          />
                        </td>
                        <td className="p-1">
                          <Input
                            className="h-8 text-sm"
                            value={editForm.description}
                            onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                            placeholder="Optional"
                          />
                        </td>
                        <td className="p-1">
                          <div className="flex justify-end gap-1">
                            <Button type="button" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => void saveEdit(row.id)}>
                              Save
                            </Button>
                            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={row.id} className="border-t hover:bg-muted/20">
                        <td className="p-2 font-medium">{row.product_name}</td>
                        <td className="p-2 text-right tabular-nums">{peso(Number(row.price))}</td>
                        <td className="p-2 text-muted-foreground">{row.description || "—"}</td>
                        <td className="p-2">
                          <div className="flex justify-end gap-0.5">
                            <button
                              type="button"
                              className="rounded p-1 text-muted-foreground hover:bg-muted"
                              title="Edit"
                              onClick={() => startEdit(row)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              className="rounded p-1 text-destructive hover:bg-destructive/10"
                              title="Delete"
                              onClick={() => void deleteProduct(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No products in this pricelist yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={(e) => void addProduct(e)} className="mt-3 grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-[1fr_7rem_1fr_auto] sm:items-end">
            <div>
              <Label className="text-xs">Product name</Label>
              <Input
                className="mt-1 h-8"
                value={addForm.product_name}
                onChange={(e) => setAddForm((f) => ({ ...f, product_name: e.target.value }))}
                placeholder="e.g. Cotton jersey"
              />
            </div>
            <div>
              <Label className="text-xs">Price (₱)</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                className="mt-1 h-8"
                value={addForm.price}
                onChange={(e) => setAddForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input
                className="mt-1 h-8"
                value={addForm.description}
                onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <Button type="submit" size="sm" disabled={busy} className="h-8">
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add
            </Button>
          </form>
        </section>

        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
