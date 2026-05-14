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
import { Pencil, Plus, ScanFace, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { FaceEnrollDialog } from "@/components/face-enroll-dialog";
import { RoleSettingsDialog } from "@/components/role-settings-dialog";

type EmpPosition = { id: string; name: string; sort_order: number };

const selectClass = cn(
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary",
);

type P = any;
type PositionsMgrProps = { open: boolean; onClose: () => void; onChanged: () => void };

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export function EmployeesClient({ initial }: { initial: P[] }) {
  const supabase = createClient();
  const [list, setList] = useState<P[]>(initial);
  const [editing, setEditing] = useState<P | null>(null);
  const [adding, setAdding] = useState(false);
  const [enrollTarget, setEnrollTarget] = useState<P | null>(null);
  const [positions, setPositions] = useState<EmpPosition[]>([]);
  const [positionsMgrOpen, setPositionsMgrOpen] = useState(false);
  const [roleSettingsOpen, setRoleSettingsOpen] = useState(false);

  async function fetchPositions() {
    const { data } = await supabase
      .from("employee_positions")
      .select("id, name, sort_order")
      .order("sort_order")
      .order("name");
    setPositions(data || []);
  }

  useEffect(() => { void fetchPositions(); }, []);

  async function refresh() {
    const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    setList(data || []);
  }

  function handleEnrolled() {
    void refresh();
    if (enrollTarget) {
      supabase.from("profiles").select("*").eq("id", enrollTarget.id).single()
        .then(({ data }) => { if (data) setEnrollTarget(data); });
    }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setRoleSettingsOpen(true)}>
          <ShieldCheck className="mr-1 h-4 w-4" /> Role Settings
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPositionsMgrOpen(true)}>
          <Settings2 className="mr-1 h-4 w-4" /> Positions
        </Button>
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
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(p)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit employee"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge variant={p.role === "admin" ? "purple" : "blue"}>{p.role}</Badge>
                <Badge variant={p.active ? "green" : "red"}>{p.active ? "Active" : "Inactive"}</Badge>
                {p.position && (
                  <Badge variant="outline">{p.position}</Badge>
                )}
              </div>

              {/* Face enrolment row */}
              <div className="mt-3 flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                <div className="flex items-center gap-2 text-xs">
                  <ScanFace className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Face ID</span>
                  {p.face_descriptor?.length ? (
                    <Badge variant="green" className="text-[10px] px-1.5 py-0">Enrolled</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">Not enrolled</Badge>
                  )}
                </div>
                <button
                  onClick={() => setEnrollTarget(p)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {p.face_descriptor?.length ? "Re-enrol" : "Enrol"}
                </button>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
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

      <RoleSettingsDialog
        open={roleSettingsOpen}
        onClose={() => setRoleSettingsOpen(false)}
      />
      <PositionsManagerDialog
        open={positionsMgrOpen}
        onClose={() => setPositionsMgrOpen(false)}
        onChanged={fetchPositions}
      />
      <EditEmployee open={!!editing} onClose={() => setEditing(null)} employee={editing} positions={positions} onSaved={refresh} />
      <AddEmployee open={adding} onClose={() => setAdding(false)} positions={positions} onSaved={refresh} />
      <FaceEnrollDialog
        open={!!enrollTarget}
        onClose={() => setEnrollTarget(null)}
        employee={enrollTarget}
        onEnrolled={handleEnrolled}
      />
    </>
  );
}

// ── Positions Manager ─────────────────────────────────────────────────────
function PositionsManagerDialog({ open, onClose, onChanged }: PositionsMgrProps) {
  const supabase = createClient();
  const [positions, setPositions] = useState<EmpPosition[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase.from("employee_positions").select("id, name, sort_order").order("sort_order").order("name");
    setPositions(data || []);
  }

  useEffect(() => { if (open) load(); }, [open]);

  async function addPosition(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    const maxOrder = positions.reduce((m, p) => Math.max(m, p.sort_order), 0);
    const { error } = await supabase.from("employee_positions").insert({ name: trimmed, sort_order: maxOrder + 1 });
    setSaving(false);
    if (error) { alert(error.message); return; }
    setNewName("");
    await load();
    onChanged();
  }

  async function saveEdit(id: string) {
    const trimmed = editingName.trim();
    if (!trimmed) return;
    setSaving(true);
    const { error } = await supabase.from("employee_positions").update({ name: trimmed }).eq("id", id);
    setSaving(false);
    if (error) { alert(error.message); return; }
    setEditingId(null);
    setEditingName("");
    await load();
    onChanged();
  }

  async function deletePosition(id: string) {
    if (!confirm("Delete this position? Employees using it will keep their current position text.")) return;
    const { error } = await supabase.from("employee_positions").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    await load();
    onChanged();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Positions" description="Manage employee job positions." size="xl">
      <div className="space-y-3">
        <ul className="max-h-64 overflow-y-auto divide-y rounded-md border">
          {positions.length === 0 && (
            <li className="px-3 py-4 text-center text-muted-foreground text-xs">No positions yet.</li>
          )}
          {positions.map((pos) => (
            <li key={pos.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
              {editingId === pos.id ? (
                <>
                  <Input
                    className="h-7 flex-1 text-sm"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); void saveEdit(pos.id); }
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                  <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={() => void saveEdit(pos.id)}>Save</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium">{pos.name}</span>
                  <button
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit"
                    onClick={() => { setEditingId(pos.id); setEditingName(pos.name); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded p-1 text-destructive hover:bg-destructive/10"
                    title="Delete"
                    onClick={() => void deletePosition(pos.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={addPosition} className="flex gap-2">
          <Input
            placeholder="New position (e.g. Manager)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={saving || !newName.trim()}>
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </form>

        <div className="flex justify-end pt-1">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
}

// ── Add / Edit Employee ───────────────────────────────────────────────────
function AddEmployee({ open, onClose, positions, onSaved }: { open: boolean; onClose: () => void; positions: EmpPosition[]; onSaved: () => void }) {
  const [form, setForm] = useState<any>({
    email: "",
    password: "",
    full_name: "",
    phone: "",
    position: "",
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
            className={selectClass}
            value={form.position}
            onChange={(e) => set("position", e.target.value)}
          >
            <option value="">— Select position —</option>
            {positions.map((p) => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
          </select>
          {positions.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">No positions yet. Click <b>Positions</b> to add some.</p>
          )}
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

function EditEmployee({ open, onClose, employee, positions, onSaved }: { open: boolean; onClose: () => void; employee: P | null; positions: EmpPosition[]; onSaved: () => void }) {
  const supabase = createClient();
  const [form, setForm] = useState<any>({});
  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  useEffect(() => {
    if (!open || !employee) return;
    setForm({ ...employee, position: employee.position ?? "" });
  }, [open, employee]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await supabase
      .from("profiles")
      .update({
        full_name: form.full_name,
        phone: form.phone,
        position: form.position || null,
        role: form.role,
        active: form.active,
      })
      .eq("id", form.id);
    onClose();
    onSaved();
  }

  if (!employee) return null;

  // If employee has a position not in the current list, keep it as a legacy option
  const positionInList = positions.some((p) => p.name === form.position);
  const hasLegacy = form.position && !positionInList;

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
            value={form.position || ""}
            onChange={(e) => set("position", e.target.value)}
          >
            <option value="">— Select position —</option>
            {positions.map((p) => (
              <option key={p.id} value={p.name}>{p.name}</option>
            ))}
            {hasLegacy && <option value={form.position}>{form.position} (legacy)</option>}
          </select>
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
