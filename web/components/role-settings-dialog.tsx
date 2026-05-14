"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type FeatureKey =
  | "dashboard" | "orders" | "inventory" | "ready_made" | "reports"
  | "suppliers" | "returns" | "sales_expenses" | "finance" | "employees"
  | "attendance" | "salary" | "tasks" | "stores" | "activity_log" | "settings";

type FeaturePerm = { view: boolean; edit: boolean };
type Permissions = { all?: boolean } & Partial<Record<FeatureKey, FeaturePerm>>;

type Role = {
  id: string;
  name: string;
  is_system: boolean;
  permissions: Permissions;
};

// ── Feature definitions ────────────────────────────────────────────────────
const FEATURES: { key: FeatureKey; label: string }[] = [
  { key: "dashboard",      label: "Dashboard" },
  { key: "orders",         label: "Orders" },
  { key: "inventory",      label: "Inventory" },
  { key: "ready_made",     label: "Ready-made Inventory" },
  { key: "reports",        label: "Reports" },
  { key: "suppliers",      label: "Suppliers" },
  { key: "returns",        label: "Returns" },
  { key: "sales_expenses", label: "Sales & Expenses" },
  { key: "finance",        label: "Finance" },
  { key: "employees",      label: "Employees" },
  { key: "attendance",     label: "Attendance" },
  { key: "salary",         label: "Salary" },
  { key: "tasks",          label: "Tasks" },
  { key: "stores",         label: "Stores" },
  { key: "activity_log",   label: "Activity Log" },
  { key: "settings",       label: "Settings" },
];

const EMPTY_PERMS: Permissions = Object.fromEntries(
  FEATURES.map((f) => [f.key, { view: false, edit: false }])
) as Permissions;

function blankPerms(): Permissions {
  return JSON.parse(JSON.stringify(EMPTY_PERMS));
}

// ── Main dialog ────────────────────────────────────────────────────────────
export function RoleSettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [roles, setRoles] = useState<Role[]>([]);
  const [selected, setSelected] = useState<Role | null>(null);
  const [perms, setPerms] = useState<Permissions>(blankPerms());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [addingName, setAddingName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState("");

  async function load() {
    const { data } = await supabase
      .from("roles")
      .select("id, name, is_system, permissions")
      .order("is_system", { ascending: false })
      .order("name");
    setRoles((data as Role[]) || []);
    return (data as Role[]) || [];
  }

  useEffect(() => {
    if (open) {
      load().then((list) => {
        if (!selected && list.length > 0) selectRole(list[0], list);
      });
    }
  }, [open]);

  function selectRole(role: Role, list?: Role[]) {
    const r = (list || roles).find((x) => x.id === role.id) ?? role;
    setSelected(r);
    // Admin always shows "all access"
    if (r.permissions?.all) {
      const all: Permissions = Object.fromEntries(
        FEATURES.map((f) => [f.key, { view: true, edit: true }])
      ) as Permissions;
      setPerms(all);
    } else {
      const merged = { ...blankPerms(), ...r.permissions } as Permissions;
      setPerms(merged);
    }
    setDirty(false);
    setSaveOk(false);
  }

  function toggle(key: FeatureKey, field: "view" | "edit") {
    if (!selected || selected.permissions?.all) return;
    setPerms((prev) => {
      const cur = prev[key] ?? { view: false, edit: false };
      const next = { ...cur, [field]: !cur[field] };
      // If editing, must also have view
      if (field === "edit" && next.edit) next.view = true;
      // If removing view, also remove edit
      if (field === "view" && !next.view) next.edit = false;
      return { ...prev, [key]: next };
    });
    setDirty(true);
    setSaveOk(false);
  }

  function setAll(value: boolean) {
    if (!selected || selected.permissions?.all) return;
    setPerms(
      Object.fromEntries(FEATURES.map((f) => [f.key, { view: value, edit: value }])) as Permissions
    );
    setDirty(true);
    setSaveOk(false);
  }

  async function savePerms() {
    if (!selected || selected.permissions?.all) return;
    setSaving(true);
    const { error } = await supabase
      .from("roles")
      .update({ permissions: perms })
      .eq("id", selected.id);
    setSaving(false);
    if (error) { alert(error.message); return; }
    setSaveOk(true);
    setDirty(false);
    await load();
  }

  async function addRole(e: React.FormEvent) {
    e.preventDefault();
    const name = addingName.trim();
    if (!name) return;
    setAddErr("");
    const { error } = await supabase
      .from("roles")
      .insert({ name, is_system: false, permissions: blankPerms() });
    if (error) { setAddErr(error.message); return; }
    setAddingName("");
    setAdding(false);
    const list = await load();
    const newRole = list.find((r) => r.name === name);
    if (newRole) selectRole(newRole, list);
  }

  async function deleteRole(role: Role) {
    if (role.is_system) return;
    if (!confirm(`Delete role "${role.name}"? Employees using this role will keep their current assignment.`)) return;
    await supabase.from("roles").delete().eq("id", role.id);
    const list = await load();
    if (selected?.id === role.id) {
      if (list.length > 0) selectRole(list[0], list);
      else setSelected(null);
    }
  }

  const isAdmin = !!selected?.permissions?.all;
  const isSystem = !!selected?.is_system;

  return (
    <Dialog open={open} onClose={onClose} title="Role Settings" description="Define access permissions for each role." size="xl">
      <div className="flex gap-4 min-h-[440px]">

        {/* ── Left: role list ─────────────────────────────────────── */}
        <div className="w-44 shrink-0 flex flex-col gap-1">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Roles</p>
          {roles.map((r) => (
            <div key={r.id} className="group flex items-center gap-1">
              <button
                type="button"
                className={`flex-1 rounded-md px-2.5 py-2 text-left text-sm font-medium transition-colors
                  ${selected?.id === r.id
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground"
                  }`}
                onClick={() => selectRole(r)}
              >
                <span className="flex items-center gap-1.5 truncate">
                  {r.is_system && <Lock className="h-3 w-3 shrink-0 opacity-60" />}
                  {r.name}
                </span>
                {r.is_system && (
                  <span className={`block text-[10px] ${selected?.id === r.id ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    system
                  </span>
                )}
              </button>
              {!r.is_system && (
                <button
                  className="hidden rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:flex"
                  onClick={() => void deleteRole(r)}
                  title="Delete role"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}

          {/* Add role */}
          {adding ? (
            <form onSubmit={addRole} className="mt-1 flex flex-col gap-1.5">
              <Input
                autoFocus
                placeholder="Role name"
                value={addingName}
                onChange={(e) => setAddingName(e.target.value)}
                className="h-7 text-xs"
                onKeyDown={(e) => { if (e.key === "Escape") { setAdding(false); setAddErr(""); } }}
              />
              {addErr && <p className="text-[10px] text-destructive">{addErr}</p>}
              <div className="flex gap-1">
                <Button type="submit" size="sm" className="h-6 flex-1 text-xs">Add</Button>
                <Button type="button" size="sm" variant="outline" className="h-6 text-xs" onClick={() => { setAdding(false); setAddErr(""); }}>✕</Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              className="mt-1 flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setAdding(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Add role
            </button>
          )}
        </div>

        {/* ── Right: permissions matrix ────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {!selected ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a role to view permissions.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Role header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span className="font-semibold capitalize">{selected.name}</span>
                  {isSystem && <Badge variant="outline" className="text-[10px]">System role</Badge>}
                  {isAdmin && <Badge variant="green" className="text-[10px]">Full access</Badge>}
                </div>
                {!isAdmin && (
                  <div className="flex gap-2 text-xs">
                    <button className="text-primary hover:underline" onClick={() => setAll(true)}>Grant all</button>
                    <span className="text-muted-foreground">·</span>
                    <button className="text-destructive hover:underline" onClick={() => setAll(false)}>Revoke all</button>
                  </div>
                )}
              </div>

              {isAdmin ? (
                <div className="rounded-lg border bg-green-500/5 p-4 text-sm text-muted-foreground">
                  <CheckCircle2 className="mb-2 h-5 w-5 text-green-500" />
                  The <strong>admin</strong> role has unrestricted access to all features and cannot be modified.
                </div>
              ) : (
                <>
                  {/* Permission table */}
                  <div className="overflow-hidden rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Feature</th>
                          <th className="w-20 py-2 text-center text-xs font-semibold text-muted-foreground">View</th>
                          <th className="w-20 py-2 text-center text-xs font-semibold text-muted-foreground">Edit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {FEATURES.map((f, i) => {
                          const fp = (perms[f.key] ?? { view: false, edit: false }) as FeaturePerm;
                          return (
                            <tr key={f.key} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                              <td className="px-3 py-2 font-medium">{f.label}</td>
                              <td className="py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={fp.view}
                                  disabled={isSystem && selected.name === "employee" ? false : false}
                                  onChange={() => toggle(f.key, "view")}
                                  className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                                />
                              </td>
                              <td className="py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={fp.edit}
                                  onChange={() => toggle(f.key, "edit")}
                                  className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Save */}
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-xs text-muted-foreground">
                      {isSystem ? "System roles can have their permissions edited." : "Custom role — delete from the list on the left."}
                    </p>
                    <div className="flex items-center gap-2">
                      {saveOk && (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Saved
                        </span>
                      )}
                      <Button
                        size="sm"
                        onClick={() => void savePerms()}
                        disabled={saving || !dirty}
                      >
                        {saving ? "Saving…" : "Save permissions"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end border-t pt-3">
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
      </div>
    </Dialog>
  );
}
