"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { peso } from "@/lib/utils";
import { Pencil, Plus } from "lucide-react";

type P = any;

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export function EmployeesClient({ initial }: { initial: P[] }) {
  const supabase = createClient();
  const [list, setList] = useState<P[]>(initial);
  const [editing, setEditing] = useState<P | null>(null);
  const [adding, setAdding] = useState(false);

  async function refresh() {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setList(data || []);
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setAdding(true)}><Plus className="mr-1 h-4 w-4" /> Add Employee</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                    {initials(p.full_name || p.email)}
                  </div>
                  <div>
                    <div className="font-medium">{p.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{p.email}</div>
                  </div>
                </div>
                <button onClick={() => setEditing(p)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge variant={p.role === "admin" ? "purple" : "blue"}>{p.role}</Badge>
                <Badge variant={p.active ? "green" : "red"}>{p.active ? "Active" : "Inactive"}</Badge>
                {p.position && <Badge variant="outline">{p.position}</Badge>}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div><dt className="text-muted-foreground text-xs">Salary type</dt><dd className="capitalize">{p.salary_type}</dd></div>
                <div><dt className="text-muted-foreground text-xs">Rate</dt><dd>{peso(p.salary_rate)}</dd></div>
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>
      <EditEmployee open={!!editing} onClose={() => setEditing(null)} employee={editing} onSaved={refresh} />
      <AddEmployee open={adding} onClose={() => setAdding(false)} onSaved={refresh} />
    </>
  );
}

function AddEmployee({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<any>({
    email: "", password: "", full_name: "", phone: "", position: "",
    role: "employee", salary_type: "daily", salary_rate: 0,
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setBusy(true);
    const res = await fetch("/api/admin/create-employee", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(j.error || "Failed"); return; }
    onClose(); onSaved();
    setForm({ email: "", password: "", full_name: "", phone: "", position: "", role: "employee", salary_type: "daily", salary_rate: 0 });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add Employee">
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>Full name</Label><Input required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></div>
        <div><Label>Email</Label><Input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div><Label>Password</Label><Input type="password" required minLength={6} value={form.password} onChange={(e) => set("password", e.target.value)} /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div><Label>Position</Label><Input value={form.position} onChange={(e) => set("position", e.target.value)} /></div>
        <div><Label>Role</Label>
          <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="employee">Employee</option><option value="admin">Admin</option>
          </select>
        </div>
        <div><Label>Salary type</Label>
          <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.salary_type} onChange={(e) => set("salary_type", e.target.value)}>
            <option value="daily">Daily</option><option value="monthly">Monthly</option><option value="per_order">Per order</option>
          </select>
        </div>
        <div className="col-span-2"><Label>Rate (₱)</Label><Input type="number" step="0.01" value={form.salary_rate} onChange={(e) => set("salary_rate", Number(e.target.value))} /></div>
        {err && <p className="col-span-2 text-sm text-destructive">{err}</p>}
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Creating..." : "Create"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditEmployee({ open, onClose, employee, onSaved }: { open: boolean; onClose: () => void; employee: P | null; onSaved: () => void }) {
  const supabase = createClient();
  const [form, setForm] = useState<any>({});
  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  if (employee && form.id !== employee.id) setForm(employee);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("profiles").update({
      full_name: form.full_name, phone: form.phone, position: form.position,
      role: form.role, salary_type: form.salary_type, salary_rate: Number(form.salary_rate || 0),
      active: form.active,
    }).eq("id", form.id);
    onClose(); onSaved();
  }

  if (!employee) return null;
  return (
    <Dialog open={open} onClose={onClose} title="Edit Employee">
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>Full name</Label><Input value={form.full_name || ""} onChange={(e) => set("full_name", e.target.value)} /></div>
        <div><Label>Phone</Label><Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} /></div>
        <div><Label>Position</Label><Input value={form.position || ""} onChange={(e) => set("position", e.target.value)} /></div>
        <div><Label>Role</Label>
          <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="employee">Employee</option><option value="admin">Admin</option>
          </select>
        </div>
        <div><Label>Status</Label>
          <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.active ? "1" : "0"} onChange={(e) => set("active", e.target.value === "1")}>
            <option value="1">Active</option><option value="0">Inactive</option>
          </select>
        </div>
        <div><Label>Salary type</Label>
          <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.salary_type || "daily"} onChange={(e) => set("salary_type", e.target.value)}>
            <option value="daily">Daily</option><option value="monthly">Monthly</option><option value="per_order">Per order</option>
          </select>
        </div>
        <div><Label>Rate (₱)</Label><Input type="number" step="0.01" value={form.salary_rate || 0} onChange={(e) => set("salary_rate", e.target.value)} /></div>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Dialog>
  );
}
