"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Pencil, Plus, Settings2, Trash2 } from "lucide-react";

export type ExpenseCategoryRow = { id: string; name: string; sort_order: number };

function ExpenseCategoryEditDialog({
  open,
  mode,
  row,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "new" | "edit";
  row: ExpenseCategoryRow | null;
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
        const { error } = await supabase
          .from("expense_categories")
          .insert({ name: trimmed, sort_order: sortOrder });
        if (error?.code === "23505") {
          setErr("That category name already exists.");
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
        const { error: catErr } = await supabase
          .from("expense_categories")
          .update({ name: trimmed, sort_order: sortOrder })
          .eq("id", row.id);
        if (catErr) {
          setErr(catErr.message);
          return;
        }
        if (trimmed !== prevName) {
          const { error: expErr } = await supabase
            .from("expenses")
            .update({ category: trimmed })
            .eq("category", prevName);
          if (expErr) {
            setErr(`Category saved but expenses relabel failed: ${expErr.message}`);
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
          ? `Renaming updates all expenses that used "${row.name}".`
          : "New categories appear in filters and when adding expenses."
      }
      size="sm"
    >
      <form onSubmit={submit} className="grid gap-3">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Materials" required />
        </div>
        <div>
          <Label>Sort order</Label>
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
          <p className="mt-1 text-xs text-muted-foreground">Lower numbers appear first in lists.</p>
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

export function ExpenseCategoriesDialog({
  categories,
  onCategoriesChange,
  triggerVariant = "outline",
}: {
  categories: ExpenseCategoryRow[];
  onCategoriesChange: () => void | Promise<void>;
  triggerVariant?: "outline" | "ghost" | "secondary";
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editDialog, setEditDialog] = useState<ExpenseCategoryRow | "new" | null>(null);

  const sorted = useMemo(
    () => [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [categories],
  );

  async function countExpensesForCategory(name: string) {
    const { count, error } = await supabase
      .from("expenses")
      .select("id", { count: "exact", head: true })
      .eq("category", name);
    if (error) return null;
    return count ?? 0;
  }

  async function deleteCategory(row: ExpenseCategoryRow) {
    const n = await countExpensesForCategory(row.name);
    if (n === null) {
      setMsg("Could not count expenses for this category.");
      return;
    }
    if (n > 0) {
      setMsg(`Cannot delete: ${n} expense(s) still use "${row.name}". Reassign or delete those first.`);
      return;
    }
    if (!confirm(`Delete category "${row.name}"?`)) return;
    setMsg(null);
    const { error } = await supabase.from("expense_categories").delete().eq("id", row.id);
    if (error) {
      setMsg(error.message);
      return;
    }
    await onCategoriesChange();
    setMsg("Category deleted.");
  }

  return (
    <>
      <Button type="button" variant={triggerVariant} size="sm" onClick={() => setOpen(true)}>
        <Settings2 className="mr-1 h-4 w-4" />
        Categories
      </Button>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setMsg(null);
        }}
        title="Expense categories"
        description="Add, rename, or remove expense types used in filters and forms."
        size="md"
      >
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setMsg(null);
                setEditDialog("new");
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add category
            </Button>
          </div>
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
          <div className="max-h-80 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/80 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 pl-3">Name</th>
                  <th className="p-2 w-16">Sort</th>
                  <th className="p-2 pr-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-4 text-muted-foreground">
                      No categories yet. Run migration 081 or add one above.
                    </td>
                  </tr>
                ) : (
                  sorted.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-2 pl-3 font-medium">{c.name}</td>
                      <td className="p-2 tabular-nums text-muted-foreground">{c.sort_order}</td>
                      <td className="p-2 pr-3 text-right">
                        <button
                          type="button"
                          title="Edit"
                          className="mr-1 rounded p-1 text-muted-foreground hover:bg-muted"
                          onClick={() => {
                            setMsg(null);
                            setEditDialog(c);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => void deleteCategory(c)}
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
        </div>
      </Dialog>

      <ExpenseCategoryEditDialog
        open={editDialog !== null}
        mode={editDialog === "new" ? "new" : "edit"}
        row={editDialog !== null && editDialog !== "new" ? editDialog : null}
        onClose={() => setEditDialog(null)}
        onSaved={async (hint) => {
          await onCategoriesChange();
          setMsg(hint === "new" ? "Category added." : "Category saved.");
          setEditDialog(null);
        }}
      />
    </>
  );
}
