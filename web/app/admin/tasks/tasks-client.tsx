"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { ArrowRight, Cog, Pencil, Plus, Repeat, RotateCcw, Settings2, Trash2, Users } from "lucide-react";
import { repeatLabel, repeatFieldsForInsert, spawnNextRecurringTask, type RepeatMode } from "@/lib/task-recurrence";

type T = any;
type P = { id: string; full_name: string; email: string; role: string };
type TaskType = { id: string; name: string; sort_order: number };
type MachineType = { id: string; name: string; sort_order: number };

function isMaintenanceTaskType(taskType: string) {
  return taskType.trim().toLowerCase() === "maintenance";
}

const STATUS_FLOW: Record<string, string> = {
  open: "in_progress",
  in_progress: "done",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  done: "Done",
  cancelled: "Cancelled",
};
const STATUS_FORWARD_LABEL: Record<string, string> = {
  open: "Start",
  in_progress: "Mark Done",
};

function statusVariant(s: string) {
  if (s === "done") return "green";
  if (s === "in_progress") return "blue";
  if (s === "cancelled") return "red";
  return "amber";
}

export function TasksClient({ userId, initial, people }: { userId: string; initial: T[]; people: P[] }) {
  const supabase = createClient();
  const [list, setList] = useState<T[]>(initial);
  const [newOpen, setNewOpen] = useState(false);
  const [editTask, setEditTask] = useState<T | null>(null);
  const [forwarding, setForwarding] = useState<string | null>(null);
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [machineTypes, setMachineTypes] = useState<MachineType[]>([]);
  const [typesMgrOpen, setTypesMgrOpen] = useState(false);
  const [machinesMgrOpen, setMachinesMgrOpen] = useState(false);

  async function fetchTaskTypes() {
    const { data } = await supabase
      .from("task_types")
      .select("id, name, sort_order")
      .order("sort_order")
      .order("name");
    setTaskTypes(data || []);
  }

  async function fetchMachineTypes() {
    const { data } = await supabase
      .from("machine_types")
      .select("id, name, sort_order")
      .order("sort_order")
      .order("name");
    setMachineTypes(data || []);
  }

  useEffect(() => {
    void fetchTaskTypes();
    void fetchMachineTypes();
  }, []);

  async function refresh() {
    const { data } = await supabase
      .from("tasks")
      .select("*, machine_types(id, name), assignees:task_assignees(user_id, profiles:user_id(full_name, email, role))")
      .order("created_at", { ascending: false });
    setList(data || []);
  }

  async function remove(id: string) {
    if (!confirm("Delete task?")) return;
    await supabase.from("tasks").delete().eq("id", id);
    refresh();
  }

  async function forward(task: T) {
    const next = STATUS_FLOW[task.status];
    if (!next) return;
    setForwarding(task.id);
    const patch: any = { status: next };
    if (next === "done") patch.completed_at = new Date().toISOString();
    await supabase.from("tasks").update(patch).eq("id", task.id);
    if (next === "done") {
      const assigneeIds = (task.assignees || [])
        .map((a: any) => a.user_id)
        .filter(Boolean) as string[];
      await spawnNextRecurringTask(supabase, task, assigneeIds);
    }
    await refresh();
    setForwarding(null);
  }

  async function reopen(task: T) {
    setForwarding(task.id);
    await supabase.from("tasks").update({ status: "open", completed_at: null }).eq("id", task.id);
    await refresh();
    setForwarding(null);
  }

  async function cancel(task: T) {
    if (!confirm("Cancel this task?")) return;
    setForwarding(task.id);
    await supabase.from("tasks").update({ status: "cancelled" }).eq("id", task.id);
    await refresh();
    setForwarding(null);
  }

  // Group: active first, then done/cancelled
  const active = list.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const finished = list.filter((t) => t.status === "done" || t.status === "cancelled");

  function TaskRow({ t }: { t: T }) {
    const nextStatus = STATUS_FLOW[t.status];
    const busy = forwarding === t.id;
    const assigneeNames = (t.assignees || [])
      .map((a: any) => a.profiles?.full_name || a.profiles?.email)
      .filter(Boolean)
      .join(", ") || "Unassigned";

    return (
      <tr className="border-t hover:bg-muted/20">
        {/* Status badge */}
        <td className="w-28 px-3 py-3">
          <Badge variant={statusVariant(t.status) as any} className="text-xs">
            {STATUS_LABEL[t.status] || t.status}
          </Badge>
        </td>

        {/* Title + description */}
        <td className="py-3 pr-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-sm">{t.title}</span>
            {t.task_type && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t.task_type}</Badge>
            )}
            {t.machine_types?.name && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-700 dark:text-amber-400">
                <Cog className="mr-0.5 inline h-2.5 w-2.5" />
                {t.machine_types.name}
              </Badge>
            )}
            {repeatLabel(t) && (
              <Badge variant="outline" className="gap-0.5 text-[10px] px-1.5 py-0 text-primary">
                <Repeat className="h-2.5 w-2.5" />
                {repeatLabel(t)}
              </Badge>
            )}
          </div>
          {t.description && (
            <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{t.description}</div>
          )}
        </td>

        {/* Priority */}
        <td className="w-20 py-3 pr-3">
          {t.priority && (
            <Badge variant={t.priority === "urgent" ? "red" : t.priority === "high" ? "amber" : "outline"} className="text-xs capitalize">
              {t.priority}
            </Badge>
          )}
        </td>

        {/* Due date */}
        <td className="w-28 py-3 pr-3 text-xs text-muted-foreground">
          {t.due_date ? formatDate(t.due_date) : "—"}
        </td>

        {/* Assignees */}
        <td className="py-3 pr-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[160px]" title={assigneeNames}>{assigneeNames}</span>
          </div>
        </td>

        {/* Actions */}
        <td className="w-48 py-3 pr-3">
          <div className="flex items-center gap-1">
            {/* Forward button */}
            {nextStatus && (
              <Button
                size="sm"
                variant="default"
                className="h-7 gap-1 text-xs"
                disabled={busy}
                onClick={() => forward(t)}
              >
                {busy ? "…" : STATUS_FORWARD_LABEL[t.status]}
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
            {/* Reopen for done/cancelled */}
            {(t.status === "done" || t.status === "cancelled") && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                disabled={busy}
                onClick={() => reopen(t)}
              >
                <RotateCcw className="h-3 w-3" /> Reopen
              </Button>
            )}
            {/* Cancel for active */}
            {t.status !== "done" && t.status !== "cancelled" && (
              <button
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                title="Cancel task"
                disabled={busy}
                onClick={() => cancel(t)}
              >
                ✕
              </button>
            )}
            {/* Edit assignees */}
            <button
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Edit assignees"
              onClick={() => setEditTask(t)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {/* Delete */}
            <button
              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              title="Delete task"
              onClick={() => remove(t.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setMachinesMgrOpen(true)}>
          <Cog className="mr-1 h-4 w-4" /> Machine Types
        </Button>
        <Button variant="outline" size="sm" onClick={() => setTypesMgrOpen(true)}>
          <Settings2 className="mr-1 h-4 w-4" /> Task Types
        </Button>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> New Task
        </Button>
      </div>

      {/* Active tasks */}
      <Card className="mb-4">
        <CardContent className="p-0">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium">Status</th>
                <th className="py-2.5 text-left font-medium">Task</th>
                <th className="py-2.5 text-left font-medium">Priority</th>
                <th className="py-2.5 text-left font-medium">Due</th>
                <th className="py-2.5 text-left font-medium">Assigned to</th>
                <th className="py-2.5 pr-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {active.map((t) => <TaskRow key={t.id} t={t} />)}
              {active.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No active tasks. Click "New Task" to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Done / Cancelled */}
      {finished.length > 0 && (
        <details className="group">
          <summary className="mb-2 cursor-pointer select-none text-sm font-medium text-muted-foreground hover:text-foreground">
            Completed &amp; Cancelled ({finished.length})
          </summary>
          <Card>
            <CardContent className="p-0">
              <table className="w-full min-w-[700px] text-sm opacity-75">
                <tbody>
                  {finished.map((t) => <TaskRow key={t.id} t={t} />)}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </details>
      )}

      <MachineTypesManagerDialog
        open={machinesMgrOpen}
        onClose={() => setMachinesMgrOpen(false)}
        onChanged={fetchMachineTypes}
      />
      <TaskTypesManagerDialog
        open={typesMgrOpen}
        onClose={() => setTypesMgrOpen(false)}
        onChanged={fetchTaskTypes}
      />
      <NewTaskForm
        open={newOpen}
        onClose={() => setNewOpen(false)}
        people={people}
        taskTypes={taskTypes}
        machineTypes={machineTypes}
        onSaved={refresh}
      />
      <EditTaskAssigneesDialog
        open={!!editTask}
        task={editTask}
        people={people}
        onClose={() => setEditTask(null)}
        onSaved={refresh}
      />
    </>
  );
}

function EditTaskAssigneesDialog({
  open,
  task,
  people,
  onClose,
  onSaved,
}: {
  open: boolean;
  task: T | null;
  people: P[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !task) return;
    const ids = (task.assignees || []).map((a: any) => a.user_id).filter(Boolean) as string[];
    setSelected(ids);
  }, [open, task?.id]);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!task?.id) return;
    await supabase.from("task_assignees").delete().eq("task_id", task.id);
    if (selected.length) {
      await supabase.from("task_assignees").insert(selected.map((user_id) => ({ task_id: task.id, user_id })));
    }
    onClose();
    onSaved();
  }

  if (!task) return null;

  return (
    <Dialog open={open} onClose={onClose} title="Task assignees" description={task.title} size="xl">
      <form onSubmit={save} className="grid gap-3">
        <div>
          <Label>Assign to ({selected.length} selected)</Label>
          <div className="mt-1 max-h-48 overflow-y-auto rounded-md border">
            {people.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/30">
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                <span className="flex-1">{p.full_name || p.email}</span>
                <Badge variant="outline">{p.role.replace("_", " ")}</Badge>
              </label>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Machine Types Manager ───────────────────────────────────────────────────
function MachineTypesManagerDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = createClient();
  const [machines, setMachines] = useState<MachineType[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase.from("machine_types").select("id, name, sort_order").order("sort_order").order("name");
    setMachines(data || []);
  }

  useEffect(() => { if (open) load(); }, [open]);

  async function addMachine(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    const maxOrder = machines.reduce((m, t) => Math.max(m, t.sort_order), 0);
    const { error } = await supabase.from("machine_types").insert({ name: trimmed, sort_order: maxOrder + 1 });
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
    const { error } = await supabase.from("machine_types").update({ name: trimmed }).eq("id", id);
    setSaving(false);
    if (error) { alert(error.message); return; }
    setEditingId(null);
    setEditingName("");
    await load();
    onChanged();
  }

  async function deleteMachine(id: string) {
    if (!confirm("Delete this machine type? Maintenance tasks using it will clear the machine selection.")) return;
    const { error } = await supabase.from("machine_types").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    await load();
    onChanged();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Machine Types" description="Machines available when creating maintenance tasks." size="xl">
      <div className="space-y-3">
        <ul className="max-h-64 overflow-y-auto divide-y rounded-md border">
          {machines.length === 0 && (
            <li className="px-3 py-4 text-center text-muted-foreground text-xs">No machines yet.</li>
          )}
          {machines.map((m) => (
            <li key={m.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
              {editingId === m.id ? (
                <>
                  <Input
                    className="h-7 flex-1 text-sm"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveEdit(m.id); } if (e.key === "Escape") setEditingId(null); }}
                  />
                  <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={() => saveEdit(m.id)}>Save</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium">{m.name}</span>
                  <button
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit"
                    onClick={() => { setEditingId(m.id); setEditingName(m.name); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded p-1 text-destructive hover:bg-destructive/10"
                    title="Delete"
                    onClick={() => deleteMachine(m.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>

        <form onSubmit={addMachine} className="flex gap-2">
          <Input
            placeholder="New machine (e.g. DTF Printer #2)"
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

// ── Task Types Manager ──────────────────────────────────────────────────────
function TaskTypesManagerDialog({
  open,
  onClose,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = createClient();
  const [types, setTypes] = useState<TaskType[]>([]);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase.from("task_types").select("id, name, sort_order").order("sort_order").order("name");
    setTypes(data || []);
  }

  useEffect(() => { if (open) load(); }, [open]);

  async function addType(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    const maxOrder = types.reduce((m, t) => Math.max(m, t.sort_order), 0);
    const { error } = await supabase.from("task_types").insert({ name: trimmed, sort_order: maxOrder + 1 });
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
    const { error } = await supabase.from("task_types").update({ name: trimmed }).eq("id", id);
    setSaving(false);
    if (error) { alert(error.message); return; }
    setEditingId(null);
    setEditingName("");
    await load();
    onChanged();
  }

  async function deleteType(id: string) {
    if (!confirm("Delete this task type? Tasks using it will lose the type label.")) return;
    const { error } = await supabase.from("task_types").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    await load();
    onChanged();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Task Types" description="Manage types for categorising tasks." size="xl">
      <div className="space-y-3">
        <ul className="max-h-64 overflow-y-auto divide-y rounded-md border">
          {types.length === 0 && (
            <li className="px-3 py-4 text-center text-muted-foreground text-xs">No task types yet.</li>
          )}
          {types.map((tt) => (
            <li key={tt.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
              {editingId === tt.id ? (
                <>
                  <Input
                    className="h-7 flex-1 text-sm"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveEdit(tt.id); } if (e.key === "Escape") setEditingId(null); }}
                  />
                  <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={() => saveEdit(tt.id)}>Save</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium">{tt.name}</span>
                  <button
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit"
                    onClick={() => { setEditingId(tt.id); setEditingName(tt.name); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded p-1 text-destructive hover:bg-destructive/10"
                    title="Delete"
                    onClick={() => deleteType(tt.id)}
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
            placeholder="New type (e.g. Quality Check)"
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

// ── New Task Form ───────────────────────────────────────────────────────────
function NewTaskForm({
  open, onClose, people, taskTypes, machineTypes, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  people: P[];
  taskTypes: TaskType[];
  machineTypes: MachineType[];
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [form, setForm] = useState<any>({ title: "", description: "", task_type: "", priority: "normal", due_date: "" });
  const [machineTypeId, setMachineTypeId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatPreset, setRepeatPreset] = useState<RepeatMode>("weekly");
  const [repeatCustomDays, setRepeatCustomDays] = useState("7");

  const maintenanceSelected = isMaintenanceTaskType(form.task_type || "");

  function set(k: string, v: any) {
    setForm((f: any) => {
      const next = { ...f, [k]: v };
      if (k === "task_type" && !isMaintenanceTaskType(String(v))) {
        setMachineTypeId("");
      }
      return next;
    });
  }
  function toggle(id: string) { setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]); }

  function resetForm() {
    setForm({ title: "", description: "", task_type: "", priority: "normal", due_date: "" });
    setMachineTypeId("");
    setSelected([]);
    setRepeatEnabled(false);
    setRepeatPreset("weekly");
    setRepeatCustomDays("7");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (maintenanceSelected && !machineTypeId) {
      alert("Select which machine this maintenance task is for.");
      return;
    }
    const repeat = repeatFieldsForInsert(
      repeatEnabled,
      repeatPreset,
      Number(repeatCustomDays),
    );
    const payload = {
      ...form,
      due_date: form.due_date || null,
      task_type: form.task_type || null,
      machine_type_id: maintenanceSelected ? machineTypeId : null,
      ...repeat,
    };
    const { data: t } = await supabase.from("tasks").insert(payload).select().single();
    if (t && selected.length) {
      await supabase.from("task_assignees").insert(selected.map((user_id) => ({ task_id: t.id, user_id })));
    }
    resetForm();
    onClose(); onSaved();
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} title="New Task" description="Assign to one or more staff members for a group task." size="xl">
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>Title</Label><Input required value={form.title} onChange={(e) => set("title", e.target.value)} /></div>
        <div className="col-span-2"><Label>Description</Label><textarea className="min-h-[70px] w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
        <div>
          <Label>Task type</Label>
          <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.task_type} onChange={(e) => set("task_type", e.target.value)}>
            <option value="">— Select type —</option>
            {taskTypes.map((tt) => <option key={tt.id} value={tt.name}>{tt.name}</option>)}
          </select>
          {taskTypes.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">No types yet. Close this form and click <b>Task Types</b> to add some.</p>
          )}
        </div>
        <div>
          <Label>Priority</Label>
          <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select>
        </div>
        {maintenanceSelected && (
          <div className="col-span-2">
            <Label>Machine</Label>
            <select
              className="mt-1 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              value={machineTypeId}
              onChange={(e) => setMachineTypeId(e.target.value)}
              required
            >
              <option value="">— Select machine —</option>
              {machineTypes.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            {machineTypes.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                No machines yet. Close this form and click <b>Machine Types</b> to add some.
              </p>
            )}
          </div>
        )}
        <div className="col-span-2"><Label>Due date</Label><Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></div>
        <div className="col-span-2 rounded-lg border bg-muted/20 p-3 space-y-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={repeatEnabled}
              onChange={(e) => setRepeatEnabled(e.target.checked)}
            />
            <Repeat className="h-4 w-4 text-muted-foreground" />
            Repeat this task
          </label>
          {repeatEnabled && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Repeat every</Label>
                <select
                  className="mt-1 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                  value={repeatPreset}
                  onChange={(e) => setRepeatPreset(e.target.value as RepeatMode)}
                >
                  <option value="daily">Day</option>
                  <option value="weekly">Week</option>
                  <option value="monthly">Month</option>
                  <option value="custom">Custom (days)</option>
                </select>
              </div>
              {repeatPreset === "custom" && (
                <div>
                  <Label>Every how many days?</Label>
                  <Input
                    type="number"
                    min={1}
                    className="mt-1"
                    value={repeatCustomDays}
                    onChange={(e) => setRepeatCustomDays(e.target.value)}
                  />
                </div>
              )}
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                When marked done, a new open task is created automatically with the same details, assignees, and next due date.
              </p>
            </div>
          )}
        </div>
        <div className="col-span-2">
          <Label>Assign to ({selected.length} selected)</Label>
          <div className="mt-1 max-h-48 overflow-y-auto rounded-md border">
            {people.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/30">
                <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                <span className="flex-1">{p.full_name || p.email}</span>
                <Badge variant="outline">{p.role.replace("_", " ")}</Badge>
              </label>
            ))}
          </div>
        </div>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
          <Button type="submit">Create Task</Button>
        </div>
      </form>
    </Dialog>
  );
}
