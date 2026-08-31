"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  AlarmClock,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useConfirmAction } from "@/components/confirm-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Priority = "low" | "medium" | "high" | "urgent";
type Status   = "pending" | "done";

type Reminder = {
  id: string;
  title: string;
  notes: string | null;
  due_at: string | null;
  priority: Priority;
  status: Status;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type FormState = {
  title: string;
  notes: string;
  due_date: string;  // "YYYY-MM-DD"
  due_time: string;  // "HH:MM" or ""
  priority: Priority;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function startOfDay(d: Date) {
  const c = new Date(d); c.setHours(0,0,0,0); return c;
}
function endOfDay(d: Date) {
  const c = new Date(d); c.setHours(23,59,59,999); return c;
}

function isOverdue(r: Reminder) {
  if (r.status === "done" || !r.due_at) return false;
  return new Date(r.due_at) < startOfDay(new Date());
}
function isDueToday(r: Reminder) {
  if (r.status === "done" || !r.due_at) return false;
  const d = new Date(r.due_at);
  return d >= startOfDay(new Date()) && d <= endOfDay(new Date());
}
function isUpcoming(r: Reminder) {
  if (r.status === "done") return false;
  if (!r.due_at) return true; // no due date → upcoming
  return new Date(r.due_at) > endOfDay(new Date());
}

function dueDateLabel(due_at: string | null): { text: string; overdue: boolean } {
  if (!due_at) return { text: "No due date", overdue: false };
  const d     = new Date(due_at);
  const now   = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffMins  = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays  = Math.floor(diffMs / 86_400_000);

  if (diffMins < 0) {
    const abs = Math.abs(diffMins);
    if (abs < 60)  return { text: `${abs}m overdue`,              overdue: true };
    if (abs < 1440) return { text: `${Math.abs(diffHours)}h overdue`, overdue: true };
    return { text: `${Math.abs(diffDays)}d overdue`,              overdue: true };
  }
  if (diffMins < 60)  return { text: `Due in ${diffMins}m`,    overdue: false };
  if (diffHours < 24) return { text: `Due in ${diffHours}h`,   overdue: false };
  if (diffDays === 0) return { text: "Due today",               overdue: false };
  if (diffDays === 1) return { text: "Due tomorrow",            overdue: false };
  if (diffDays <  7)  return { text: `Due in ${diffDays} days`, overdue: false };
  return { text: `Due ${d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined })}`, overdue: false };
}

function fmtDueAt(due_at: string | null): string {
  if (!due_at) return "";
  const d = new Date(due_at);
  const date = d.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const mins = d.getMinutes();
  const hasTime = !(d.getHours() === 0 && mins === 0 && d.getSeconds() === 0);
  if (!hasTime) return date;
  return `${date} · ${d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}`;
}

const PRIORITY_META: Record<Priority, { label: string; color: string; border: string; badge: "red" | "amber" | "blue" | "default" }> = {
  urgent: { label: "Urgent", color: "text-destructive",  border: "border-l-destructive",    badge: "red" },
  high:   { label: "High",   color: "text-amber-600",    border: "border-l-amber-500",       badge: "amber" },
  medium: { label: "Medium", color: "text-blue-600",     border: "border-l-blue-500",        badge: "blue" },
  low:    { label: "Low",    color: "text-muted-foreground", border: "border-l-border",      badge: "default" },
};

type FilterTab = "all" | "today" | "overdue" | "upcoming" | "done";

const EMPTY_FORM: FormState = {
  title: "", notes: "", due_date: "", due_time: "", priority: "medium",
};

// ---------------------------------------------------------------------------
// ReminderCard
// ---------------------------------------------------------------------------
function ReminderCard({
  r,
  onToggle,
  onEdit,
  onDelete,
}: {
  r: Reminder;
  onToggle: (id: string, next: Status) => void;
  onEdit: (r: Reminder) => void;
  onDelete: (id: Reminder) => void;
}) {
  const meta   = PRIORITY_META[r.priority];
  const dueInfo = dueDateLabel(r.due_at);
  const done   = r.status === "done";

  return (
    <div
      className={cn(
        "group rounded-lg border border-l-4 bg-card shadow-sm transition-opacity",
        done ? "border-l-border opacity-60" : meta.border,
      )}
    >
      <div className="flex items-start gap-3 p-4">
        {/* Done toggle */}
        <button
          type="button"
          onClick={() => onToggle(r.id, done ? "pending" : "done")}
          className={cn(
            "mt-0.5 shrink-0 rounded-full transition-colors",
            done
              ? "text-green-600 hover:text-muted-foreground"
              : "text-muted-foreground/50 hover:text-green-600",
          )}
          title={done ? "Mark as pending" : "Mark as done"}
        >
          {done
            ? <CheckCircle2 className="h-5 w-5" />
            : <Circle       className="h-5 w-5" />}
        </button>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-2">
            <h3 className={cn("text-sm font-semibold leading-snug", done && "line-through text-muted-foreground")}>
              {r.title}
            </h3>
            <Badge
              variant={meta.badge as any}
              className="text-[10px] py-0 px-1.5 h-4"
            >
              {meta.label}
            </Badge>
          </div>

          {r.notes && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground leading-relaxed">
              {r.notes}
            </p>
          )}

          {r.due_at && (
            <div className={cn(
              "mt-2 flex items-center gap-1.5 text-[11px] font-medium",
              dueInfo.overdue && !done ? "text-destructive" : "text-muted-foreground",
            )}>
              <Clock className="h-3 w-3 shrink-0" />
              <span>{fmtDueAt(r.due_at)}</span>
              <span className="text-muted-foreground/60">·</span>
              <span>{dueInfo.text}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onEdit(r)}
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(r)}
            className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------
function Section({
  title,
  icon,
  items,
  emptyText,
  defaultCollapsed = false,
  headerClass,
  onToggle, onEdit, onDelete,
}: {
  title: string;
  icon: React.ReactNode;
  items: Reminder[];
  emptyText?: string;
  defaultCollapsed?: boolean;
  headerClass?: string;
  onToggle: (id: string, next: Status) => void;
  onEdit: (r: Reminder) => void;
  onDelete: (r: Reminder) => void;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (items.length === 0 && !emptyText) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-muted/40",
          headerClass ?? "text-muted-foreground",
        )}
      >
        <span className="flex items-center gap-1.5">{icon} {title}</span>
        <span className="ml-1 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium">
          {items.length}
        </span>
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", collapsed ? "-rotate-90" : "")} />
      </button>

      {!collapsed && (
        <div className="mt-2 space-y-2">
          {items.length === 0 && emptyText && (
            <p className="py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
          )}
          {items.map((r) => (
            <ReminderCard
              key={r.id}
              r={r}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function RemindersClient({
  initial,
  userId,
}: {
  initial: Reminder[];
  userId: string;
}) {
  const supabase = createClient();
  const { ask, dialog: confirmDialog } = useConfirmAction();

  const [reminders, setReminders] = useState<Reminder[]>(initial);
  const [saving,    setSaving]    = useState(false);
  const [open,      setOpen]      = useState(false);
  const [editing,   setEditing]   = useState<Reminder | null>(null);
  const [form,      setForm]      = useState<FormState>(EMPTY_FORM);
  const [tab,       setTab]       = useState<FilterTab>("all");
  const [priFilter, setPriFilter] = useState<Priority | "">("");
  const [doneOpen,  setDoneOpen]  = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from("reminders")
      .select("id, title, notes, due_at, priority, status, created_by, created_at, updated_at")
      .order("due_at", { ascending: true, nullsFirst: false });
    setReminders(data || []);
  }, [supabase]);

  // Stats
  const stats = useMemo(() => ({
    pending:  reminders.filter((r) => r.status === "pending").length,
    overdue:  reminders.filter((r) => isOverdue(r)).length,
    dueToday: reminders.filter((r) => isDueToday(r)).length,
    done:     reminders.filter((r) => r.status === "done").length,
  }), [reminders]);

  // Filtered + grouped
  const filtered = useMemo(() => {
    let list = reminders;
    if (priFilter) list = list.filter((r) => r.priority === priFilter);
    switch (tab) {
      case "today":    list = list.filter((r) => isDueToday(r)); break;
      case "overdue":  list = list.filter((r) => isOverdue(r));  break;
      case "upcoming": list = list.filter((r) => isUpcoming(r)); break;
      case "done":     list = list.filter((r) => r.status === "done"); break;
      default:         list = list.filter((r) => r.status === "pending"); break;
    }
    return list;
  }, [reminders, tab, priFilter]);

  const grouped = useMemo(() => {
    if (tab !== "all") return { overdue: [], today: [], upcoming: [], done: [] };
    return {
      overdue:  filtered.filter(isOverdue),
      today:    filtered.filter(isDueToday),
      upcoming: filtered.filter(isUpcoming),
      done:     [],
    };
  }, [filtered, tab]);

  const doneSorted = useMemo(
    () => reminders
      .filter((r) => r.status === "done" && (!priFilter || r.priority === priFilter))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [reminders, priFilter],
  );

  // Open dialog helpers
  function openNew() {
    const today = new Date().toISOString().slice(0, 10);
    setForm({ ...EMPTY_FORM, due_date: today });
    setEditing(null);
    setOpen(true);
  }
  function openEdit(r: Reminder) {
    const due = r.due_at ? new Date(r.due_at) : null;
    setForm({
      title:    r.title,
      notes:    r.notes ?? "",
      due_date: due ? due.toISOString().slice(0, 10) : "",
      due_time: due && !(due.getHours() === 0 && due.getMinutes() === 0)
        ? `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`
        : "",
      priority: r.priority,
    });
    setEditing(r);
    setOpen(true);
  }

  async function saveReminder(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);

    let due_at: string | null = null;
    if (form.due_date) {
      const [y, mo, d] = form.due_date.split("-").map(Number);
      const [h, mi]    = form.due_time ? form.due_time.split(":").map(Number) : [0, 0];
      due_at = new Date(y!, mo! - 1, d!, h!, mi!).toISOString();
    }

    const payload = {
      title:    form.title.trim(),
      notes:    form.notes.trim() || null,
      due_at,
      priority: form.priority,
      updated_at: new Date().toISOString(),
    };

    if (editing) {
      await supabase.from("reminders").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("reminders").insert({ ...payload, status: "pending", created_by: userId });
    }

    setOpen(false);
    await refresh();
    setSaving(false);
  }

  async function toggleDone(id: string, next: Status) {
    await supabase.from("reminders").update({ status: next, updated_at: new Date().toISOString() }).eq("id", id);
    setReminders((prev) => prev.map((r) => r.id === id ? { ...r, status: next } : r));
  }

  function deleteReminder(r: Reminder) {
    ask({
      title: "Delete reminder?",
      description: `Remove "${r.title}"? This cannot be undone.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        await supabase.from("reminders").delete().eq("id", r.id);
        await refresh();
      },
    });
  }

  const tabConfig: { key: FilterTab; label: string; count?: number }[] = [
    { key: "all",      label: "All pending", count: stats.pending },
    { key: "today",    label: "Today",       count: stats.dueToday },
    { key: "overdue",  label: "Overdue",     count: stats.overdue },
    { key: "upcoming", label: "Upcoming" },
    { key: "done",     label: "Done",        count: stats.done },
  ];

  const PRIORITIES: { key: Priority; label: string }[] = [
    { key: "urgent", label: "Urgent" },
    { key: "high",   label: "High" },
    { key: "medium", label: "Medium" },
    { key: "low",    label: "Low" },
  ];

  return (
    <>
      {confirmDialog}

      {/* ── Stats ───────────────────────────────────────────────────── */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: <BellRing className="h-4 w-4" />,    label: "Pending",   value: stats.pending,  cls: "" },
          { icon: <AlarmClock className="h-4 w-4" />,  label: "Overdue",   value: stats.overdue,  cls: stats.overdue > 0 ? "text-destructive" : "" },
          { icon: <CalendarClock className="h-4 w-4" />,label: "Due today", value: stats.dueToday, cls: stats.dueToday > 0 ? "text-amber-600" : "" },
          { icon: <Check className="h-4 w-4" />,       label: "Done",      value: stats.done,     cls: "text-green-600" },
        ].map(({ icon, label, value, cls }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={cn("rounded-lg border p-2 text-muted-foreground", cls)}>{icon}</div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn("text-2xl font-bold", cls)}>{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Filter tabs */}
        <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-1">
          {tabConfig.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {count !== undefined && count > 0 && (
                <span className={cn(
                  "rounded-full px-1.5 py-px text-[10px] font-semibold",
                  key === "overdue"  ? "bg-destructive/15 text-destructive" :
                  key === "today"    ? "bg-amber-500/15 text-amber-700" :
                  key === "done"     ? "bg-green-500/15 text-green-700" :
                  "bg-primary/10 text-primary",
                )}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Priority filter chips */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPriFilter("")}
              className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                !priFilter ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
            >All</button>
            {PRIORITIES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPriFilter(priFilter === p.key ? "" : p.key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  priFilter === p.key
                    ? cn(PRIORITY_META[p.key].color, "border-current bg-current/10")
                    : "text-muted-foreground hover:bg-muted",
                )}
              >{p.label}</button>
            ))}
          </div>

          <Button size="sm" onClick={openNew} className="h-8 gap-1">
            <Plus className="h-4 w-4" /> New Reminder
          </Button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────── */}
      {tab === "all" ? (
        <div className="space-y-6">
          <Section
            title="Overdue"
            icon={<AlarmClock className="h-3.5 w-3.5 text-destructive" />}
            items={grouped.overdue}
            headerClass="text-destructive"
            onToggle={toggleDone} onEdit={openEdit} onDelete={deleteReminder}
          />
          <Section
            title="Today"
            icon={<CalendarClock className="h-3.5 w-3.5 text-amber-600" />}
            items={grouped.today}
            headerClass="text-amber-600"
            onToggle={toggleDone} onEdit={openEdit} onDelete={deleteReminder}
          />
          <Section
            title="Upcoming"
            icon={<BellRing className="h-3.5 w-3.5" />}
            items={grouped.upcoming}
            onToggle={toggleDone} onEdit={openEdit} onDelete={deleteReminder}
          />

          {/* Done section at bottom */}
          {doneSorted.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setDoneOpen((v) => !v)}
                className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/40"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                <span className="text-green-600">Done</span>
                <span className="ml-1 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium">{doneSorted.length}</span>
                <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", !doneOpen ? "-rotate-90" : "")} />
              </button>
              {doneOpen && (
                <div className="mt-2 space-y-2">
                  {doneSorted.map((r) => (
                    <ReminderCard key={r.id} r={r} onToggle={toggleDone} onEdit={openEdit} onDelete={deleteReminder} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {grouped.overdue.length === 0 && grouped.today.length === 0 && grouped.upcoming.length === 0 && doneSorted.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <BellRing className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No reminders yet</p>
              <p className="text-xs text-muted-foreground/70">Click <strong>New Reminder</strong> to create one.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <BellRing className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No reminders in this view.</p>
            </div>
          ) : (
            filtered.map((r) => (
              <ReminderCard key={r.id} r={r} onToggle={toggleDone} onEdit={openEdit} onDelete={deleteReminder} />
            ))
          )}
        </div>
      )}

      {/* ── Add / Edit Dialog ───────────────────────────────────────── */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Reminder" : "New Reminder"}
        size="md"
      >
        <form onSubmit={saveReminder} className="grid gap-4">
          {/* Title */}
          <div>
            <Label htmlFor="rm-title">Title <span className="text-destructive">*</span></Label>
            <Input
              id="rm-title"
              required
              autoFocus
              className="mt-1"
              placeholder="What do you need to remember?"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="rm-notes">Notes</Label>
            <textarea
              id="rm-notes"
              rows={3}
              className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Additional details or instructions…"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {/* Due date + time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rm-date">Due date</Label>
              <Input
                id="rm-date"
                type="date"
                className="mt-1"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="rm-time">Due time <span className="text-muted-foreground text-[10px]">(optional)</span></Label>
              <Input
                id="rm-time"
                type="time"
                className="mt-1"
                value={form.due_time}
                onChange={(e) => setForm((f) => ({ ...f, due_time: e.target.value }))}
              />
            </div>
          </div>

          {/* Priority */}
          <div>
            <Label>Priority</Label>
            <div className="mt-2 flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, priority: p.key }))}
                  className={cn(
                    "flex-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                    form.priority === p.key
                      ? cn(PRIORITY_META[p.key].color, "border-current bg-current/10")
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Create reminder"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
