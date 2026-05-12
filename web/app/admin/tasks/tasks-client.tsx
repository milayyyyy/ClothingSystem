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
import { Pencil, Plus, Trash2, Users } from "lucide-react";

type T = any;
type P = { id: string; full_name: string; email: string; role: string };

const STATUSES = ["open", "in_progress", "done", "cancelled"] as const;

export function TasksClient({ userId, initial, people }: { userId: string; initial: T[]; people: P[] }) {
  const supabase = createClient();
  const [list, setList] = useState<T[]>(initial);
  const [open, setOpen] = useState(false);
  const [editTask, setEditTask] = useState<T | null>(null);

  async function refresh() {
    const { data } = await supabase.from("tasks").select("*, assignees:task_assignees(user_id, profiles:user_id(full_name, email, role))").order("created_at", { ascending: false });
    setList(data || []);
  }
  async function remove(id: string) {
    if (!confirm("Delete task?")) return;
    await supabase.from("tasks").delete().eq("id", id);
    refresh();
  }
  async function setStatus(id: string, status: string) {
    const patch: any = { status };
    if (status === "done") patch.completed_at = new Date().toISOString();
    await supabase.from("tasks").update(patch).eq("id", id);
    refresh();
  }

  return (
    <>
      <div className="mb-6 space-y-4">
        <ScheduledMaintenanceAlerts userId={userId} />
        <MachineMaintenanceReminder variant="admin" />
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> New Task</Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {list.map((t) => (
          <Card key={t.id} className="card-hover">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{t.title}</div>
                  {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    title="Edit assignees"
                    onClick={() => setEditTask(t)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={t.status === "done" ? "green" : t.status === "in_progress" ? "blue" : t.status === "cancelled" ? "red" : "amber"}>{t.status}</Badge>
                {t.priority && <Badge variant="outline">{t.priority}</Badge>}
                {t.due_date && <span className="text-muted-foreground">Due {formatDate(t.due_date)}</span>}
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="h-3.5 w-3.5" />
                <span className="truncate">
                  {(t.assignees || []).map((a: any) => a.profiles?.full_name || a.profiles?.email).join(", ") || "Unassigned"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {STATUSES.map((s) => (
                  <button key={s} onClick={() => setStatus(t.id, s)} className={"rounded-full border px-2 py-0.5 text-[11px] capitalize " + (t.status === s ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}>
                    {s.replace("_", " ")}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {list.length === 0 && <p className="text-sm text-muted-foreground">No tasks yet.</p>}
      </div>
      <NewTaskForm open={open} onClose={() => setOpen(false)} people={people} onSaved={refresh} />
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
