"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Plus, Trash2, Mail, Phone } from "lucide-react";

type S = any;

export function SuppliersClient({ initial }: { initial: S[] }) {
  const supabase = createClient();
  const [list, setList] = useState<S[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<S | null>(null);

  async function refresh() {
    const { data } = await supabase.from("suppliers").select("*").order("name");
    setList(data || []);
  }
  async function remove(id: string) {
    if (!confirm("Delete supplier?")) return;
    await supabase.from("suppliers").delete().eq("id", id);
    refresh();
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" /> Add Supplier</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {list.map((s) => (
          <Card key={s.id} className="card-hover">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{s.name}</div>
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
                {s.notes && <p className="mt-2 rounded bg-muted/40 p-2 text-xs">{s.notes}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground">No suppliers yet.</p>}
      </div>
      <SupplierForm open={open} onClose={() => setOpen(false)} supplier={editing} onSaved={refresh} />
    </>
  );
}

function SupplierForm({ open, onClose, supplier, onSaved }: { open: boolean; onClose: () => void; supplier: S | null; onSaved: () => void }) {
  const supabase = createClient();
  const [form, setForm] = useState<any>(() => supplier || { name: "", contact_person: "", phone: "", email: "", address: "", notes: "" });
  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (supplier) await supabase.from("suppliers").update(form).eq("id", supplier.id);
    else await supabase.from("suppliers").insert(form);
    onClose(); onSaved();
  }

  return (
    <Dialog open={open} onClose={onClose} title={supplier ? "Edit Supplier" : "Add Supplier"}>
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>Name</Label><Input required value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
        <div><Label>Contact person</Label><Input value={form.contact_person || ""} onChange={(e) => set("contact_person", e.target.value)} /></div>
        <div><Label>Phone</Label><Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} /></div>
        <div className="col-span-2"><Label>Email</Label><Input type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} /></div>
        <div className="col-span-2"><Label>Address</Label><Input value={form.address || ""} onChange={(e) => set("address", e.target.value)} /></div>
        <div className="col-span-2"><Label>Notes</Label><textarea className="min-h-[80px] w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></div>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Dialog>
  );
}
