"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Pencil, Plus } from "lucide-react";
import {
  EMPLOYEE_POSITION_LABEL,
  EMPLOYEE_POSITION_VALUES,
  isEmployeePositionValue,
} from "@/lib/employee-positions";

const selectClass = cn(
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary",
);

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
                {p.position && (
                  <Badge variant="outline">
                    {(() => {
                      const k = String(p.position).trim().toLowerCase();
                      return isEmployeePositionValue(k) ? EMPLOYEE_POSITION_LABEL[k] : p.position;
                    })()}
                  </Badge>
                )}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Pay type, rate, and allowance are set on the{" "}
                <Link href="/admin/salary" className="font-medium text-primary underline underline-offset-2">
                  Salary
                </Link>{" "}
                page.
              </p>
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
    email: "",
    password: "",
    full_name: "",
    phone: "",
    position: "sales",
    role: "employee",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  function set(k: string, v: any) {
    setForm((f: any) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const payload = {
      email: form.email,
      password: form.password,
      full_name: form.full_name,
      phone: form.phone,
      position: form.position,
      role: form.role,
    };
    const res = await fetch("/api/admin/create-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) {
      setErr([j.error, j.hint].filter(Boolean).join(" ") || "Failed");
      return;
    }
    onClose();
    onSaved();
    setForm({
      email: "",
      password: "",
      full_name: "",
      phone: "",
      position: "sales",
      role: "employee",
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add Employee">
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>Full name</Label><Input required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></div>
        <div><Label>Email</Label><Input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div><Label>Password</Label><Input type="password" required minLength={6} value={form.password} onChange={(e) => set("password", e.target.value)} /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div>
          <Label>Position</Label>
          <select
            required
            className={selectClass}
            value={form.position}
            onChange={(e) => set("position", e.target.value)}
          >
            {EMPLOYEE_POSITION_VALUES.map((v) => (
              <option key={v} value={v}>{EMPLOYEE_POSITION_LABEL[v]}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Role</Label>
          <select className={selectClass} value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <p className="col-span-2 text-xs text-muted-foreground">
          After creating this person, set their salary type, rate, and allowance under{" "}
          <Link href="/admin/salary" className="font-medium text-primary underline underline-offset-2">
            Salary
          </Link>
          .
        </p>
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

  useEffect(() => {
    if (!open || !employee) return;
    const raw = String(employee.position ?? "").trim();
    const key = raw.toLowerCase();
    const position = raw
      ? (isEmployeePositionValue(key) ? key : raw)
      : "sales";
    setForm({
      ...employee,
      position,
    });
  }, [open, employee]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const posRaw = String(form.position || "").trim().toLowerCase();
    const position = isEmployeePositionValue(posRaw) ? posRaw : String(form.position || "").trim() || null;
    await supabase
      .from("profiles")
      .update({
        full_name: form.full_name,
        phone: form.phone,
        position,
        role: form.role,
        active: form.active,
      })
      .eq("id", form.id);
    onClose();
    onSaved();
  }

  if (!employee) return null;

  const posRaw = String(form.position || "").trim();
  const posKey = posRaw.toLowerCase();
  const isStandardPosition = isEmployeePositionValue(posKey);
  const positionSelectValue = isStandardPosition ? posKey : (posRaw || "sales");

  return (
    <Dialog open={open} onClose={onClose} title="Edit Employee">
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Full name</Label>
          <Input value={form.full_name || ""} onChange={(e) => set("full_name", e.target.value)} />
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div>
          <Label>Position</Label>
          <select
            className={selectClass}
            value={positionSelectValue}
            onChange={(e) => set("position", e.target.value)}
          >
            {EMPLOYEE_POSITION_VALUES.map((v) => (
              <option key={v} value={v}>
                {EMPLOYEE_POSITION_LABEL[v]}
              </option>
            ))}
            {!isStandardPosition && posRaw && <option value={posRaw}>{posRaw} (legacy)</option>}
          </select>
          {!isStandardPosition && posRaw && (
            <p className="text-xs text-muted-foreground">Choose Sales, Artist, Staff, or Sewer to align with roles.</p>
          )}
        </div>
        <div>
          <Label>Role</Label>
          <select className={selectClass} value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <Label>Status</Label>
          <select className={selectClass} value={form.active ? "1" : "0"} onChange={(e) => set("active", e.target.value === "1")}>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </div>
        <p className="col-span-2 text-xs text-muted-foreground">
          Salary type, rate, and allowance are edited on the{" "}
          <Link href="/admin/salary" className="font-medium text-primary underline underline-offset-2">
            Salary
          </Link>{" "}
          page.
        </p>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Dialog>
  );
}
