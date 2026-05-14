"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MachineMaintenanceReminder } from "@/components/machine-maintenance-reminder";
import { ScheduledMaintenanceAlerts } from "@/components/scheduled-maintenance-alerts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { ArrowRight, Pencil, Plus, RotateCcw, Trash2, Users } from "lucide-react";

type T = any;
type P = { id: string; full_name: string; email: string; role: string };

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

  async function refresh() {
    const { data } = await supabase
      .from("tasks")
      .select("*, assignees:task_assignees(user_id, profiles:user_id(full_name, email, role))")
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
          <div className="font-medium text-sm">{t.title}</div>
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
      <div className="mb-4 space-y-4">
        <ScheduledMaintenanceAlerts userId={userId} />
        <MachineMaintenanceReminder variant="admin" />
        <div className="flex justify-end">
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Task
          </Button>
        </div>
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

      <NewTaskForm open={newOpen} onClose={() => setNewOpen(false)} people={people} onSaved={refresh} />
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

function NewTaskForm({ open, onClose, people, onSaved }: { open: boolean; onClose: () => void; people: P[]; onSaved: () => void }) {
  const supabase = createClient();
  const [form, setForm] = useState<any>({ title: "", description: "", priority: "normal", due_date: "" });
  const [selected, setSelected] = useState<string[]>([]);
  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }
  function toggle(id: string) { setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]); }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form, due_date: form.due_date || null };
    const { data: t } = await supabase.from("tasks").insert(payload).select().single();
    if (t && selected.length) {
      await supabase.from("task_assignees").insert(selected.map((user_id) => ({ task_id: t.id, user_id })));
    }
    setForm({ title: "", description: "", priority: "normal", due_date: "" });
    setSelected([]);
    onClose(); onSaved();
  }

  return (
    <Dialog open={open} onClose={onClose} title="New Task" description="Assign to one or more staff members for a group task." size="xl">
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><Label>Title</Label><Input required value={form.title} onChange={(e) => set("title", e.target.value)} /></div>
        <div className="col-span-2"><Label>Description</Label><textarea className="min-h-[70px] w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
        <div><Label>Priority</Label>
          <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.priority} onChange={(e) => set("priority", e.target.value)}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select>
        </div>
        <div><Label>Due date</Label><Input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></div>
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
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Create Task</Button>
        </div>
      </form>
    </Dialog>
  );
}
