"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { MachineTypeOption } from "@/lib/inventory-assets";

export function MachineTypesDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const supabase = createClient();
  const [types, setTypes] = useState<MachineTypeOption[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("machine_types")
      .select("id, name, sort_order")
      .order("sort_order")
      .order("name");
    setTypes((data as MachineTypeOption[]) || []);
  }

  useEffect(() => {
    if (open) void load();
  }, [open]);

  async function addType(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    const maxOrder = types.reduce((m, t) => Math.max(m, t.sort_order), 0);
    const { error } = await supabase.from("machine_types").insert({ name: trimmed, sort_order: maxOrder + 1 });
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setNewName("");
    await load();
    onChanged?.();
  }

  async function saveEdit(id: string) {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    setSaving(true);
    const { error } = await supabase.from("machine_types").update({ name: trimmed }).eq("id", id);
    setSaving(false);
    if (error) {
      alert(error.message);
      return;
    }
    setEditingId(null);
    setEditingName("");
    await load();
    onChanged?.();
  }

  async function deleteType(id: string) {
    if (
      !confirm(
        "Delete this machine type? Assets and maintenance tasks using it will clear the type selection.",
      )
    ) {
      return;
    }
    const { error } = await supabase.from("machine_types").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    await load();
    onChanged?.();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Machine types"
      description="Categories for shop equipment (DTF printer, sublimation machine, heat press, etc.). Used when adding assets and maintenance tasks."
      size="xl"
    >
      <div className="space-y-3">
        <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
          {types.length === 0 && (
            <li className="px-3 py-4 text-center text-xs text-muted-foreground">No machine types yet.</li>
          )}
          {types.map((m) => (
            <li key={m.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
              {editingId === m.id ? (
                <>
                  <Input
                    className="h-7 flex-1 text-sm"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveEdit(m.id);
                      }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={() => saveEdit(m.id)}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium">{m.name}</span>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit"
                    onClick={() => {
                      setEditingId(m.id);
                      setEditingName(m.name);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-destructive hover:bg-destructive/10"
                    title="Delete"
                    onClick={() => deleteType(m.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={addType} className="flex gap-2">
          <Input
            placeholder="New type (e.g. DTF Printer)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={saving || !newName.trim()}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </form>

        <div className="flex justify-end pt-1">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export async function fetchMachineTypes(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase
    .from("machine_types")
    .select("id, name, sort_order")
    .order("sort_order")
    .order("name");
  return (data as MachineTypeOption[]) || [];
}
