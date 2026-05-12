"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
import { History, Plus, Pencil, Search, Trash2 } from "lucide-react";

type Item = {
  id: string;
  name: string;
  category?: string | null;
  item_type?: string | null;
  quantity?: number | null;
  unit?: string | null;
  min_level?: number | null;
  unit_cost?: number | null;
  supplier?: string | null;
  notes?: string | null;
  product_store?: string | null;
  store_id?: string | null;
};

export type InventoryCategoryRow = { id: string; name: string; slug: string; sort_order: number };

/** Used only when categories table is empty (e.g. migration 035 not applied yet). */
const FALLBACK_CATEGORIES: InventoryCategoryRow[] = [
  { id: "", name: "Product", slug: "product", sort_order: 0 },
  { id: "", name: "Material", slug: "material", sort_order: 1 },
  { id: "", name: "Ready made product", slug: "ready_made", sort_order: 2 },
];

function normalizeCat(c: string | null | undefined) {
  return (c || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Row matches tab slug; includes legacy category spellings for default slugs. */
function rowMatchesCategoryFilter(
  rowCategory: string | null | undefined,
  kindSlug: string,
  categories: InventoryCategoryRow[],
): boolean {
  if (kindSlug === "all") return true;
  const cat = categories.find((c) => c.slug === kindSlug);
  if (!cat) return true;
  const n = normalizeCat(rowCategory);
  if (n === normalizeCat(cat.name)) return true;
  if (cat.slug === "product") return n === "product" || n === "products";
  if (cat.slug === "material") return n === "material" || n === "materials";
  if (cat.slug === "ready_made") {
    return n === "ready made product" || n === "ready-made product" || n === "readymade product";
  }
  return false;
}

function parseKindParam(raw: string | null, validSlugs: Set<string>): string {
  if (!raw || raw === "all") return "all";
  if (validSlugs.has(raw)) return raw;
  return "all";
}

const filterSelectClass = cn(
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary",
);

function statusOf(i: Item) {
  const q = Number(i.quantity), m = Number(i.min_level);
  if (q <= m) return { label: "Low Stock", v: "red" as const };
  if (q <= m * 1.5) return { label: "Watch", v: "amber" as const };
  return { label: "OK", v: "green" as const };
}

function isLowStockRow(i: Item) {
  const q = Number(i.quantity), m = Number(i.min_level);
  return q <= m;
}

/** Every whitespace-separated token must appear somewhere in the item fields (case-insensitive). */
function itemMatchesSearch(i: Item, raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const blob = [
    i.name,
    i.category,
    i.item_type,
    i.supplier,
    i.notes,
    i.product_store,
    String(i.quantity ?? ""),
    String(i.min_level ?? ""),
    String(i.unit_cost ?? ""),
  ]
    .map((x) => (x == null ? "" : String(x)).toLowerCase())
    .join("\n");
  return tokens.every((t) => blob.includes(t));
}

function onHandLabel(i: Item) {
  const q = Number(i.quantity ?? 0);
  const u = (i.unit || "").trim();
  return u ? `${q} ${u}` : String(q);
}

function fmtQty(n: number | null | undefined) {
  const v = Number(n ?? 0);
  if (Number.isNaN(v)) return "0";
  return Number.isInteger(v) ? String(v) : v.toLocaleString("en-PH", { maximumFractionDigits: 4 });
}

function minLevelDisplay(i: Item) {
  if (i.min_level == null) return "—";
  return fmtQty(Number(i.min_level));
}

function InventoryInlineNumberCell({
  item,
  field,
  canEdit,
  onCommit,
}: {
  item: Item;
  field: "quantity" | "min_level";
  canEdit: boolean;
  onCommit: (id: string, field: "quantity" | "min_level", value: number) => Promise<void>;
}) {
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);

  const current =
    field === "quantity" ? Number(item.quantity ?? 0) : Number(item.min_level ?? 0);

  useEffect(() => {
    if (active) {
      queueMicrotask(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [active]);

  async function finish(save: boolean) {
    if (!active) return;
    if (!save) {
      setActive(false);
      return;
    }
    const raw = draft.trim().replace(/,/g, "");
    const n = parseFloat(raw);
    if (Number.isNaN(n) || n < 0) {
      setActive(false);
      return;
    }
    if (n === current) {
      setActive(false);
      return;
    }
    await onCommit(item.id, field, n);
    setActive(false);
  }

  function onBlurInput() {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      setActive(false);
      return;
    }
    void finish(true);
  }

  if (!canEdit) {
    return (
      <td className="p-2 whitespace-nowrap">
        {field === "quantity" ? onHandLabel(item) : minLevelDisplay(item)}
      </td>
    );
  }

  if (!active) {
    return (
      <td
        className={cn(
          "p-2 whitespace-nowrap cursor-pointer rounded-sm outline-none transition-colors",
          "hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
        role="button"
        tabIndex={0}
        title="Click to edit"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDraft(fmtQty(current));
            setActive(true);
          }
        }}
        onClick={() => {
          setDraft(fmtQty(current));
          setActive(true);
        }}
      >
        {field === "quantity" ? onHandLabel(item) : minLevelDisplay(item)}
      </td>
    );
  }

  return (
    <td className="p-1 align-middle">
      <div className="flex max-w-[11rem] items-center gap-1 pr-1">
        <Input
          ref={inputRef}
          type="number"
          step="0.01"
          min={0}
          className="h-8 min-w-[5.5rem] font-mono text-sm"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={onBlurInput}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              skipBlurCommitRef.current = true;
              setActive(false);
            }
          }}
        />
        {field === "quantity" && (item.unit || "").trim() ? (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{item.unit}</span>
        ) : null}
      </div>
    </td>
  );
}

export function InventoryClient({
  initial,
  initialCategories,
  initialTypePresets,
  canEdit,
}: {
  initial: Item[];
  initialCategories: InventoryCategoryRow[];
  initialTypePresets: string[];
  canEdit: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<InventoryCategoryRow[]>(initialCategories);
  const categoriesForUi = categories.length > 0 ? categories : FALLBACK_CATEGORIES;
  const slugSet = useMemo(() => new Set(categoriesForUi.map((c) => c.slug)), [categoriesForUi]);
  const kind = parseKindParam(searchParams.get("kind"), slugSet);
  const typeParam = searchParams.get("type");
  const typeFilter = useMemo(() => {
    if (!typeParam) return "";
    try {
      return decodeURIComponent(typeParam);
    } catch {
      return typeParam;
    }
  }, [typeParam]);
  const lowOnly = searchParams.get("low") === "1";
  const searchParamKey = searchParams.get("q");
  const searchQuery = useMemo(() => {
    if (!searchParamKey) return "";
    try {
      return decodeURIComponent(searchParamKey);
    } catch {
      return searchParamKey;
    }
  }, [searchParamKey]);
  const [items, setItems] = useState<Item[]>(initial);
  const [typePresetNames, setTypePresetNames] = useState<string[]>(initialTypePresets);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [stockHistoryOpen, setStockHistoryOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkOnHandOpen, setBulkOnHandOpen] = useState(false);
  const [bulkQty, setBulkQty] = useState("");
  const selectAllRef = useRef<HTMLInputElement>(null);

  const typeNamesForFilter = useMemo(() => {
    const set = new Set<string>();
    for (const n of typePresetNames) {
      const t = n.trim();
      if (t) set.add(t);
    }
    for (const i of items) {
      const t = (i.item_type || "").trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items, typePresetNames]);

  const defaultCategoryForNew = useMemo(() => {
    if (kind !== "all") {
      const cat = categoriesForUi.find((c) => c.slug === kind);
      if (cat) return cat.name;
    }
    return categoriesForUi[0]?.name ?? "Product";
  }, [kind, categoriesForUi]);

  function applyFilters(nextKind: string, nextType: string, nextLowOnly: boolean, nextQ?: string) {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("category");
    if (nextKind === "all") p.delete("kind");
    else p.set("kind", nextKind);
    const typeTrim = nextType.trim();
    if (!typeTrim) p.delete("type");
    else p.set("type", encodeURIComponent(typeTrim));
    if (nextLowOnly) p.set("low", "1");
    else p.delete("low");
    const qResolved = (nextQ !== undefined ? nextQ : searchQuery).trim();
    if (!qResolved) p.delete("q");
    else p.set("q", encodeURIComponent(qResolved));
    const qs = p.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function clearFilters() {
    applyFilters("all", "", false, "");
  }

  const visible = useMemo(() => {
    return items.filter((i) => {
      if (!rowMatchesCategoryFilter(i.category, kind, categoriesForUi)) return false;
      if (typeFilter) {
        const t = (i.item_type || "").trim();
        if (t !== typeFilter) return false;
      }
      if (lowOnly && !isLowStockRow(i)) return false;
      if (!itemMatchesSearch(i, searchQuery)) return false;
      return true;
    });
  }, [items, kind, categoriesForUi, typeFilter, lowOnly, searchQuery]);

  const allVisibleSelected = visible.length > 0 && visible.every((i) => selectedIds.has(i.id));
  const someVisibleSelected = visible.some((i) => selectedIds.has(i.id));
  const selectedCount = selectedIds.size;

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = someVisibleSelected && !allVisibleSelected;
  }, [someVisibleSelected, allVisibleSelected]);

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allOn = visible.length > 0 && visible.every((v) => next.has(v.id));
      if (allOn) {
        for (const v of visible) next.delete(v.id);
      } else {
        for (const v of visible) next.add(v.id);
      }
      return next;
    });
  }

  function toggleRowSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} item(s)? This cannot be undone.`)) return;
    const { error } = await supabase.from("inventory").delete().in("id", ids);
    if (error) {
      alert(error.message);
      return;
    }
    clearSelection();
    await refresh();
  }

  async function applyBulkOnHand() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const q = Number(bulkQty);
    if (Number.isNaN(q)) {
      alert("Enter a valid number for on hand.");
      return;
    }
    const { error } = await supabase.from("inventory").update({ quantity: q }).in("id", ids);
    if (error) {
      alert(error.message);
      return;
    }
    setBulkOnHandOpen(false);
    setBulkQty("");
    clearSelection();
    await refresh();
  }

  async function refresh() {
    const [{ data: inv }, { data: cats }, { data: typeRows }] = await Promise.all([
      supabase.from("inventory").select("*").order("name"),
      supabase.from("inventory_categories").select("id,name,slug,sort_order").order("sort_order").order("name"),
      supabase.from("inventory_type_options").select("name").order("name"),
    ]);
    setItems((inv as Item[]) || []);
    setCategories((cats as InventoryCategoryRow[]) || []);
    setTypePresetNames(((typeRows as { name: string }[]) || []).map((r) => r.name).filter(Boolean));
  }

  async function remove(id: string) {
    if (!confirm("Delete this item?")) return;
    await supabase.from("inventory").delete().eq("id", id);
    refresh();
  }

  async function commitInventoryField(id: string, field: "quantity" | "min_level", value: number) {
    const patch = field === "quantity" ? { quantity: value } : { min_level: value };
    const { error } = await supabase.from("inventory").update(patch).eq("id", id);
    if (error) {
      alert(error.message);
      await refresh();
      return;
    }
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  const lowCount = items.filter((i) => isLowStockRow(i)).length;

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total Items</div>
            <div className="text-2xl font-semibold">{items.length}</div>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={lowCount > 0 ? 0 : -1}
          aria-pressed={lowOnly}
          aria-disabled={lowCount === 0}
          aria-label={
            lowCount === 0
              ? "No low stock items"
              : lowOnly
                ? "Low stock filter is on. Click to show all rows again."
                : `Show only low stock items (${lowCount})`
          }
          className={cn(
            "outline-none transition-colors",
            lowCount > 0 && "cursor-pointer hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            lowOnly && lowCount > 0 && "border-primary bg-primary/5 ring-2 ring-primary/40",
            lowCount === 0 && "cursor-not-allowed opacity-70",
          )}
          onClick={() => {
            if (lowCount === 0) return;
            applyFilters(kind, typeFilter, !lowOnly, searchQuery);
          }}
          onKeyDown={(e) => {
            if (lowCount === 0) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              applyFilters(kind, typeFilter, !lowOnly, searchQuery);
            }
          }}
        >
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Low Stock</div>
            <div className="text-2xl font-semibold text-destructive">{lowCount}</div>
            {lowCount > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">{lowOnly ? "Filtered — click again to clear" : "Click to list low stock only"}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 rounded-lg border bg-card p-4 shadow-sm">
          <div className="text-sm font-medium text-foreground">Filter inventory</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Narrow the list by category, type, search text, or low stock. Filters update the URL so you can bookmark them.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="inv-filter-category" className="text-xs">
                Category
              </Label>
              <select
                id="inv-filter-category"
                value={kind}
                onChange={(e) => applyFilters(e.target.value, typeFilter, lowOnly)}
                className={filterSelectClass}
                aria-label="Filter by category"
              >
                <option value="all">All categories</option>
                {categoriesForUi.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-filter-type" className="text-xs">
                Type
              </Label>
              <select
                id="inv-filter-type"
                value={typeFilter}
                onChange={(e) => applyFilters(kind, e.target.value, lowOnly)}
                className={filterSelectClass}
                aria-label="Filter by type"
              >
                <option value="">All types</option>
                {typeFilter && !typeNamesForFilter.includes(typeFilter) && (
                  <option value={typeFilter}>{typeFilter} (active filter)</option>
                )}
                {typeNamesForFilter.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:pb-0.5">
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="inv-search" className="flex items-center gap-1.5 text-xs">
              <Search className="h-3.5 w-3.5" aria-hidden />
              Search
            </Label>
            <Input
              id="inv-search"
              type="search"
              placeholder="Name, category, type, supplier, notes, quantity…"
              value={searchQuery}
              onChange={(e) => applyFilters(kind, typeFilter, lowOnly, e.target.value)}
              className="max-w-xl"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
          <Button type="button" variant="outline" className="h-9 shrink-0" onClick={() => setStockHistoryOpen(true)}>
            <History className="mr-1 h-4 w-4" />
            Stock history
          </Button>
          {canEdit && (
            <Link
              href="/admin/inventory/settings"
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Categories & types
            </Link>
          )}
          {canEdit && (
            <Button className="h-9 shrink-0" onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> Add Item
            </Button>
          )}
        </div>
      </div>

      {canEdit && selectedCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span className="font-medium text-foreground">
            {selectedCount} selected
          </span>
          <Button type="button" size="sm" variant="secondary" onClick={() => setBulkOnHandOpen(true)}>
            Set on hand…
          </Button>
          <Button type="button" size="sm" variant="destructive" onClick={bulkDelete}>
            Delete selected
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={clearSelection}>
            Clear selection
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 text-left text-xs font-medium text-muted-foreground backdrop-blur">
              <tr>
              {canEdit && (
                <th className="w-10 p-2 pl-3">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    disabled={visible.length === 0}
                    aria-label="Select all visible items"
                  />
                </th>
              )}
              <th className="p-2 min-w-[240px] w-[28%]">Item</th>
              <th className="p-2 w-[12%]">Category</th>
              <th className="p-2 w-[12%]">Type</th>
              <th className="p-2 w-[10%] whitespace-nowrap">On hand</th>
              <th className="p-2 w-[10%] whitespace-nowrap">Minimum</th>
              <th className="p-2 w-[10%] whitespace-nowrap">Status</th>
              <th className="p-2 w-[10%]">Supplier</th>
              <th className="p-2 min-w-[220px] w-[18%]">Notes</th>
              {canEdit && <th className="p-2 w-24"></th>}
            </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 10 : 8} className="p-8 text-center text-sm text-muted-foreground">
                    No items match the current filters or search.
                  </td>
                </tr>
              )}
              {visible.map((i) => {
                const s = statusOf(i);
                const note = (i.notes || "").trim();
                const sel = selectedIds.has(i.id);
                return (
                  <tr key={i.id} className={cn("border-t hover:bg-muted/30", sel && "bg-primary/5")}>
                    {canEdit && (
                      <td className="p-2 pl-3 align-middle">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input accent-primary"
                          checked={sel}
                          onChange={() => toggleRowSelected(i.id)}
                          aria-label={`Select ${i.name}`}
                        />
                      </td>
                    )}
                    <td className="p-2 font-medium">
                      <span className="block truncate" title={i.name}>{i.name}</span>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      <span className="block truncate" title={i.category || ""}>{i.category || "—"}</span>
                    </td>
                    <td className="p-2 text-muted-foreground">
                      <span className="block truncate" title={i.item_type || ""}>{i.item_type || "—"}</span>
                    </td>
                    <InventoryInlineNumberCell
                      key={`${i.id}-qty`}
                      item={i}
                      field="quantity"
                      canEdit={canEdit}
                      onCommit={commitInventoryField}
                    />
                    <InventoryInlineNumberCell
                      key={`${i.id}-min`}
                      item={i}
                      field="min_level"
                      canEdit={canEdit}
                      onCommit={commitInventoryField}
                    />
                    <td className="p-2 whitespace-nowrap"><Badge variant={s.v}>{s.label}</Badge></td>
                    <td className="p-2 text-muted-foreground">
                      <span className="block truncate" title={i.supplier || ""}>{i.supplier || "—"}</span>
                    </td>
                    <td className="p-2">
                      {note ? (
                        <span className="line-clamp-2 text-muted-foreground" title={note}>{note}</span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="p-2 text-right whitespace-nowrap">
                        <button type="button" onClick={() => { setEditing(i); setOpen(true); }} className="mr-2 text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => remove(i.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ItemForm
        open={open}
        onClose={() => setOpen(false)}
        item={editing}
        onSaved={refresh}
        categories={categoriesForUi}
        defaultCategoryForNew={defaultCategoryForNew}
      />
      <AllStockHistoryDialog open={stockHistoryOpen} onClose={() => setStockHistoryOpen(false)} />

      <Dialog
        open={bulkOnHandOpen}
        onClose={() => {
          setBulkOnHandOpen(false);
          setBulkQty("");
        }}
        title="Set on hand for selected items"
        description={`Applies the same on-hand quantity to ${selectedCount} item(s). Each item keeps its own unit.`}
        size="md"
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void applyBulkOnHand();
          }}
        >
          <div>
            <Label htmlFor="bulk-qty">New quantity (on hand)</Label>
            <Input
              id="bulk-qty"
              type="number"
              step="0.01"
              required
              value={bulkQty}
              onChange={(e) => setBulkQty(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBulkOnHandOpen(false);
                setBulkQty("");
              }}
            >
              Cancel
            </Button>
            <Button type="submit">Apply to {selectedCount} item(s)</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

type InvJoin = { name: string; unit: string | null } | null;

type GlobalMovementRow = {
  id: string;
  created_at: string;
  previous_quantity: number;
  new_quantity: number;
  delta: number;
  actor_id: string | null;
  change_kind?: string | null;
  item_name?: string | null;
  inventory?: InvJoin;
  profiles: { full_name: string | null; email: string | null } | null;
};

function flattenInvJoin(p: InvJoin | InvJoin[] | null | undefined): InvJoin {
  if (!p) return null;
  return Array.isArray(p) ? p[0] ?? null : p;
}

function movementEventLabel(kind: string, delta: number): string {
  if (kind === "item_deleted") return "Item deleted";
  if (kind === "initial") return "Initial stock";
  if (delta > 0) return "Stock increased";
  if (delta < 0) return "Stock decreased";
  return "Stock updated";
}

function AllStockHistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const supabase = createClient();
  const [rows, setRows] = useState<GlobalMovementRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setRows(null);
      setErr(null);
      return;
    }
    let alive = true;
    setRows(null);
    setErr(null);
    (async () => {
      const { data, error } = await supabase
        .from("inventory_quantity_movements")
        .select(
          "id, created_at, previous_quantity, new_quantity, delta, actor_id, change_kind, item_name, inventory:inventory_id(name, unit), profiles:actor_id(full_name, email)",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (!alive) return;
      if (error) {
        setErr(
          error.message.includes("inventory_quantity_movements")
            ? "Run migrations 033–036 for stock history (036 adds delete audit and account labels)."
            : error.message,
        );
        setRows([]);
        return;
      }
      const list = (data || []) as unknown as Array<
        Omit<GlobalMovementRow, "profiles" | "inventory"> & {
          profiles: GlobalMovementRow["profiles"] | GlobalMovementRow["profiles"][];
          inventory: GlobalMovementRow["inventory"] | GlobalMovementRow["inventory"][];
        }
      >;
      setRows(
        list.map((row) => {
          const rawInv = row.inventory as InvJoin | InvJoin[] | null | undefined;
          return {
            ...row,
            profiles: Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles ?? null,
            inventory: flattenInvJoin(rawInv),
          };
        }),
      );
    })();
    return () => {
      alive = false;
    };
  }, [open, supabase]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Stock history"
      description="Recent quantity changes across all inventory items, including who made each change when signed in. Item deletions are listed after migration 036."
      size="xl"
    >
      <div className="max-h-[min(70dvh,32rem)] overflow-auto rounded-md border">
        {err && <p className="p-4 text-sm text-destructive">{err}</p>}
        {!err && rows === null && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {!err && rows && rows.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No stock movements recorded yet.</p>
        )}
        {!err && rows && rows.length > 0 && (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="sticky top-0 bg-muted/90 text-left text-xs font-medium text-muted-foreground backdrop-blur">
              <tr>
                <th className="p-2 pl-3">When</th>
                <th className="p-2">Item</th>
                <th className="p-2">Event</th>
                <th className="p-2">Change</th>
                <th className="p-2">Before → After</th>
                <th className="p-2 pr-3">Account</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const inv = r.inventory;
                const itemLabel = inv?.name?.trim() || r.item_name?.trim() || "Unknown item";
                const unit = (inv?.unit || "").trim();
                const who = r.profiles?.full_name?.trim() || r.profiles?.email || (r.actor_id ? "User" : "—");
                const kind = (r.change_kind || "adjust").trim();
                const d = Number(r.delta);
                const sign = d > 0 ? "+" : "";
                const deleted = kind === "item_deleted";
                return (
                  <tr key={r.id} className="border-t">
                    <td className="whitespace-nowrap p-2 pl-3 text-muted-foreground">{formatDateTime(r.created_at)}</td>
                    <td className="max-w-[200px] truncate p-2 font-medium" title={itemLabel}>
                      {itemLabel}
                    </td>
                    <td className="p-2 text-muted-foreground">{movementEventLabel(kind, d)}</td>
                    <td className="p-2">
                      {deleted ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={cn(
                            "font-medium tabular-nums",
                            d > 0 ? "text-green-700 dark:text-green-400" : d < 0 ? "text-destructive" : "",
                          )}
                        >
                          {sign}
                          {fmtQty(d)}
                          {unit ? ` ${unit}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="p-2 tabular-nums text-muted-foreground">
                      {deleted ? (
                        <span>{fmtQty(r.previous_quantity)} → removed</span>
                      ) : (
                        <>
                          {fmtQty(r.previous_quantity)}
                          {" → "}
                          {fmtQty(r.new_quantity)}
                          {unit ? ` ${unit}` : ""}
                        </>
                      )}
                    </td>
                    <td className="max-w-[160px] truncate p-2 pr-3" title={who}>
                      {who}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}

const inputClass = cn(
  "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
  "placeholder:text-muted-foreground/70",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

function ItemForm({
  open,
  onClose,
  item,
  onSaved,
  categories,
  defaultCategoryForNew,
}: {
  open: boolean;
  onClose: () => void;
  item: Item | null;
  onSaved: () => void;
  categories: InventoryCategoryRow[];
  defaultCategoryForNew: string;
}) {
  const supabase = createClient();
  const empty = useMemo((): Item => ({
    id: "",
    name: "",
    category: defaultCategoryForNew,
    item_type: "",
    quantity: 0,
    unit: "pcs",
    min_level: 0,
    unit_cost: 0,
    supplier: "",
    notes: "",
  }), [defaultCategoryForNew]);

  const [form, setForm] = useState<Item>(() => item || empty);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [typeOptions, setTypeOptions] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!open) return;
    setForm(item ? { ...empty, ...item } : { ...empty });
  }, [open, item, empty]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setSuppliersLoading(true);
      const [{ data: supData }, { data: typeData }] = await Promise.all([
        supabase.from("suppliers").select("id,name").order("name"),
        supabase.from("inventory_type_options").select("id,name").order("name"),
      ]);
      if (!alive) return;
      setSuppliers((supData as any) || []);
      setTypeOptions((typeData as Array<{ id: string; name: string }>) || []);
      setSuppliersLoading(false);
    })();
    return () => { alive = false; };
  }, [open, supabase]);

  function set(k: keyof Item, v: string | number) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  const derivedStatus = statusOf(form);
  const categoryLabels = useMemo(() => new Set(categories.map((c) => c.name)), [categories]);
  const categoryKnown = !form.category || categoryLabels.has(form.category);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      category: form.category?.trim() || null,
      item_type: form.item_type?.trim() || null,
      quantity: Number(form.quantity) || 0,
      unit: (form.unit || "pcs").trim() || "pcs",
      min_level: Number(form.min_level) || 0,
      unit_cost: Number(form.unit_cost) || 0,
      supplier: form.supplier?.trim() || null,
      notes: form.notes?.trim() || null,
    };
    if (item) {
      await supabase.from("inventory").update(payload).eq("id", item.id);
    } else {
      await supabase.from("inventory").insert(payload);
    }
    onClose();
    onSaved();
  }

  return (
    <Dialog open={open} onClose={onClose} title={item ? "Edit Item" : "Add Item"}>
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Item</Label>
          <Input required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Item name" />
        </div>
        <div>
          <Label>Category</Label>
          <select
            value={form.category || categories[0]?.name || ""}
            onChange={(e) => set("category", e.target.value)}
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary",
            )}
          >
            {categories.map((c) => (
              <option key={c.id || c.slug} value={c.name}>
                {c.name}
              </option>
            ))}
            {form.category && !categoryKnown && (
              <option value={form.category}>{form.category} (legacy)</option>
            )}
          </select>
          {!categoryKnown && form.category && (
            <p className="mt-1 text-xs text-muted-foreground">
              Pick a category from the list, or edit categories on the Categories & types page.
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            <Link href="/admin/inventory/settings" className="text-primary underline-offset-4 hover:underline">
              Manage categories & types
            </Link>
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Label>Type</Label>
          <select
            value={form.item_type || ""}
            onChange={(e) => set("item_type", e.target.value)}
            aria-label="Item type"
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary",
              !form.item_type && "text-muted-foreground",
            )}
          >
            <option value="">Select type…</option>
            {form.item_type &&
              !typeOptions.some((t) => t.name === form.item_type) && (
                <option value={form.item_type}>{form.item_type} (current)</option>
              )}
            {typeOptions.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Types come from saved options. Add or rename them on{" "}
            <Link href="/admin/inventory/settings" className="text-primary underline-offset-4 hover:underline">
              Manage categories & types
            </Link>
            .
          </p>
        </div>
        <div>
          <Label>On hand</Label>
          <Input type="number" step="0.01" value={form.quantity ?? 0} onChange={(e) => set("quantity", Number(e.target.value))} />
        </div>
        <div>
          <Label>Unit</Label>
          <Input value={form.unit || ""} onChange={(e) => set("unit", e.target.value)} placeholder="pcs, meters…" />
        </div>
        <div>
          <Label>Minimum stocks</Label>
          <Input type="number" step="0.01" value={form.min_level ?? 0} onChange={(e) => set("min_level", Number(e.target.value))} />
        </div>
        <div>
          <Label>Status</Label>
          <div className="flex h-9 items-center">
            <Badge variant={derivedStatus.v}>{derivedStatus.label}</Badge>
            <span className="ml-2 text-xs text-muted-foreground">from on hand vs minimum</span>
          </div>
        </div>
        <div className="col-span-2">
          <Label>Supplier</Label>
          <select
            value={form.supplier || ""}
            onChange={(e) => set("supplier", e.target.value)}
            className={cn(
              "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            disabled={suppliersLoading}
          >
            <option value="">{suppliersLoading ? "Loading suppliers…" : "Select supplier"}</option>
            {form.supplier && !suppliers.some((s) => s.name === form.supplier) && (
              <option value={form.supplier}>{form.supplier} (current)</option>
            )}
            {suppliers.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <Label>Notes</Label>
          <textarea
            className={inputClass}
            rows={3}
            value={form.notes || ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Optional details"
          />
        </div>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Dialog>
  );
}
