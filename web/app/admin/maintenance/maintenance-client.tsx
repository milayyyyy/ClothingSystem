"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MAINTENANCE_SCHEDULE_SELECT,
  maintenanceAssigneeNames,
  normalizeMaintenanceScheduleRow,
  type MaintenanceScheduleRow,
} from "@/lib/maintenance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Plus, Pencil, Trash2 } from "lucide-react";

function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetimeValue(local: string): string {
  return new Date(local).toISOString();
}

function defaultRemindBeforeStart(startsLocal: string, hours: number): string {
  const d = new Date(fromLocalDatetimeValue(startsLocal));
  d.setHours(d.getHours() - hours);
  return toLocalDatetimeValue(d.toISOString());
}

type Row = MaintenanceScheduleRow;

function statusFor(row: Row, now: number): "past" | "active" | "upcoming" {
  const start = new Date(row.starts_at).getTime();
  const end = new Date(row.ends_at).getTime();
  if (now >= end) return "past";
  if (now >= start) return "active";
  return "upcoming";
}

type StaffOption = { id: string; full_name: string | null; email: string; role: string };

export function MaintenanceClient({ initial, staff }: { initial: Row[]; staff: StaffOption[] }) {
  const supabase = createClient();
  const [list, setList] = useState<Row[]>(initial);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const [machine_name, setMachineName] = useState("");
  const [title, setTitle] = useState("Scheduled maintenance");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [startsLocal, setStartsLocal] = useState("");
  const [endsLocal, setEndsLocal] = useState("");
  const [remindLocal, setRemindLocal] = useState("");

  async function refresh() {
    const { data } = await supabase
      .from("maintenance_schedules")
      .select(MAINTENANCE_SCHEDULE_SELECT)
      .order("starts_at", { ascending: false });
    setList(((data as unknown[]) || []).map(normalizeMaintenanceScheduleRow));
  }

  function openCreate() {
    setEditing(null);
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    const end = new Date(start);
    end.setHours(end.getHours() + 2);
    const remind = new Date(start);
    remind.setDate(remind.getDate() - 1);
    setMachineName("");
    setTitle("Scheduled maintenance");
    setDescription("");
    setInstructions("");
    setAssigneeIds([]);
    setStartsLocal(toLocalDatetimeValue(start.toISOString()));
    setEndsLocal(toLocalDatetimeValue(end.toISOString()));
    setRemindLocal(toLocalDatetimeValue(remind.toISOString()));
    setOpen(true);
  }

  function openEdit(row: Row) {
    setEditing(row);
    setMachineName(row.machine_name);
    setTitle(row.title);
    setDescription(row.description || "");
    setInstructions(row.instructions ?? "");
    setAssigneeIds((row.assignees || []).map((a) => a.user_id).filter(Boolean));
    setStartsLocal(toLocalDatetimeValue(row.starts_at));
    setEndsLocal(toLocalDatetimeValue(row.ends_at));
    setRemindLocal(toLocalDatetimeValue(row.remind_at));
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditing(null);
  }

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    const payload = {
      machine_name: machine_name.trim(),
      title: title.trim() || "Scheduled maintenance",
      description: description.trim() || null,
      instructions: instructions.trim() || null,
      starts_at: fromLocalDatetimeValue(startsLocal),
      ends_at: fromLocalDatetimeValue(endsLocal),
      remind_at: fromLocalDatetimeValue(remindLocal),
    };
    if (!payload.machine_name) {
      alert("Machine name is required.");
      return;
    }
    if (new Date(payload.ends_at) <= new Date(payload.starts_at)) {
      alert("End time must be after start time.");
      return;
    }

    let scheduleId: string;
    if (editing) {
      const { error } = await supabase.from("maintenance_schedules").update(payload).eq("id", editing.id);
      if (error) {
        alert(error.message);
        return;
      }
      scheduleId = editing.id;
    } else {
      const { data: created, error } = await supabase.from("maintenance_schedules").insert(payload).select("id").single();
      if (error || !created?.id) {
        alert(error?.message || "Could not create schedule.");
        return;
      }
      scheduleId = created.id;
    }

    await supabase.from("maintenance_schedule_assignees").delete().eq("schedule_id", scheduleId);
    if (assigneeIds.length) {
      const { error: ae } = await supabase
        .from("maintenance_schedule_assignees")
        .insert(assigneeIds.map((user_id) => ({ schedule_id: scheduleId, user_id })));
      if (ae) {
        alert(ae.message);
        return;
      }
    }

    closeDialog();
    refresh();
  }

  async function remove(row: Row) {
    if (!confirm("Delete this maintenance schedule? Dismissals will be removed too.")) return;
    const { error } = await supabase.from("maintenance_schedules").delete().eq("id", row.id);
    if (error) {
      alert(error.message);
      return;
    }
    refresh();
  }

  const now = Date.now();

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button type="button" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" />
          Schedule maintenance
        </Button>
      </div>

      <div className="grid gap-3">
        {list.map((row) => {
          const st = statusFor(row, now);
          const names = maintenanceAssigneeNames(row);
          return (
            <Card key={row.id}>
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{row.title}</span>
                    <Badge
                      variant={st === "active" ? "amber" : st === "upcoming" ? "blue" : "outline"}
                    >
                      {st === "active" ? "In window" : st === "upcoming" ? "Upcoming" : "Past"}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">{row.machine_name}</div>
                  {names && (
                    <div className="mt-1 text-sm text-muted-foreground">
                      Assigned: <span className="font-medium text-foreground">{names}</span>
                    </div>
                  )}
                  {row.description && <p className="mt-2 text-sm">{row.description}</p>}
                  {row.instructions?.trim() && (
                    <div className="mt-2 rounded-md border bg-muted/30 p-2 text-sm">
                      <div className="text-xs font-medium text-muted-foreground">Instructions</div>
                      <p className="mt-1 whitespace-pre-wrap">{row.instructions}</p>
                    </div>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground">
                    Window {formatDate(row.starts_at)} – {formatDate(row.ends_at)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Notifications from {formatDate(row.remind_at)} until window ends
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button type="button" variant="outline" size="icon" onClick={() => openEdit(row)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={() => remove(row)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {list.length === 0 && <p className="text-sm text-muted-foreground">No schedules yet.</p>}
      </div>

      <Dialog
        open={open}
        onClose={closeDialog}
        title={editing ? "Edit maintenance" : "Schedule maintenance"}
        description="Staff see in-app alerts from the remind time until the maintenance window ends."
        size="lg"
      >
        <div className="space-y-4 px-6 pb-6">
          <div>
            <Label htmlFor="m-machine">Machine / equipment</Label>
            <Input id="m-machine" value={machine_name} onChange={(e) => setMachineName(e.target.value)} placeholder="e.g. Heat press 2" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="m-title">Title</Label>
            <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="m-desc">Description (optional)</Label>
            <textarea
              id="m-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="What to expect, alternate equipment, etc."
            />
          </div>
          <div>
            <Label htmlFor="m-instructions">Instructions (optional)</Label>
            <textarea
              id="m-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="mt-1 min-h-[88px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Steps, tools, safety checks, or handoff notes for the person doing this maintenance."
            />
          </div>
          <div>
            <Label>Assigned to (group — optional)</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">Pick everyone responsible for this maintenance window.</p>
            <div className="mt-1 max-h-44 overflow-y-auto rounded-md border">
              {staff.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/30"
                >
                  <input type="checkbox" checked={assigneeIds.includes(p.id)} onChange={() => toggleAssignee(p.id)} />
                  <span className="flex-1">{p.full_name?.trim() || p.email}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {p.role.replace("_", " ")}
                  </Badge>
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="m-start">Starts</Label>
              <Input id="m-start" type="datetime-local" value={startsLocal} onChange={(e) => setStartsLocal(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="m-end">Ends</Label>
              <Input id="m-end" type="datetime-local" value={endsLocal} onChange={(e) => setEndsLocal(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1">
                <Label htmlFor="m-remind">Remind from (notifications start)</Label>
                <Input id="m-remind" type="datetime-local" value={remindLocal} onChange={(e) => setRemindLocal(e.target.value)} className="mt-1" />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={() => {
                  if (startsLocal) setRemindLocal(defaultRemindBeforeStart(startsLocal, 24));
                }}
              >
                24h before start
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void save()}>
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
