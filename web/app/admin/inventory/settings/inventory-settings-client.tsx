"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Plus, Trash2 } from "lucide-react";

export type CategoryRow = { id: string; name: string; slug: string; sort_order: number };
export type TypeRow = { id: string; name: string };

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/['"’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "category";
  return base.slice(0, 48);
}

export function InventorySettingsClient({
  initialTypes,
  initialCategories,
}: {
  initialTypes: TypeRow[];
  initialCategories: CategoryRow[];
}) {
  const supabase = createClient();
  const [types, setTypes] = useState<TypeRow[]>(initialTypes);
  const [categories, setCategories] = useState<CategoryRow[]>(initialCategories);
  const [typeMsg, setTypeMsg] = useState<string | null>(null);
  const [typeDialog, setTypeDialog] = useState<TypeRow | "new" | null>(null);
  const [catMsg, setCatMsg] = useState<string | null>(null);
  const [catDialog, setCatDialog] = useState<CategoryRow | "new" | null>(null);

  async function refreshTypes() {
    const { data } = await supabase.from("inventory_type_options").select("id,name").order("name");
    setTypes((data as TypeRow[]) || []);
  }

  async function refreshCategories() {
    const { data } = await supabase
      .from("inventory_categories")
      .select("id,name,slug,sort_order")
      .order("sort_order")
      .order("name");
    setCategories((data as CategoryRow[]) || []);
  }

  async function deleteType(row: TypeRow) {
    if (!confirm(`Remove saved type "${row.name}"? Inventory items are not changed.`)) return;
    setTypeMsg(null);
    const { error } = await supabase.from("inventory_type_options").delete().eq("id", row.id);
    if (error) {
      setTypeMsg(error.message);
      return;
    }
    await refreshTypes();
    setTypeMsg("Removed.");
  }

  async function countInventoryForCategory(exactName: string) {
    const { count, error } = await supabase
      .from("inventory")
      .select("id", { count: "exact", head: true })
      .eq("category", exactName);
    if (error) return null;
    return count ?? 0;
  }

  async function deleteCategory(row: CategoryRow) {
    const n = await countInventoryForCategory(row.name);
    if (n === null) {
      setCatMsg("Could not count inventory items.");
      return;
    }
    if (n > 0) {
      setCatMsg(`Cannot delete: ${n} item(s) still use category "${row.name}". Change those items first.`);
      return;
    }
    if (!confirm(`Delete category "${row.name}"? This removes the filter tab.`)) return;
    setCatMsg(null);
    const { error } = await supabase.from("inventory_categories").delete().eq("id", row.id);
    if (error) {
      setCatMsg(error.message);
      return;
    }
    await refreshCategories();
    setCatMsg("Category deleted.");
  }

  const sortedCats = useMemo(() => [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)), [categories]);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Saved types</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Quick-pick labels when adding or editing inventory items. Renaming a type updates matching inventory rows.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setTypeMsg(null);
                setTypeDialog("new");
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
          {typeMsg && <p className="mt-3 text-sm text-muted-foreground">{typeMsg}</p>}
          <div className="mt-4 overflow-x-auto rounded-md border">
            <table className="w-full min-w-[280px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 pl-3">Name</th>
                  <th className="p-2 pr-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {types.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="p-3 text-muted-foreground">
                      No saved types yet. Use Add to create one.
                    </td>
                  </tr>
                ) : (
                  types.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="p-2 pl-3 font-medium">{t.name}</td>
                      <td className="p-2 pr-3 text-right">
                        <button
                          type="button"
                          title="Edit"
                          onClick={() => {
                            setTypeMsg(null);
                            setTypeDialog(t);
                          }}
                          className="mr-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => deleteType(t)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Categories</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Filter tabs on the main inventory page. Item rows store the category <span className="font-medium text-foreground">name</span> exactly as shown here.
              </p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => setCatDialog("new")}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
          {catMsg && <p className="mt-3 text-sm text-muted-foreground">{catMsg}</p>}
          <div className="mt-4 overflow-x-auto rounded-md border">
            <table className="w-full min-w-[360px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 pl-3">Name</th>
                  <th className="p-2">URL key</th>
                  <th className="p-2">Sort</th>
                  <th className="p-2 pr-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {sortedCats.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2 pl-3 font-medium">{c.name}</td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">{c.slug}</td>
                    <td className="p-2 tabular-nums">{c.sort_order}</td>
                    <td className="p-2 pr-3 text-right">
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => {
                          setCatMsg(null);
                          setCatDialog(c);
                        }}
                        className="mr-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => deleteCategory(c)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <TypeEditDialog
        open={typeDialog !== null}
        mode={typeDialog === "new" ? "new" : "edit"}
        row={typeDialog !== null && typeDialog !== "new" ? typeDialog : null}
        onClose={() => setTypeDialog(null)}
        onSaved={async (hint: "new" | "edit") => {
          await refreshTypes();
          setTypeMsg(hint === "new" ? "Type created." : "Type saved.");
          setTypeDialog(null);
        }}
      />

      <CategoryEditDialog
        open={catDialog !== null}
        mode={catDialog === "new" ? "new" : "edit"}
        row={catDialog !== null && catDialog !== "new" ? catDialog : null}
        existingSlugs={categories.map((c) => c.slug)}
        onClose={() => setCatDialog(null)}
        onSaved={async (hint: "new" | "edit") => {
          await refreshCategories();
          setCatMsg(hint === "new" ? "Category created." : "Category saved.");
          setCatDialog(null);
        }}
      />
    </div>
  );
}

function TypeEditDialog({
  open,
  mode,
  row,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "new" | "edit";
  row: TypeRow | null;
  onClose: () => void;
  onSaved: (hint: "new" | "edit") => void | Promise<void>;
}) {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && row) {
      setName(row.name);
    } else {
      setName("");
    }
    setErr(null);
  }, [open, mode, row]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Name is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (mode === "new") {
        const { error } = await supabase.from("inventory_type_options").insert({ name: trimmed });
        if (error?.code === "23505") {
          setErr("That type is already saved (same spelling, ignoring case).");
          return;
        }
        if (error) {
          setErr(error.message);
          return;
        }
        await onSaved("new");
        return;
      }
      if (row) {
        const prevName = row.name;
        const { error: uErr } = await supabase.from("inventory_type_options").update({ name: trimmed }).eq("id", row.id);
        if (uErr) {
          setErr(uErr.message);
          return;
        }
        if (trimmed !== prevName) {
          const { error: invErr } = await supabase.from("inventory").update({ item_type: trimmed }).eq("item_type", prevName);
          if (invErr) {
            setErr(`Type updated but inventory relabel failed: ${invErr.message}`);
            return;
          }
        }
        await onSaved("edit");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === "new" ? "Add saved type" : "Edit saved type"}
      description={
        mode === "edit" && row
          ? `Renaming updates all inventory rows whose type was exactly "${row.name}".`
          : "This label appears in the quick-pick list when editing stock items."
      }
    >
      <form onSubmit={submit} className="grid gap-3">
        <div>
          <Label>Name</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jersey" />
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function CategoryEditDialog({
  open,
  mode,
  row,
  existingSlugs,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "new" | "edit";
  row: CategoryRow | null;
  existingSlugs: string[];
  onClose: () => void;
  onSaved: (hint: "new" | "edit") => void | Promise<void>;
}) {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && row) {
      setName(row.name);
      setSortOrder(row.sort_order);
    } else {
      setName("");
      setSortOrder(0);
    }
    setErr(null);
  }, [open, mode, row]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setErr("Name is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (mode === "new") {
        let slug = slugify(trimmed);
        const taken = new Set(existingSlugs);
        let n = 0;
        while (taken.has(slug)) {
          n += 1;
          slug = `${slugify(trimmed)}_${n}`;
        }
        const { error } = await supabase.from("inventory_categories").insert({
          name: trimmed,
          slug,
          sort_order: sortOrder,
        });
        if (error) {
          setErr(error.message);
          return;
        }
        await onSaved("new");
        return;
      } else if (row) {
        const prevName = row.name;
        const { error: uErr } = await supabase
          .from("inventory_categories")
          .update({ name: trimmed, sort_order: sortOrder })
          .eq("id", row.id);
        if (uErr) {
          setErr(uErr.message);
          return;
        }
        if (trimmed !== prevName) {
          const { error: invErr } = await supabase.from("inventory").update({ category: trimmed }).eq("category", prevName);
          if (invErr) {
            setErr(`Category updated but inventory relabel failed: ${invErr.message}`);
            return;
          }
        }
        await onSaved("edit");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === "new" ? "Add category" : "Edit category"}
      description={
        mode === "edit" && row
          ? `URL filter stays ?kind=${row.slug}. Renaming updates all inventory rows that used "${row.name}".`
          : "A URL key (slug) is created from the name. Use sort order for tab order (lower first)."
      }
    >
      <form onSubmit={submit} className="grid gap-3">
        <div>
          <Label>Name</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Product" />
        </div>
        <div>
          <Label>Sort order</Label>
          <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
