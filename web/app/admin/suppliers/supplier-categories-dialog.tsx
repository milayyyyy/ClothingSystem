"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Pencil, Plus, Trash2 } from "lucide-react";

export type SupplierCategoryRow = { id: string; name: string; sort_order: number };

export function SupplierCategoriesDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<SupplierCategoryRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<SupplierCategoryRow | "new" | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from("supplier_categories")
      .select("id,name,sort_order")
      .order("sort_order")
      .order("name");
    if (error) {
      setMsg(error.message);
      return;
    }
    setRows((data as SupplierCategoryRow[]) || []);
  }

  useEffect(() => {
    if (open) {
      setMsg(null);
      setEditing(null);
      void load();
    }
  }, [open]);

  function openNew() {
    setEditing("new");
    setName("");
    setMsg(null);
  }

  function openEdit(row: SupplierCategoryRow) {
    setEditing(row);
    setName(row.name);
    setMsg(null);
  }

  async function saveCategory(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setMsg(null);
    if (editing === "new") {
      const maxSort = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
      const { error } = await supabase
        .from("supplier_categories")
        .insert({ name: trimmed, sort_order: maxSort + 1 });
      if (error) setMsg(error.message);
      else {
        setEditing(null);
        await load();
        onChanged();
      }
    } else if (editing && editing !== "new") {
      const { error } = await supabase
        .from("supplier_categories")
        .update({ name: trimmed })
        .eq("id", editing.id);
      if (error) setMsg(error.message);
      else {
        setEditing(null);
        await load();
        onChanged();
      }
    }
    setSaving(false);
  }

  async function remove(row: SupplierCategoryRow) {
    const { count, error: countErr } = await supabase
      .from("supplier_category_links")
      .select("supplier_id", { count: "exact", head: true })
      .eq("category_id", row.id);
    if (countErr) {
      setMsg(countErr.message);
      return;
    }
    if ((count ?? 0) > 0) {
      setMsg(`Cannot delete: ${count} supplier(s) use "${row.name}". Reassign them first.`);
      return;
    }
    if (!confirm(`Delete category "${row.name}"?`)) return;
    const { error } = await supabase.from("supplier_categories").delete().eq("id", row.id);
    if (error) {
      setMsg(error.message);
      return;
    }
    await load();
    onChanged();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Supplier categories" description="Add, rename, or remove categories used when assigning suppliers." size="md">
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="secondary" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            Add category
          </Button>
        </div>

        {editing && (
          <form onSubmit={saveCategory} className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <Label>{editing === "new" ? "New category" : "Edit category"}</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fabrics, Ink, Packaging"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving || !name.trim()}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        )}

        {msg && <p className="text-sm text-destructive">{msg}</p>}

        <ul className="divide-y rounded-lg border">
          {rows.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">No categories yet.</li>
          )}
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
              <span className="text-sm font-medium">{row.name}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-accent"
                  onClick={() => openEdit(row)}
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void remove(row)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex justify-end border-t pt-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
