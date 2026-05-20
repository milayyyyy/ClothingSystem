"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus, Trash2, Mail, Phone, MapPin, Share2, ListOrdered, Tags, Clock } from "lucide-react";
import { SupplierPricelistDialog } from "./supplier-pricelist-dialog";
import {
  SupplierCategoriesDialog,
  type SupplierCategoryRow,
} from "./supplier-categories-dialog";
import { cn } from "@/lib/utils";
import {
  normalizeSupplier,
  syncSupplierCategoryLinks,
  type SupplierWithCategories,
} from "@/lib/supplier-categories";
import {
  formatSupplierHoursSummary,
  SUPPLIER_WEEKDAYS,
  toTimeInputValue,
} from "@/lib/supplier-hours";

type S = SupplierWithCategories;

const SUPPLIER_FORM_EMPTY = {
  name: "",
  contact_person: "",
  phone: "",
  email: "",
  address: "",
  google_maps_pin_url: "",
  social_media_url: "",
  notes: "",
  days_open: [] as string[],
  opens_at: "",
  closes_at: "",
  category_ids: [] as string[],
};

type CategoryFilter = "all" | "none" | string;

function externalHref(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t) return "#";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function SuppliersClient({
  initial,
  initialCategories = [],
}: {
  initial: S[];
  initialCategories?: SupplierCategoryRow[];
}) {
  const supabase = createClient();
  const [list, setList] = useState<S[]>(initial);
  const [categories, setCategories] = useState<SupplierCategoryRow[]>(initialCategories);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<S | null>(null);
  const [pricelistSupplier, setPricelistSupplier] = useState<S | null>(null);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});

  const categoryById = useMemo(() => {
    const m = new Map<string, SupplierCategoryRow>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const filteredList = useMemo(() => {
    if (categoryFilter === "all") return list;
    if (categoryFilter === "none") return list.filter((s) => s.category_ids.length === 0);
    return list.filter((s) => s.category_ids.includes(categoryFilter));
  }, [list, categoryFilter]);

  function countInCategory(categoryId: string) {
    return list.filter((s) => s.category_ids.includes(categoryId)).length;
  }

  async function loadItemCounts(supplierIds: string[]) {
    if (!supplierIds.length) {
      setItemCounts({});
      return;
    }
    const { data, error } = await supabase.from("supplier_pricelist_items").select("supplier_id").in("supplier_id", supplierIds);
    if (error) {
      setItemCounts({});
      return;
    }
    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const id = String((row as { supplier_id: string }).supplier_id);
      counts[id] = (counts[id] || 0) + 1;
    }
    setItemCounts(counts);
  }

  async function refreshCategories() {
    const { data } = await supabase
      .from("supplier_categories")
      .select("id,name,sort_order")
      .order("sort_order")
      .order("name");
    setCategories((data as SupplierCategoryRow[]) || []);
  }

  async function refresh() {
    const [{ data }, _cats] = await Promise.all([
      supabase.from("suppliers").select("*, supplier_category_links(category_id)").order("name"),
      refreshCategories(),
    ]);
    const rows = ((data as Record<string, unknown>[]) || []).map((row) => normalizeSupplier(row));
    setList(rows);
    void loadItemCounts(rows.map((r) => r.id));
  }

  useEffect(() => {
    void loadItemCounts((initial || []).map((r: S) => r.id));
  }, []);
  async function remove(id: string) {
    if (!confirm("Delete supplier?")) return;
    await supabase.from("suppliers").delete().eq("id", id);
    refresh();
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Category</span>
          <button
            type="button"
            onClick={() => setCategoryFilter("all")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              categoryFilter === "all"
                ? "border-primary bg-primary/10 text-primary"
                : "hover:bg-muted",
            )}
          >
            All ({list.length})
          </button>
          <button
            type="button"
            onClick={() => setCategoryFilter("none")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              categoryFilter === "none"
                ? "border-primary bg-primary/10 text-primary"
                : "hover:bg-muted",
            )}
          >
            Uncategorized ({list.filter((s) => s.category_ids.length === 0).length})
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryFilter(c.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                categoryFilter === c.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-muted",
              )}
            >
              {c.name} ({countInCategory(c.id)})
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setCategoriesOpen(true)}>
            <Tags className="mr-1 h-4 w-4" />
            Manage categories
          </Button>
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> Add Supplier
          </Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredList.map((s) => (
          <Card key={s.id} className="card-hover">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{s.name}</div>
                  {s.category_ids.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.category_ids.map((cid) => {
                        const cat = categoryById.get(cid);
                        if (!cat) return null;
                        return (
                          <Badge key={cid} variant="outline" className="text-[10px]">
                            {cat.name}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  {s.contact_person && <div className="text-xs text-muted-foreground">{s.contact_person}</div>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(s); setOpen(true); }} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove(s.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                {s.phone && <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{s.phone}</div>}
                {s.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{s.email}</div>}
                {s.address && <div className="text-xs text-muted-foreground">{s.address}</div>}
                {formatSupplierHoursSummary(s) && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    {formatSupplierHoursSummary(s)}
                  </div>
                )}
                {(s.google_maps_pin_url || s.social_media_url) && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5 text-xs">
                    {s.google_maps_pin_url && (
                      <a
                        href={externalHref(s.google_maps_pin_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                      >
                        <MapPin className="h-3 w-3 shrink-0" />
                        Maps
                      </a>
                    )}
                    {s.social_media_url && (
                      <a
                        href={externalHref(s.social_media_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                      >
                        <Share2 className="h-3 w-3 shrink-0" />
                        Social
                      </a>
                    )}
                  </div>
                )}
                {s.notes && <p className="mt-2 rounded bg-muted/40 p-2 text-xs">{s.notes}</p>}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                {s.pricelist_image_url && (
                  <a href={s.pricelist_image_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.pricelist_image_url}
                      alt=""
                      className="h-10 w-14 rounded border object-cover"
                    />
                  </a>
                )}
                <Badge variant="outline" className="text-[10px]">
                  {(itemCounts[s.id] ?? 0) === 1 ? "1 product" : `${itemCounts[s.id] ?? 0} products`}
                </Badge>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="ml-auto h-8 text-xs"
                  onClick={() => setPricelistSupplier(s)}
                >
                  <ListOrdered className="mr-1 h-3.5 w-3.5" />
                  Pricelist
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {filteredList.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">
            {list.length === 0 ? "No suppliers yet." : "No suppliers in this category."}
          </p>
        )}
      </div>
      <SupplierForm
        open={open}
        onClose={() => setOpen(false)}
        supplier={editing}
        categories={categories}
        onManageCategories={() => setCategoriesOpen(true)}
        onSaved={refresh}
      />
      <SupplierCategoriesDialog
        open={categoriesOpen}
        onClose={() => setCategoriesOpen(false)}
        onChanged={refresh}
      />
      <SupplierPricelistDialog
        open={!!pricelistSupplier}
        onClose={() => setPricelistSupplier(null)}
        supplier={pricelistSupplier}
        onSaved={refresh}
      />
    </>
  );
}

function SupplierForm({
  open,
  onClose,
  supplier,
  categories,
  onManageCategories,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  supplier: S | null;
  categories: SupplierCategoryRow[];
  onManageCategories: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [form, setForm] = useState<any>(() => ({ ...SUPPLIER_FORM_EMPTY, ...(supplier || {}) }));

  useEffect(() => {
    if (!open) return;
    setForm(
      supplier
        ? {
            ...SUPPLIER_FORM_EMPTY,
            ...supplier,
            category_ids: [...(supplier.category_ids || [])],
            days_open: [...(supplier.days_open || [])],
            opens_at: toTimeInputValue(supplier.opens_at),
            closes_at: toTimeInputValue(supplier.closes_at),
          }
        : { ...SUPPLIER_FORM_EMPTY },
    );
  }, [open, supplier]);

  function toggleCategory(categoryId: string, checked: boolean) {
    setForm((f: typeof SUPPLIER_FORM_EMPTY) => {
      const ids = new Set(f.category_ids || []);
      if (checked) ids.add(categoryId);
      else ids.delete(categoryId);
      return { ...f, category_ids: [...ids] };
    });
  }

  function toggleDay(dayKey: string, checked: boolean) {
    setForm((f: typeof SUPPLIER_FORM_EMPTY) => {
      const ids = new Set(f.days_open || []);
      if (checked) ids.add(dayKey);
      else ids.delete(dayKey);
      const ordered = SUPPLIER_WEEKDAYS.map((d) => d.key).filter((k) => ids.has(k));
      return { ...f, days_open: ordered };
    });
  }

  function set(k: string, v: any) {
    setForm((f: any) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name?.trim() || "",
      contact_person: form.contact_person?.trim() || null,
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
      address: form.address?.trim() || null,
      google_maps_pin_url: form.google_maps_pin_url?.trim() || null,
      social_media_url: form.social_media_url?.trim() || null,
      notes: form.notes?.trim() || null,
      days_open: SUPPLIER_WEEKDAYS.map((d) => d.key).filter((k) => (form.days_open || []).includes(k)),
      opens_at: form.opens_at?.trim() || null,
      closes_at: form.closes_at?.trim() || null,
    };
    const categoryIds: string[] = form.category_ids || [];
    try {
      if (supplier) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", supplier.id);
        if (error) throw new Error(error.message);
        await syncSupplierCategoryLinks(supabase, supplier.id, categoryIds);
      } else {
        const { data: created, error } = await supabase.from("suppliers").insert(payload).select("id").single();
        if (error || !created) throw new Error(error?.message || "Could not create supplier");
        await syncSupplierCategoryLinks(supabase, created.id, categoryIds);
      }
      onClose();
      onSaved();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={supplier ? "Edit Supplier" : "Add Supplier"}>
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Name</Label>
          <Input required value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="col-span-2">
          <div className="flex items-end justify-between gap-2">
            <Label className="flex-1">Categories</Label>
            <button
              type="button"
              className="text-xs text-primary underline-offset-4 hover:underline"
              onClick={onManageCategories}
            >
              Manage categories
            </button>
          </div>
          {categories.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              No categories yet. Use Manage categories to add some.
            </p>
          ) : (
            <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto rounded-md border bg-muted/10 p-2">
              {categories.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={(form.category_ids || []).includes(c.id)}
                    onChange={(e) => toggleCategory(c.id, e.target.checked)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </div>
        <div>
          <Label>Contact person</Label>
          <Input value={form.contact_person || ""} onChange={(e) => set("contact_person", e.target.value)} />
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label>Email</Label>
          <Input type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label>Address</Label>
          <Input value={form.address || ""} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label>Days open</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUPPLIER_WEEKDAYS.map((d) => (
              <label
                key={d.key}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  (form.days_open || []).includes(d.key)
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-muted",
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={(form.days_open || []).includes(d.key)}
                  onChange={(e) => toggleDay(d.key, e.target.checked)}
                />
                {d.label}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label>Opens</Label>
          <Input
            type="time"
            value={form.opens_at || ""}
            onChange={(e) => set("opens_at", e.target.value)}
          />
        </div>
        <div>
          <Label>Closes</Label>
          <Input
            type="time"
            value={form.closes_at || ""}
            onChange={(e) => set("closes_at", e.target.value)}
          />
        </div>
        <div className="col-span-2">
          <Label>Google Maps link</Label>
          <Input
            type="url"
            value={form.google_maps_pin_url || ""}
            onChange={(e) => set("google_maps_pin_url", e.target.value)}
            placeholder="https://maps.google.com/…"
            autoComplete="off"
          />
        </div>
        <div className="col-span-2">
          <Label>Social media account</Label>
          <Input
            value={form.social_media_url || ""}
            onChange={(e) => set("social_media_url", e.target.value)}
            placeholder="https://instagram.com/… or @handle"
            autoComplete="off"
          />
        </div>
        <div className="col-span-2">
          <Label>Notes</Label>
          <textarea
            className="min-h-[80px] w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            value={form.notes || ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Dialog>
  );
}
