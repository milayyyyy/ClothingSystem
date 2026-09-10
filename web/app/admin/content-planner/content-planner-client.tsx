"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Bell, CheckSquare, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ContentItem = {
  id: string; title: string; platform: Platform; scheduled_at: string;
  status: Status; caption?: string | null; notes?: string | null; created_by?: string | null;
};

export type ReminderItem = {
  id: string; title: string; notes?: string | null; due_at?: string | null;
  priority: "low" | "medium" | "high" | "urgent"; status: "pending" | "done";
};

export type TaskItem = {
  id: string; title: string; description?: string | null; due_date?: string | null;
  priority?: string | null; status: string;
};

/** Calendar day key YYYY-MM-DD from a date or timestamp string. */
function dueDayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return toLocalDateStr(d);
}

type Platform = "facebook" | "instagram" | "tiktok" | "youtube" | "twitter" | "other";
type Status   = "draft" | "scheduled" | "posted" | "cancelled";

// ─── Config ──────────────────────────────────────────────────────────────────

const PLATFORMS: { value: Platform; label: string; bg: string; icon: string }[] = [
  { value: "facebook",  label: "Facebook",    bg: "bg-[#1877F2]", icon: "F"  },
  { value: "instagram", label: "Instagram",   bg: "bg-[#E1306C]", icon: "IG" },
  { value: "tiktok",    label: "TikTok",      bg: "bg-[#010101]", icon: "TT" },
  { value: "youtube",   label: "YouTube",     bg: "bg-[#FF0000]", icon: "YT" },
  { value: "twitter",   label: "X / Twitter", bg: "bg-[#1DA1F2]", icon: "X"  },
  { value: "other",     label: "Other",       bg: "bg-slate-500",  icon: "•"  },
];

const STATUS_CFG: Record<Status, { label: string; pill: string; dot: string }> = {
  scheduled: { label: "Scheduled", pill: "bg-teal-500/15 border-teal-500/30",       dot: "bg-teal-500"    },
  posted:    { label: "Posted",    pill: "bg-emerald-500/15 border-emerald-500/30",  dot: "bg-emerald-500" },
  draft:     { label: "Draft",     pill: "bg-amber-400/15 border-amber-400/30",      dot: "bg-amber-400"   },
  cancelled: { label: "Cancelled", pill: "bg-muted/40 border-border",                dot: "bg-muted-foreground" },
};

const PRIORITY_TEXT: Record<string, string> = {
  low: "text-slate-400", medium: "text-blue-400", high: "text-orange-400", urgent: "text-red-500",
  normal: "text-blue-400",
};
const PRIORITY_DOT: Record<string, string> = {
  low: "bg-slate-400", medium: "bg-blue-400", high: "bg-orange-400", urgent: "bg-red-500",
  normal: "bg-blue-400",
};
const PRIORITY_LABEL: Record<string, string> = {
  low: "Low", medium: "Medium", high: "High", urgent: "Urgent", normal: "Normal",
};
const TASK_STATUS_LABEL: Record<string, string> = {
  open: "Open", in_progress: "In progress", done: "Done", cancelled: "Cancelled",
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MAX_VISIBLE = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function buildGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const dow   = (first.getDay() + 6) % 7;
  const start = new Date(first); start.setDate(1 - dow);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate()+i); days.push(d); }
  return days;
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", hour12:false });
}
function formatDateOnly(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday:"short", year:"numeric", month:"long", day:"numeric" });
}
function formatDateFull(iso: string) {
  return new Date(iso).toLocaleString([], { weekday:"short", year:"numeric", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", hour12:false });
}
function toDatetimeLocal(iso: string) {
  const d = new Date(iso); const pad = (n: number) => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function getPlatform(v: Platform) { return PLATFORMS.find(p => p.value === v) ?? PLATFORMS[PLATFORMS.length-1]; }

function PlatformBadge({ platform }: { platform: Platform }) {
  const p = getPlatform(platform);
  return <span className={cn("inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white leading-none", p.bg)}>{p.icon}</span>;
}

// ─── Form state ───────────────────────────────────────────────────────────────

type FormState = { title: string; platform: Platform; scheduled_at: string; status: Status; caption: string; notes: string; };
function blankForm(dateStr?: string): FormState {
  const d = new Date(); const pad = (n: number) => String(n).padStart(2,"0");
  const dt = dateStr ? `${dateStr}T09:00` : `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T09:00`;
  return { title:"", platform:"facebook", scheduled_at:dt, status:"scheduled", caption:"", notes:"" };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ContentPlannerClient({
  initial, initialReminders, initialTasks, userId,
}: {
  initial: ContentItem[];
  initialReminders: ReminderItem[];
  initialTasks: TaskItem[];
  userId: string;
}) {
  const supabase = createClient();
  const today    = new Date();
  const todayStr = toLocalDateStr(today);

  const [items,     setItems]     = useState<ContentItem[]>(initial);
  const [reminders]               = useState<ReminderItem[]>(initialReminders);
  const [tasks,     setTasks]     = useState<TaskItem[]>(initialTasks);
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [formOpen,  setFormOpen]  = useState(false);
  const [editing,   setEditing]   = useState<ContentItem | null>(null);
  const [form,      setForm]      = useState<FormState>(blankForm());
  const [saving,    setSaving]    = useState(false);
  const [detail,         setDetail]         = useState<ContentItem | null>(null);
  const [reminderDetail, setReminderDetail] = useState<ReminderItem | null>(null);
  const [taskDetail,     setTaskDetail]     = useState<TaskItem | null>(null);
  const [expandDay, setExpandDay] = useState<string | null>(null);
  const [showReminders, setShowReminders] = useState(true);
  const [showTasks,     setShowTasks]     = useState(true);

  // Re-fetch tasks on mount so newly created tasks appear immediately
  useEffect(() => {
    void supabase
      .from("tasks")
      .select("id, title, description, due_date, priority, status")
      .order("due_date", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("content planner tasks fetch", error);
          return;
        }
        if (data) setTasks(data as TaskItem[]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Maps ──────────────────────────────────────────────────────────────────
  const grid = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const itemsByDay = useMemo(() => {
    const m = new Map<string, ContentItem[]>();
    for (const item of items) {
      const key = toLocalDateStr(new Date(item.scheduled_at));
      if (!m.has(key)) m.set(key, []); m.get(key)!.push(item);
    }
    for (const [, arr] of m) arr.sort((a,b) => a.scheduled_at.localeCompare(b.scheduled_at));
    return m;
  }, [items]);

  const remindersByDay = useMemo(() => {
    const m = new Map<string, ReminderItem[]>();
    for (const r of reminders) {
      if (!r.due_at) continue;
      const key = toLocalDateStr(new Date(r.due_at));
      if (!m.has(key)) m.set(key, []); m.get(key)!.push(r);
    }
    return m;
  }, [reminders]);

  const tasksByDay = useMemo(() => {
    const m = new Map<string, TaskItem[]>();
    for (const t of tasks) {
      const key = dueDayKey(t.due_date);
      if (!key) continue;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(t);
    }
    return m;
  }, [tasks]);

  // ── Navigation ────────────────────────────────────────────────────────────
  function prevMonth() { viewMonth === 0 ? (setViewYear(y=>y-1), setViewMonth(11)) : setViewMonth(m=>m-1); }
  function nextMonth() { viewMonth === 11 ? (setViewYear(y=>y+1), setViewMonth(0)) : setViewMonth(m=>m+1); }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function openAdd(dateStr?: string) { setEditing(null); setForm(blankForm(dateStr)); setFormOpen(true); }
  function openEdit(item: ContentItem, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditing(item);
    setForm({ title:item.title, platform:item.platform, scheduled_at:toDatetimeLocal(item.scheduled_at), status:item.status, caption:item.caption??"", notes:item.notes??"" });
    setDetail(null); setFormOpen(true);
  }
  async function handleDelete(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm("Delete this content item?")) return;
    await supabase.from("content_schedules").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
    if (detail?.id === id) setDetail(null);
  }
  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = { title:form.title.trim(), platform:form.platform, scheduled_at:new Date(form.scheduled_at).toISOString(), status:form.status, caption:form.caption||null, notes:form.notes||null, created_by:userId };
    if (editing) {
      const { data } = await supabase.from("content_schedules").update(payload).eq("id", editing.id).select().single();
      if (data) { setItems(prev => prev.map(i => i.id === editing.id ? (data as ContentItem) : i)); setDetail(data as ContentItem); }
    } else {
      const { data } = await supabase.from("content_schedules").insert(payload).select().single();
      if (data) setItems(prev => [...prev, data as ContentItem]);
    }
    setSaving(false); setFormOpen(false);
  }
  function setF<K extends keyof FormState>(k: K, v: FormState[K]) { setForm(prev=>({...prev,[k]:v})); }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-4">

      {/* ── Calendar ──────────────────────────────────────────────────── */}
      <div className="min-w-0 flex-1 space-y-3">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}>Today</Button>
            <Button variant="outline" size="sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            <h2 className="ml-2 text-lg font-semibold">{MONTHS[viewMonth]} {viewYear}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={showReminders ? "secondary" : "outline"} size="sm" className="gap-1.5" onClick={() => setShowReminders(v=>!v)}>
              <Bell className="h-3.5 w-3.5" /> Reminders
            </Button>
            <Button variant={showTasks ? "secondary" : "outline"} size="sm" className="gap-1.5" onClick={() => setShowTasks(v=>!v)} title="Only tasks with a due date appear on the calendar">
              <CheckSquare className="h-3.5 w-3.5" /> Tasks ({tasks.filter(t => !!t.due_date).length})
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => openAdd()}>
              <Plus className="h-4 w-4" /> Add content
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border bg-muted/50">
            {DAYS.map(d => <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 divide-x divide-y divide-border">
            {grid.map(day => {
              const dateStr      = toLocalDateStr(day);
              const inMonth      = day.getMonth() === viewMonth;
              const isToday      = dateStr === todayStr;
              const dayContent   = itemsByDay.get(dateStr) ?? [];
              const dayReminders = showReminders ? (remindersByDay.get(dateStr) ?? []) : [];
              const dayTasks     = showTasks     ? (tasksByDay.get(dateStr)     ?? []) : [];
              const allCount     = dayContent.length + dayReminders.length + dayTasks.length;
              const isExpanded   = expandDay === dateStr;

              // Show reminders & tasks first so they are not hidden behind content overflow
              let budget = isExpanded ? Infinity : MAX_VISIBLE;
              const visReminders = dayReminders.slice(0, budget); budget -= visReminders.length;
              const visTasks     = dayTasks.slice(0, budget);     budget -= visTasks.length;
              const visContent   = dayContent.slice(0, budget);
              const overflow     = isExpanded ? 0 : allCount - (visContent.length + visReminders.length + visTasks.length);

              return (
                <div key={dateStr}
                  className={cn("min-h-[7.5rem] cursor-pointer p-1 transition-colors hover:bg-muted/20", isToday && "bg-primary/5", !inMonth && "bg-muted/10 opacity-60")}
                  onClick={() => openAdd(dateStr)}
                >
                  <div className="mb-1 flex items-start justify-between">
                    <span className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium", isToday ? "bg-primary text-primary-foreground" : "text-foreground")}>
                      {day.getDate()}
                    </span>
                    {allCount > 0 && <span className="text-[9px] text-muted-foreground">{allCount}</span>}
                  </div>

                  <div className="space-y-0.5">
                    {/* Reminders — open side panel */}
                    {visReminders.map(r => (
                      <button
                        type="button"
                        key={`rem-${r.id}`}
                        onClick={e => { e.stopPropagation(); setDetail(null); setTaskDetail(null); setReminderDetail(r); }}
                        className={cn(
                          "flex w-full items-center gap-1 rounded border border-violet-400/30 bg-violet-400/10 px-1 py-0.5 text-left text-[10px] transition-all hover:bg-violet-400/25 hover:border-violet-400/50",
                          r.status === "done" && "opacity-50",
                          reminderDetail?.id === r.id && "ring-1 ring-violet-400",
                        )}
                        title={r.title}
                      >
                        <Bell className={cn("h-2.5 w-2.5 shrink-0", PRIORITY_TEXT[r.priority] ?? "text-violet-400")} />
                        <span className={cn("min-w-0 flex-1 truncate text-foreground/80", r.status === "done" && "line-through")}>{r.title}</span>
                        {r.due_at && <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{formatTime(r.due_at)}</span>}
                      </button>
                    ))}

                    {/* Tasks — open side panel */}
                    {visTasks.map(t => (
                      <button
                        type="button"
                        key={`task-${t.id}`}
                        onClick={e => { e.stopPropagation(); setDetail(null); setReminderDetail(null); setTaskDetail(t); }}
                        className={cn(
                          "flex w-full items-center gap-1 rounded border border-green-500/30 bg-green-500/10 px-1 py-0.5 text-left text-[10px] transition-all hover:bg-green-500/20 hover:border-green-500/50",
                          (t.status === "done" || t.status === "cancelled") && "opacity-50",
                          taskDetail?.id === t.id && "ring-1 ring-green-500",
                        )}
                        title={t.title}
                      >
                        <CheckSquare className={cn("h-2.5 w-2.5 shrink-0", t.status === "done" ? "text-green-500" : "text-green-400")} />
                        <span className={cn("min-w-0 flex-1 truncate text-foreground/80", (t.status === "done" || t.status === "cancelled") && "line-through")}>{t.title}</span>
                        {t.priority && <span className={cn("text-[9px] font-medium", PRIORITY_TEXT[t.priority] ?? "text-muted-foreground")}>{(t.priority ?? "").slice(0,3)}</span>}
                      </button>
                    ))}

                    {/* Content items */}
                    {visContent.map(item => (
                      <div key={item.id}
                        className={cn("flex cursor-pointer items-center gap-1 rounded border px-1 py-0.5 text-[10px] transition-all", STATUS_CFG[item.status].pill, detail?.id === item.id && "ring-1 ring-primary")}
                        onClick={e => { e.stopPropagation(); setReminderDetail(null); setTaskDetail(null); setDetail(item); }}
                      >
                        <span className="shrink-0 font-mono text-[10px] text-foreground/80">{formatTime(item.scheduled_at)}</span>
                        <span className="min-w-0 flex-1 truncate text-foreground/80">{item.title}</span>
                        <PlatformBadge platform={item.platform} />
                      </div>
                    ))}

                    {overflow > 0 && (
                      <button type="button" className="w-full rounded px-1 py-0.5 text-left text-[10px] text-primary hover:underline" onClick={e => { e.stopPropagation(); setExpandDay(dateStr); }}>
                        + {overflow} more
                      </button>
                    )}
                    {isExpanded && allCount > MAX_VISIBLE && (
                      <button type="button" className="w-full rounded px-1 py-0.5 text-left text-[10px] text-muted-foreground hover:underline" onClick={e => { e.stopPropagation(); setExpandDay(null); }}>
                        Show less
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          {Object.entries(STATUS_CFG).map(([k,v]) => (
            <span key={k} className="flex items-center gap-1"><span className={cn("h-2 w-2 rounded-full",v.dot)} />{v.label}</span>
          ))}
          <span className="flex items-center gap-1"><Bell className="h-2.5 w-2.5 text-violet-400" />Reminder</span>
          <span className="flex items-center gap-1"><CheckSquare className="h-2.5 w-2.5 text-green-400" />Task</span>
        </div>
      </div>

      {/* ── Content detail panel ──────────────────────────────────────── */}
      {detail && (
        <div className="w-72 shrink-0 space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug">{detail.title}</h3>
            <button type="button" className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setDetail(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={cn("flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs", STATUS_CFG[detail.status].pill)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_CFG[detail.status].dot)} />{STATUS_CFG[detail.status].label}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <PlatformBadge platform={detail.platform} />{getPlatform(detail.platform).label}
            </span>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
            <p className="font-medium text-muted-foreground">Scheduled</p>
            <p className="mt-0.5">{formatDateFull(detail.scheduled_at)}</p>
          </div>
          {detail.caption && (
            <div>
              <p className="mb-0.5 text-xs font-medium text-muted-foreground">Caption</p>
              <p className="whitespace-pre-wrap rounded-md bg-muted/30 px-3 py-2 text-xs">{detail.caption}</p>
            </div>
          )}
          {detail.notes && (
            <div>
              <p className="mb-0.5 text-xs font-medium text-muted-foreground">Notes</p>
              <p className="rounded-md bg-muted/30 px-3 py-2 text-xs">{detail.notes}</p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" className="flex-1 gap-1" onClick={() => openEdit(detail)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-destructive hover:bg-destructive/10" onClick={() => void handleDelete(detail.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Reminder detail panel ─────────────────────────────────────── */}
      {reminderDetail && (
        <div className="w-72 shrink-0 space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-violet-400">Reminder</p>
              <h3 className="font-semibold leading-snug">{reminderDetail.title}</h3>
            </div>
            <button type="button" className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setReminderDetail(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className={cn(
              "rounded-full border px-2 py-0.5 text-xs capitalize",
              reminderDetail.priority === "urgent" && "border-red-500/30 bg-red-500/10 text-red-500",
              reminderDetail.priority === "high" && "border-orange-400/30 bg-orange-400/10 text-orange-400",
              reminderDetail.priority === "medium" && "border-blue-400/30 bg-blue-400/10 text-blue-400",
              reminderDetail.priority === "low" && "border-slate-400/30 bg-slate-400/10 text-slate-400",
            )}>
              {PRIORITY_LABEL[reminderDetail.priority] ?? reminderDetail.priority} priority
            </span>
            <span className={cn(
              "rounded-full border px-2 py-0.5 text-xs",
              reminderDetail.status === "done"
                ? "border-green-500/30 bg-green-500/10 text-green-500"
                : "border-amber-400/30 bg-amber-400/10 text-amber-500",
            )}>
              {reminderDetail.status === "done" ? "Done" : "Pending"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
              <p className="font-medium text-muted-foreground">Due date</p>
              <p className="mt-0.5">{reminderDetail.due_at ? formatDateOnly(reminderDetail.due_at) : "—"}</p>
            </div>
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
              <p className="font-medium text-muted-foreground">Due time</p>
              <p className="mt-0.5 font-mono">{reminderDetail.due_at ? formatTime(reminderDetail.due_at) : "—"}</p>
            </div>
          </div>

          <div>
            <p className="mb-0.5 text-xs font-medium text-muted-foreground">Notes</p>
            {reminderDetail.notes ? (
              <p className="whitespace-pre-wrap rounded-md bg-muted/30 px-3 py-2 text-xs">{reminderDetail.notes}</p>
            ) : (
              <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">No notes</p>
            )}
          </div>
        </div>
      )}

      {/* ── Task detail panel ─────────────────────────────────────────── */}
      {taskDetail && (
        <div className="w-72 shrink-0 space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-green-400">Task</p>
              <h3 className="font-semibold leading-snug">{taskDetail.title}</h3>
            </div>
            <button type="button" className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setTaskDetail(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs">
              {TASK_STATUS_LABEL[taskDetail.status] ?? taskDetail.status}
            </span>
            {taskDetail.priority && (
              <span className={cn(
                "rounded-full border px-2 py-0.5 text-xs capitalize",
                taskDetail.priority === "urgent" && "border-red-500/30 bg-red-500/10 text-red-500",
                taskDetail.priority === "high" && "border-orange-400/30 bg-orange-400/10 text-orange-400",
                (taskDetail.priority === "medium" || taskDetail.priority === "normal") && "border-blue-400/30 bg-blue-400/10 text-blue-400",
                taskDetail.priority === "low" && "border-slate-400/30 bg-slate-400/10 text-slate-400",
              )}>
                {PRIORITY_LABEL[taskDetail.priority] ?? taskDetail.priority} priority
              </span>
            )}
          </div>

          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
            <p className="font-medium text-muted-foreground">Due date</p>
            <p className="mt-0.5">{taskDetail.due_date ? formatDateOnly(taskDetail.due_date.includes("T") ? taskDetail.due_date : `${taskDetail.due_date}T12:00:00`) : "—"}</p>
          </div>

          <div>
            <p className="mb-0.5 text-xs font-medium text-muted-foreground">Description</p>
            {taskDetail.description ? (
              <p className="whitespace-pre-wrap rounded-md bg-muted/30 px-3 py-2 text-xs">{taskDetail.description}</p>
            ) : (
              <p className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">No description</p>
            )}
          </div>
        </div>
      )}

      {/* ── Add / Edit dialog ────────────────────────────────────────── */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit content" : "Add content"}>
        <div className="space-y-4">
          <div>
            <Label htmlFor="cp-title">Title / post name</Label>
            <Input id="cp-title" className="mt-1" placeholder="e.g. Summer sale promo" value={form.title} onChange={e => setF("title", e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cp-platform">Platform</Label>
              <select id="cp-platform" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm" value={form.platform} onChange={e => setF("platform", e.target.value as Platform)}>
                {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="cp-status">Status</Label>
              <select id="cp-status" className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm" value={form.status} onChange={e => setF("status", e.target.value as Status)}>
                {Object.entries(STATUS_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="cp-dt">Date &amp; time</Label>
            <Input id="cp-dt" type="datetime-local" className="mt-1" value={form.scheduled_at} onChange={e => setF("scheduled_at", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cp-caption">Caption <span className="text-muted-foreground">(optional)</span></Label>
            <textarea id="cp-caption" className="mt-1 flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" placeholder="Post caption…" value={form.caption} onChange={e => setF("caption", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="cp-notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="cp-notes" className="mt-1" placeholder="Internal notes…" value={form.notes} onChange={e => setF("notes", e.target.value)} />
          </div>
          <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
            <PlatformBadge platform={form.platform} />
            <span className="font-medium">{getPlatform(form.platform).label}</span>
            <span className="text-muted-foreground">·</span>
            <span className={cn("h-2 w-2 rounded-full", STATUS_CFG[form.status].dot)} />
            <span>{STATUS_CFG[form.status].label}</span>
            {form.scheduled_at && <><span className="text-muted-foreground">·</span><span>{new Date(form.scheduled_at).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</span></>}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="button" disabled={saving || !form.title.trim()} onClick={() => void handleSave()}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add to calendar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
