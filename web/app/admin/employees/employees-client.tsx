"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { normalizeEmploymentCategory, type EmploymentCategory } from "@/lib/employment-category";
import { OnCallStaffPanel, type OnCallStaff } from "./on-call-staff-panel";
import { Camera, Eye, EyeOff, Pencil, Plus, ScanFace, Settings2, ShieldCheck, Trash2 } from "lucide-react";
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

export function EmployeesClient({
  initialPermanent,
  initialOnCall,
}: {
  initialPermanent: P[];
  initialOnCall: OnCallStaff[];
}) {
  const supabase = createClient();
  const [permanentList, setPermanentList] = useState<P[]>(initialPermanent);
  const [onCallList, setOnCallList] = useState<OnCallStaff[]>(initialOnCall);
  const [categoryTab, setCategoryTab] = useState<EmploymentCategory>("permanent");
  const [editing, setEditing] = useState<P | null>(null);
  const [adding, setAdding] = useState(false);
  const [enrollTarget, setEnrollTarget] = useState<P | null>(null);
  const [positions, setPositions] = useState<EmpPosition[]>([]);
  const [positionsMgrOpen, setPositionsMgrOpen] = useState(false);
  const [roleSettingsOpen, setRoleSettingsOpen] = useState(false);

  const counts = useMemo(
    () => ({ permanent: permanentList.length, onCall: onCallList.length }),
    [permanentList, onCallList],
  );

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
    const [{ data: profiles }, { data: onCall }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("on_call_staff").select("*").order("full_name", { ascending: true }),
    ]);
    setPermanentList(
      (profiles || []).filter(
        (row) => normalizeEmploymentCategory((row as P).employment_category) !== "on_call",
      ),
    );
    setOnCallList((onCall as OnCallStaff[]) || []);
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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-lg border bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => setCategoryTab("permanent")}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              categoryTab === "permanent"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Permanent
            <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">({counts.permanent})</span>
          </button>
          <button
            type="button"
            onClick={() => setCategoryTab("on_call")}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-colors",
              categoryTab === "on_call"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            On call
            <span className="ml-1.5 tabular-nums text-xs text-muted-foreground">({counts.onCall})</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setRoleSettingsOpen(true)}>
            <ShieldCheck className="mr-1 h-4 w-4" /> Role Settings
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPositionsMgrOpen(true)}>
            <Settings2 className="mr-1 h-4 w-4" /> Positions
          </Button>
          {categoryTab === "permanent" && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add employee
            </Button>
          )}
        </div>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        {categoryTab === "permanent"
          ? "Regular staff with login accounts — payroll, attendance, and app access."
          : "Contact directory for on-call workers — no accounts or app access."}
      </p>

      {categoryTab === "on_call" ? (
        <OnCallStaffPanel list={onCallList} positions={positions} onRefresh={refresh} />
      ) : (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {permanentList.length === 0 && (
          <p className="col-span-full rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            No permanent employees yet.
          </p>
        )}
        {permanentList.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="relative h-12 w-12 shrink-0">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt={p.full_name || "avatar"} className="h-12 w-12 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold">
                        {initials(p.full_name || p.email)}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="font-medium">{p.full_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{p.email}</div>
                    {p.phone && <div className="text-xs text-muted-foreground">{p.phone}</div>}
                  </div>
                </div>
                <button
                  onClick={() => setEditing(p)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Edit employee"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge variant="teal">Permanent</Badge>
                <Badge variant={p.role === "admin" ? "purple" : "blue"}>{p.role}</Badge>
                <Badge variant={p.active ? "green" : "red"}>{p.active ? "Active" : "Inactive"}</Badge>
                {p.position && <Badge variant="outline">{p.position}</Badge>}
              </div>

              {/* DOB & employment start */}
              {(p.date_of_birth || p.employment_start) && (
                <div className="mt-3 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  {p.date_of_birth && (
                    <div>
                      <span className="font-medium text-foreground">Born </span>
                      {new Date(p.date_of_birth).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                    </div>
                  )}
                  {p.employment_start && (
                    <div>
                      <span className="font-medium text-foreground">Since </span>
                      {new Date(p.employment_start).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" })}
                    </div>
                  )}
                </div>
              )}

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
      )}

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
function AddEmployee({
  open,
  onClose,
  positions,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  positions: EmpPosition[];
  onSaved: () => void;
}) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const emptyForm = {
    email: "",
    password: "",
    full_name: "",
    phone: "",
    position: "",
    role: "employee",
    date_of_birth: "",
    employment_start: "",
  };
  const [form, setForm] = useState<any>(emptyForm);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const res = await fetch("/api/admin/create-employee", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.email, password: form.password, full_name: form.full_name,
        phone: form.phone, position: form.position, role: form.role,
        date_of_birth: form.date_of_birth || null,
        employment_start: form.employment_start || null,
      }),
    });
    const j = await res.json();
    if (!res.ok) { setBusy(false); setErr([j.error, j.hint].filter(Boolean).join(" ") || "Failed"); return; }

    // Upload avatar if provided
    if (avatarFile && j.profileId) {
      const ext = avatarFile.name.split(".").pop();
      const path = `${j.profileId}.${ext}`;
      const { data: upData } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true });
      if (upData) {
        const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
        await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", j.profileId);
      }
    }

    setBusy(false);
    onClose();
    onSaved();
    setForm(emptyForm);
    setAvatarFile(null);
    setAvatarPreview(null);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add employee" size="lg">
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        {/* Avatar picker */}
        <div className="col-span-2 flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0">
            {avatarPreview ? (
              <img src={avatarPreview} className="h-16 w-16 rounded-full object-cover" alt="preview" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground text-lg font-semibold">
                {initials(form.full_name) || "?"}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
            >
              <Camera className="h-3 w-3" />
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Profile photo</p>
            <p>JPG, PNG or WebP · max 2 MB</p>
            {avatarFile && <p className="text-primary">{avatarFile.name}</p>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
        </div>

        <div className="col-span-2"><Label>Full name</Label><Input required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} /></div>
        <div><Label>Email</Label><Input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div><Label>Password</Label><Input type="password" required minLength={6} value={form.password} onChange={(e) => set("password", e.target.value)} /></div>
        <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div>
          <Label>Position</Label>
          <select className={selectClass} value={form.position} onChange={(e) => set("position", e.target.value)}>
            <option value="">— Select position —</option>
            {positions.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <Label>Role</Label>
          <select className={selectClass} value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="employee">Employee</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div><Label>Date of birth</Label><Input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></div>
        <div><Label>Start of employment</Label><Input type="date" value={form.employment_start} onChange={(e) => set("employment_start", e.target.value)} /></div>

        <p className="col-span-2 text-xs text-muted-foreground">
          After creating, set salary type and rate on the{" "}
          <Link href="/admin/salary" className="font-medium text-primary underline underline-offset-2">Salary</Link> page.
        </p>
        {err && <p className="col-span-2 text-sm text-destructive">{err}</p>}
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditEmployee({ open, onClose, employee, positions, onSaved }: { open: boolean; onClose: () => void; employee: P | null; positions: EmpPosition[]; onSaved: () => void }) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<any>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  useEffect(() => {
    if (!open || !employee) return;
    setForm({
      ...employee,
      position: employee.position ?? "",
      date_of_birth: employee.date_of_birth ?? "",
      employment_start: employee.employment_start ?? "",
    });
    setAvatarFile(null);
    setAvatarPreview(null);
    setNewPassword("");
    setShowPw(false);
    setPwMsg(null);
  }, [open, employee]);

  async function resetPassword() {
    if (!newPassword || newPassword.length < 6) {
      setPwMsg({ ok: false, text: "Password must be at least 6 characters." });
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    const res = await fetch("/api/admin/reset-employee-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: form.id, password: newPassword }),
    });
    const j = await res.json();
    setPwBusy(false);
    if (!res.ok) { setPwMsg({ ok: false, text: j.error || "Failed" }); return; }
    setPwMsg({ ok: true, text: "Password updated successfully." });
    setNewPassword("");
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    let avatar_url = form.avatar_url;

    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const path = `${form.id}.${ext}`;
      const { data: upData } = await supabase.storage.from("avatars").upload(path, avatarFile, { upsert: true });
      if (upData) {
        const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
        avatar_url = publicUrl;
      }
    }

    await supabase.from("profiles").update({
      full_name: form.full_name,
      phone: form.phone,
      position: form.position || null,
      role: form.role,
      active: form.active,
      date_of_birth: form.date_of_birth || null,
      employment_start: form.employment_start || null,
      avatar_url,
    }).eq("id", form.id);

    setBusy(false);
    onClose();
    onSaved();
  }

  if (!employee) return null;

  const positionInList = positions.some((p) => p.name === form.position);
  const hasLegacy = form.position && !positionInList;
  const currentAvatar = avatarPreview || form.avatar_url;

  return (
    <Dialog open={open} onClose={onClose} title="Edit Employee" size="lg">
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        {/* Avatar */}
        <div className="col-span-2 flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0">
            {currentAvatar ? (
              <img src={currentAvatar} className="h-16 w-16 rounded-full object-cover" alt="avatar" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-semibold">
                {initials(form.full_name || employee.email)}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
            >
              <Camera className="h-3 w-3" />
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Profile photo</p>
            <p>JPG, PNG or WebP · max 2 MB</p>
            {avatarFile && <p className="text-primary">{avatarFile.name}</p>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
        </div>

        <div className="col-span-2"><Label>Full name</Label><Input value={form.full_name || ""} onChange={(e) => set("full_name", e.target.value)} /></div>
        <div><Label>Phone</Label><Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} /></div>
        <div>
          <Label>Position</Label>
          <select className={selectClass} value={form.position || ""} onChange={(e) => set("position", e.target.value)}>
            <option value="">— Select position —</option>
            {positions.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
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
        <div><Label>Date of birth</Label><Input type="date" value={form.date_of_birth || ""} onChange={(e) => set("date_of_birth", e.target.value)} /></div>
        <div><Label>Start of employment</Label><Input type="date" value={form.employment_start || ""} onChange={(e) => set("employment_start", e.target.value)} /></div>

        <p className="col-span-2 text-xs text-muted-foreground">
          Salary type, rate, and allowance are edited on the{" "}
          <Link href="/admin/salary" className="font-medium text-primary underline underline-offset-2">Salary</Link> page.
        </p>

        {/* Password reset section */}
        <div className="col-span-2 rounded-lg border border-dashed p-3 space-y-2">
          <p className="text-xs font-medium text-foreground">Reset Password</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showPw ? "text" : "password"}
                placeholder="New password (min 6 chars)"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPwMsg(null); }}
                className="pr-10"
                minLength={6}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pwBusy || newPassword.length < 6}
              onClick={() => void resetPassword()}
            >
              {pwBusy ? "Saving…" : "Update"}
            </Button>
          </div>
          {pwMsg && (
            <p className={`text-xs ${pwMsg.ok ? "text-green-600 dark:text-green-400" : "text-destructive"}`}>
              {pwMsg.ok ? "✓ " : "⚠ "}{pwMsg.text}
            </p>
          )}
        </div>

        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
