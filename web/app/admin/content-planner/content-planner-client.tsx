"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Bell, CheckSquare, X, Check, ArrowRight, RotateCcw, Repeat, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { spawnNextRecurringTask, spawnNextRecurringReminder, repeatLabel } from "@/lib/task-recurrence";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ContentType = { id: string; name: string; color: string; sort_order?: number };
export type ContentStore = { id: string; name: string; sort_order?: number };

export type ContentItem = {
  id: string; title: string; platform: Platform; scheduled_at: string;
  status: Status; caption?: string | null; notes?: string | null; created_by?: string | null;
  content_type_id?: string | null;
  content_store_id?: string | null;
};

export type ReminderItem = {
  id: string; title: string; notes?: string | null; due_at?: string | null;
  priority: "low" | "medium" | "high" | "urgent"; status: "pending" | "done";
  created_by?: string | null;
  repeat_mode?: string | null;
  repeat_interval_days?: number | null;
};

export type TaskItem = {
  id: string; title: string; description?: string | null; due_date?: string | null;
  priority?: string | null; status: string;
  task_type?: string | null;
  machine_type_id?: string | null;
  repeat_mode?: string | null;
  repeat_interval_days?: number | null;
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
const TASK_STATUS_FLOW: Record<string, string> = {
  open: "in_progress",
  in_progress: "done",
};
const TASK_FORWARD_LABEL: Record<string, string> = {
  open: "Start",
  in_progress: "Mark Done",
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MAX_VISIBLE = 3;
const FALLBACK_STORE_NAMES = ["Likha. Apparel", "Mensahe. Apparel", "Padayon. Apparel", "Drips. Apparel"];

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
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}
function formatDateOnly(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday:"short", year:"numeric", month:"long", day:"numeric" });
}
function formatDateFull(iso: string) {
  return new Date(iso).toLocaleString([], { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}
function displayTime(iso: string | null | undefined) {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return formatTime(iso);
}
function toDatetimeLocal(iso: string) {
  const d = new Date(iso); const pad = (n: number) => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function getPlatform(v: Platform) { return PLATFORMS.find(p => p.value === v) ?? PLATFORMS[PLATFORMS.length-1]; }
function formatTitleWhen(dtLocal: string) {
  if (!dtLocal) return "";
  const d = new Date(dtLocal);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}
function inferStoreId(title: string, stores: ContentStore[], existingId?: string | null) {
  if (existingId && stores.some((s) => s.id === existingId)) return existingId;
  const t = title.toLowerCase();
  const found = stores.find((s) => t.startsWith(s.name.toLowerCase()) || t.includes(s.name.split(".")[0].toLowerCase()));
  return found?.id ?? stores[0]?.id ?? "";
}
function autoTitle(store: string, platform: Platform, typeName: string | null | undefined, scheduledAt: string) {
  return [store, getPlatform(platform).label, typeName || null, formatTitleWhen(scheduledAt)].filter(Boolean).join(" · ");
}

function PlatformBadge({ platform }: { platform: Platform }) {
  const p = getPlatform(platform);
  return <span className={cn("inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white leading-none", p.bg)}>{p.icon}</span>;
}

function normalizeHex(c: string | null | undefined): string {
  const t = String(c ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t.toUpperCase()}`;
  return "#64748B";
}

function hexAlpha(hex: string, alphaHex: string) {
  return `${normalizeHex(hex)}${alphaHex}`;
}

function TypeBadge({ type, size = "sm" }: { type: ContentType | null | undefined; size?: "sm" | "md" }) {
  if (!type) return null;
  const color = normalizeHex(type.color);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        size === "sm" ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-xs",
      )}
      style={{ backgroundColor: hexAlpha(color, "26"), borderColor: hexAlpha(color, "66"), color }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {type.name}
    </span>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────

type FormState = { content_store_id: string; platform: Platform; scheduled_at: string; status: Status; caption: string; notes: string; content_type_id: string; };
function blankForm(dateStr?: string, typeId = "", storeId = ""): FormState {
  const d = new Date(); const pad = (n: number) => String(n).padStart(2,"0");
  const dt = dateStr ? `${dateStr}T09:00` : `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T09:00`;
  return { content_store_id: storeId, platform:"facebook", scheduled_at:dt, status:"scheduled", caption:"", notes:"", content_type_id: typeId };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ContentPlannerClient({
  initial, initialReminders, initialTasks, initialTypes = [], typesMissing, initialStores = [], storesMissing, userId,
}: {
  initial: ContentItem[];
  initialReminders: ReminderItem[];
  initialTasks: TaskItem[];
  initialTypes?: ContentType[];
  typesMissing?: boolean;
  initialStores?: ContentStore[];
  storesMissing?: boolean;
  userId: string;
}) {
  const supabase = createClient();
  const today    = new Date();
  const todayStr = toLocalDateStr(today);

  const [items,     setItems]     = useState<ContentItem[]>(initial);
  const [reminders, setReminders] = useState<ReminderItem[]>(initialReminders);
  const [tasks,     setTasks]     = useState<TaskItem[]>(initialTasks);
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [formOpen,  setFormOpen]  = useState(false);
  const [editing,   setEditing]   = useState<ContentItem | null>(null);
  const [form,      setForm]      = useState<FormState>(blankForm(undefined, initialTypes[0]?.id ?? "", initialStores[0]?.id ?? ""));
  const [saving,    setSaving]    = useState(false);
  const [types,     setTypes]     = useState<ContentType[]>(initialTypes);
  const [stores,    setStores]    = useState<ContentStore[]>(initialStores);
  const [manageTypesOpen, setManageTypesOpen] = useState(false);
  const [manageStoresOpen, setManageStoresOpen] = useState(false);
  const [detailDay,      setDetailDay]      = useState<string | null>(null);
  const [focusedId,      setFocusedId]      = useState<string | null>(null);
  const [expandDay, setExpandDay] = useState<string | null>(null);
  const [showReminders, setShowReminders] = useState(true);
  const [showTasks,     setShowTasks]     = useState(true);
  const [actionSaving,  setActionSaving]  = useState(false);

  const TASK_SELECT = "id, title, description, due_date, priority, status, task_type, machine_type_id, repeat_mode, repeat_interval_days";

  function typeById(id: string | null | undefined) {
    if (!id) return null;
    return types.find((t) => t.id === id) ?? null;
  }
  function storeById(id: string | null | undefined) {
    if (!id) return null;
    return stores.find((s) => s.id === id) ?? null;
  }
  const storeChoices = stores.length > 0 ? stores : FALLBACK_STORE_NAMES.map((name) => ({ id: name, name }));

  async function refreshTypes() {
    const { data, error } = await supabase.from("content_types").select("id,name,color,sort_order").order("sort_order").order("name");
    if (!error) setTypes((data as ContentType[]) || []);
  }
  async function refreshStores() {
    const { data, error } = await supabase.from("content_stores").select("id,name,sort_order").order("sort_order").order("name");
    if (!error) setStores((data as ContentStore[]) || []);
  }

  // Re-fetch tasks on mount so newly created tasks appear immediately
  useEffect(() => {
    void supabase
      .from("tasks")
      .select(TASK_SELECT)
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

  function patchReminder(id: string, patch: Partial<ReminderItem>) {
    setReminders(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function patchTask(id: string, patch: Partial<TaskItem>) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }

  function openDay(dateStr: string, id?: string) {
    setDetailDay(dateStr);
    setFocusedId(id ?? null);
  }

  async function markReminderDone(r: ReminderItem) {
    if (r.status === "done") return;
    setActionSaving(true);
    const { error } = await supabase
      .from("reminders")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (!error) {
      patchReminder(r.id, { status: "done" });
      const created = await spawnNextRecurringReminder(supabase, r);
      if (created) {
        setReminders((prev) => [...prev, created as ReminderItem]);
      }
    }
    setActionSaving(false);
  }

  async function markReminderPending(r: ReminderItem) {
    if (r.status !== "done") return;
    setActionSaving(true);
    const { error } = await supabase
      .from("reminders")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (!error) patchReminder(r.id, { status: "pending" });
    setActionSaving(false);
  }

  async function forwardTask(t: TaskItem) {
    const next = TASK_STATUS_FLOW[t.status];
    if (!next) return;
    setActionSaving(true);
    const patch: Record<string, unknown> = { status: next };
    if (next === "done") patch.completed_at = new Date().toISOString();
    const { error } = await supabase.from("tasks").update(patch).eq("id", t.id);
    if (!error) {
      patchTask(t.id, { status: next });
      if (next === "done") {
        await spawnNextRecurringTask(supabase, t, []);
      }
    }
    setActionSaving(false);
  }

  async function reopenTask(t: TaskItem) {
    setActionSaving(true);
    const { error } = await supabase
      .from("tasks")
      .update({ status: "open", completed_at: null })
      .eq("id", t.id);
    if (!error) patchTask(t.id, { status: "open" });
    setActionSaving(false);
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function openAdd(dateStr?: string) { setEditing(null); setForm(blankForm(dateStr, types[0]?.id ?? "", storeChoices[0]?.id ?? "")); setFormOpen(true); }
  function openEdit(item: ContentItem, e?: React.MouseEvent) {
    e?.stopPropagation();
    setEditing(item);
    setForm({ content_store_id: inferStoreId(item.title, storeChoices, item.content_store_id), platform:item.platform, scheduled_at:toDatetimeLocal(item.scheduled_at), status:item.status, caption:item.caption??"", notes:item.notes??"", content_type_id:item.content_type_id ?? types[0]?.id ?? "" });
    setFormOpen(true);
  }
  async function handleDelete(id: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!confirm("Delete this content item?")) return;
    await supabase.from("content_schedules").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
    if (focusedId === id) {
      const remainingContent = (detailDay ? (itemsByDay.get(detailDay) ?? []) : []).filter((i) => i.id !== id);
      const rem = detailDay ? (remindersByDay.get(detailDay) ?? []) : [];
      const tsk = detailDay ? (tasksByDay.get(detailDay) ?? []) : [];
      const next = remainingContent[0]?.id ?? rem[0]?.id ?? tsk[0]?.id ?? null;
      setFocusedId(next);
      if (!next) setDetailDay(null);
    }
  }
  const selectedStoreName = storeById(form.content_store_id)?.name ?? storeChoices.find((s) => s.id === form.content_store_id)?.name ?? "";
  const generatedTitle = autoTitle(selectedStoreName, form.platform, typeById(form.content_type_id)?.name, form.scheduled_at);

  async function handleSave() {
    const title = generatedTitle.trim();
    if (!title) return;
    setSaving(true);
    const payload = {
      title,
      platform: form.platform,
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      status: form.status,
      caption: form.caption || null,
      notes: form.notes || null,
      created_by: userId,
      content_type_id: form.content_type_id || null,
      content_store_id: storesMissing ? null : (form.content_store_id || null),
    };
    const save = async (body: Record<string, unknown>) => {
      if (editing) return supabase.from("content_schedules").update(body).eq("id", editing.id).select().single();
      return supabase.from("content_schedules").insert(body).select().single();
    };
    let { data, error } = await save(payload);
    if (error && /content_store_id|content_type_id|schema cache/i.test(error.message)) {
      const { content_store_id: _s, content_type_id: _t, ...without } = payload;
      const retry = await save(without);
      data = retry.data;
      error = retry.error;
    }
    if (data) {
      const row = data as ContentItem;
      if (editing) {
        setItems(prev => prev.map(i => i.id === editing.id ? row : i));
        setFocusedId(row.id);
        setDetailDay(toLocalDateStr(new Date(row.scheduled_at)));
      } else {
        setItems(prev => [...prev, row]);
        setFocusedId(row.id);
        setDetailDay(toLocalDateStr(new Date(row.scheduled_at)));
      }
    }
    setSaving(false); setFormOpen(false);
  }
  function setF<K extends keyof FormState>(k: K, v: FormState[K]) { setForm(prev=>({...prev,[k]:v})); }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-[calc(100dvh-11rem)] items-stretch gap-4">

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
                        onClick={e => { e.stopPropagation(); openDay(dateStr, r.id); }}
                        className={cn(
                          "flex w-full items-center gap-1 rounded border border-violet-400/30 bg-violet-400/10 px-1 py-0.5 text-left text-[10px] transition-all hover:bg-violet-400/25 hover:border-violet-400/50",
                          r.status === "done" && "opacity-50",
                          focusedId === r.id && "ring-1 ring-violet-400",
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
                        onClick={e => { e.stopPropagation(); openDay(dateStr, t.id); }}
                        className={cn(
                          "flex w-full items-center gap-1 rounded border border-green-500/30 bg-green-500/10 px-1 py-0.5 text-left text-[10px] transition-all hover:bg-green-500/20 hover:border-green-500/50",
                          (t.status === "done" || t.status === "cancelled") && "opacity-50",
                          focusedId === t.id && "ring-1 ring-green-500",
                        )}
                        title={t.title}
                      >
                        <CheckSquare className={cn("h-2.5 w-2.5 shrink-0", t.status === "done" ? "text-green-500" : "text-green-400")} />
                        <span className={cn("min-w-0 flex-1 truncate text-foreground/80", (t.status === "done" || t.status === "cancelled") && "line-through")}>{t.title}</span>
                        {t.priority && <span className={cn("text-[9px] font-medium", PRIORITY_TEXT[t.priority] ?? "text-muted-foreground")}>{(t.priority ?? "").slice(0,3)}</span>}
                      </button>
                    ))}

                    {/* Content items */}
                    {visContent.map(item => {
                      const ctype = typeById(item.content_type_id);
                      const color = ctype ? normalizeHex(ctype.color) : null;
                      return (
                      <div key={item.id}
                        className={cn("flex cursor-pointer items-center gap-1 rounded border px-1 py-0.5 text-[10px] transition-all", !color && STATUS_CFG[item.status].pill, focusedId === item.id && "ring-1 ring-primary")}
                        style={color ? { borderColor: hexAlpha(color, "66"), backgroundColor: hexAlpha(color, "22"), borderLeftWidth: 3, borderLeftColor: color } : undefined}
                        onClick={e => {
                          e.stopPropagation();
                          openDay(dateStr, item.id);
                        }}
                        title={ctype ? `${ctype.name} · ${item.title}` : item.title}
                      >
                        <span className="shrink-0 font-mono text-[10px] text-foreground/80">{formatTime(item.scheduled_at)}</span>
                        <span className="min-w-0 flex-1 truncate text-foreground/80">{item.title}</span>
                        <PlatformBadge platform={item.platform} />
                      </div>
                      );
                    })}

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
          {types.map((t) => (
            <span key={t.id} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: normalizeHex(t.color) }} />
              {t.name}
            </span>
          ))}
          <span className="flex items-center gap-1"><Bell className="h-2.5 w-2.5 text-violet-400" />Reminder</span>
          <span className="flex items-center gap-1"><CheckSquare className="h-2.5 w-2.5 text-green-400" />Task</span>
        </div>
      </div>

      {/* ── Day panel — reminders, tasks, and content in one card ──── */}
      {detailDay && (() => {
        const dayItems = itemsByDay.get(detailDay) ?? [];
        const dayReminders = remindersByDay.get(detailDay) ?? [];
        const dayTasks = tasksByDay.get(detailDay) ?? [];
        const total = dayItems.length + dayReminders.length + dayTasks.length;
        const dayDate = new Date(`${detailDay}T12:00:00`);
        const dayLabel = dayDate.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });
        const counts = [
          dayReminders.length ? `${dayReminders.length} ${dayReminders.length === 1 ? "reminder" : "reminders"}` : null,
          dayTasks.length ? `${dayTasks.length} ${dayTasks.length === 1 ? "task" : "tasks"}` : null,
          dayItems.length ? `${dayItems.length} ${dayItems.length === 1 ? "post" : "posts"}` : null,
        ].filter(Boolean).join(" · ");
        return (
        <div className="flex w-80 shrink-0 flex-col self-stretch rounded-lg border border-border bg-card p-4 text-sm">
          <div className="flex shrink-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">This day</p>
              <h3 className="font-semibold leading-snug">{dayLabel}</h3>
              <p className="text-xs text-muted-foreground">{counts || "Nothing on this day"}</p>
            </div>
            <button type="button" className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => { setDetailDay(null); setFocusedId(null); }}>
              <X className="h-4 w-4" />
            </button>
          </div>
          {total === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">No reminders, tasks, or content on this day.</p>
          ) : (
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-0.5">
              {dayReminders.map((r) => {
                const focused = focusedId === r.id;
                return (
                <div
                  key={`rem-${r.id}`}
                  className={cn(
                    "rounded-lg border border-violet-400/30 p-3",
                    focused && "space-y-2 ring-1 ring-violet-400",
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-2 text-left"
                    onClick={() => setFocusedId(focused ? null : r.id)}
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-violet-400">Reminder</p>
                      <h4 className={cn("font-semibold leading-snug", r.status === "done" && "line-through opacity-60")}>{r.title}</h4>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{r.status === "done" ? "Done" : "Pending"}</p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{displayTime(r.due_at) ?? "All day"}</span>
                  </button>
                  {focused && (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        <span className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[10px] capitalize",
                          r.priority === "urgent" && "border-red-500/30 bg-red-500/10 text-red-500",
                          r.priority === "high" && "border-orange-400/30 bg-orange-400/10 text-orange-400",
                          r.priority === "medium" && "border-blue-400/30 bg-blue-400/10 text-blue-400",
                          r.priority === "low" && "border-slate-400/30 bg-slate-400/10 text-slate-400",
                        )}>
                          {PRIORITY_LABEL[r.priority] ?? r.priority} priority
                        </span>
                        <span className={cn(
                          "rounded-full border px-1.5 py-0.5 text-[10px]",
                          r.status === "done"
                            ? "border-green-500/30 bg-green-500/10 text-green-500"
                            : "border-amber-400/30 bg-amber-400/10 text-amber-500",
                        )}>
                          {r.status === "done" ? "Done" : "Pending"}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
                          <p className="font-medium text-muted-foreground">Due date</p>
                          <p className="mt-0.5">{r.due_at ? formatDateOnly(r.due_at) : "—"}</p>
                        </div>
                        <div className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
                          <p className="font-medium text-muted-foreground">Due time</p>
                          <p className="mt-0.5 font-mono">{displayTime(r.due_at) ?? "—"}</p>
                        </div>
                      </div>
                      {repeatLabel(r) && (
                        <div className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground">
                          <Repeat className="h-3.5 w-3.5 shrink-0" />
                          {repeatLabel(r)}
                        </div>
                      )}
                      <div>
                        <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">Notes</p>
                        {r.notes ? (
                          <p className="whitespace-pre-wrap rounded-md bg-muted/30 px-2.5 py-1.5 text-xs">{r.notes}</p>
                        ) : (
                          <p className="rounded-md bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">No notes</p>
                        )}
                      </div>
                      <div className="pt-0.5">
                        {r.status === "done" ? (
                          <Button size="sm" variant="outline" className="h-7 w-full gap-1 text-xs" disabled={actionSaving} onClick={() => void markReminderPending(r)}>
                            <RotateCcw className="h-3.5 w-3.5" /> Mark pending
                          </Button>
                        ) : (
                          <Button size="sm" className="h-7 w-full gap-1 text-xs" disabled={actionSaving} onClick={() => void markReminderDone(r)}>
                            <Check className="h-3.5 w-3.5" /> Done
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                );
              })}

              {dayTasks.map((t) => {
                const focused = focusedId === t.id;
                return (
                <div
                  key={`task-${t.id}`}
                  className={cn(
                    "rounded-lg border border-green-500/30 p-3",
                    focused && "space-y-2 ring-1 ring-green-500",
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-2 text-left"
                    onClick={() => setFocusedId(focused ? null : t.id)}
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-green-400">Task</p>
                      <h4 className={cn("font-semibold leading-snug", (t.status === "done" || t.status === "cancelled") && "line-through opacity-60")}>{t.title}</h4>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{TASK_STATUS_LABEL[t.status] ?? t.status}</p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{displayTime(t.due_date) ?? "All day"}</span>
                  </button>
                  {focused && (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-green-500/30 bg-green-500/10 px-1.5 py-0.5 text-[10px]">
                          {TASK_STATUS_LABEL[t.status] ?? t.status}
                        </span>
                        {t.priority && (
                          <span className={cn(
                            "rounded-full border px-1.5 py-0.5 text-[10px] capitalize",
                            t.priority === "urgent" && "border-red-500/30 bg-red-500/10 text-red-500",
                            t.priority === "high" && "border-orange-400/30 bg-orange-400/10 text-orange-400",
                            (t.priority === "medium" || t.priority === "normal") && "border-blue-400/30 bg-blue-400/10 text-blue-400",
                            t.priority === "low" && "border-slate-400/30 bg-slate-400/10 text-slate-400",
                          )}>
                            {PRIORITY_LABEL[t.priority] ?? t.priority} priority
                          </span>
                        )}
                      </div>
                      <div className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
                        <p className="font-medium text-muted-foreground">Due date</p>
                        <p className="mt-0.5">{t.due_date ? formatDateOnly(t.due_date.includes("T") ? t.due_date : `${t.due_date}T12:00:00`) : "—"}</p>
                      </div>
                      <div>
                        <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">Description</p>
                        {t.description ? (
                          <p className="whitespace-pre-wrap rounded-md bg-muted/30 px-2.5 py-1.5 text-xs">{t.description}</p>
                        ) : (
                          <p className="rounded-md bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">No description</p>
                        )}
                      </div>
                      <div className="pt-0.5">
                        {t.status === "done" || t.status === "cancelled" ? (
                          <Button size="sm" variant="outline" className="h-7 w-full gap-1 text-xs" disabled={actionSaving} onClick={() => void reopenTask(t)}>
                            <RotateCcw className="h-3.5 w-3.5" /> Reopen
                          </Button>
                        ) : (
                          <Button size="sm" className="h-7 w-full gap-1 text-xs" disabled={actionSaving} onClick={() => void forwardTask(t)}>
                            {t.status === "open" ? <ArrowRight className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                            {TASK_FORWARD_LABEL[t.status] ?? "Update"}
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                );
              })}

              {dayItems.map((item) => {
                const focused = focusedId === item.id;
                const ctype = typeById(item.content_type_id);
                const color = ctype ? normalizeHex(ctype.color) : null;
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-lg border p-3",
                      focused && "space-y-2 ring-1 ring-primary",
                    )}
                    style={color ? { borderLeftWidth: 3, borderLeftColor: color } : undefined}
                  >
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-2 text-left"
                      onClick={() => setFocusedId(focused ? null : item.id)}
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Schedule</p>
                        <h4 className="font-semibold leading-snug">{item.title}</h4>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className={cn("inline-flex items-center gap-1", item.status === "posted" && "text-emerald-500", item.status === "scheduled" && "text-teal-500")}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_CFG[item.status].dot)} />
                            {STATUS_CFG[item.status].label}
                          </span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <PlatformBadge platform={item.platform} />
                            {getPlatform(item.platform).label}
                          </span>
                          {ctype && (
                            <>
                              <span>·</span>
                              <TypeBadge type={ctype} size="sm" />
                            </>
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">{formatTime(item.scheduled_at)}</span>
                    </button>
                    {focused && (
                      <>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px]", STATUS_CFG[item.status].pill)}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_CFG[item.status].dot)} />
                            {STATUS_CFG[item.status].label}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <PlatformBadge platform={item.platform} />
                            {getPlatform(item.platform).label}
                          </span>
                          <TypeBadge type={ctype} size="sm" />
                        </div>
                        <div className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
                          <p className="font-medium text-muted-foreground">Scheduled</p>
                          <p className="mt-0.5">{formatDateFull(item.scheduled_at)}</p>
                          <p className="mt-0.5 font-mono text-muted-foreground">Time {formatTime(item.scheduled_at)}</p>
                        </div>
                        <div>
                          <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">Caption</p>
                          {item.caption ? (
                            <p className="whitespace-pre-wrap rounded-md bg-muted/30 px-2.5 py-1.5 text-xs">{item.caption}</p>
                          ) : (
                            <p className="rounded-md bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">No caption</p>
                          )}
                        </div>
                        <div>
                          <p className="mb-0.5 text-[10px] font-medium text-muted-foreground">Notes</p>
                          {item.notes ? (
                            <p className="rounded-md bg-muted/30 px-2.5 py-1.5 text-xs">{item.notes}</p>
                          ) : (
                            <p className="rounded-md bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">No notes</p>
                          )}
                        </div>
                        <div className="flex gap-2 pt-0.5">
                          <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 text-xs" onClick={() => openEdit(item)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 gap-1 text-destructive hover:bg-destructive/10" onClick={() => void handleDelete(item.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        );
      })()}

      {/* ── Add / Edit dialog ────────────────────────────────────────── */}
      <Dialog open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit content" : "Add content"}>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label>Store</Label>
              <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setManageStoresOpen(true)}>
                <Settings2 className="h-3 w-3" /> Manage stores
              </button>
            </div>
            {storesMissing && (
              <p className="mt-1 text-xs text-muted-foreground">Run migration <code className="font-mono text-foreground">108_content_stores.sql</code> in Supabase to save custom stores.</p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {storeChoices.map((store) => {
                const selected = form.content_store_id === store.id;
                return (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() => setF("content_store_id", store.id)}
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      selected ? "border-primary bg-primary/15 text-foreground ring-1 ring-primary/40" : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {store.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Title / post name</Label>
            <p className="mt-1 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm">{generatedTitle || "Select store, type, platform, and date"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">Filled automatically from store, platform, type, and date &amp; time.</p>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="cp-type">Type</Label>
              {!typesMissing && (
                <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setManageTypesOpen(true)}>
                  <Settings2 className="h-3 w-3" /> Manage types
                </button>
              )}
            </div>
            {typesMissing ? (
              <p className="mt-1 text-xs text-muted-foreground">Run migration <code className="font-mono text-foreground">107_content_types.sql</code> to enable types.</p>
            ) : (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {types.map((t) => {
                  const color = normalizeHex(t.color);
                  const selected = form.content_type_id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setF("content_type_id", t.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                        selected ? "ring-1 ring-foreground/30" : "opacity-80 hover:opacity-100",
                      )}
                      style={{ backgroundColor: hexAlpha(color, selected ? "33" : "1A"), borderColor: hexAlpha(color, selected ? "99" : "55"), color }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                      {t.name}
                    </button>
                  );
                })}
                {types.length === 0 && (
                  <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => setManageTypesOpen(true)}>
                    Add a type
                  </button>
                )}
              </div>
            )}
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
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
            <span className="font-medium">{selectedStoreName || "Store"}</span>
            <span className="text-muted-foreground">·</span>
            <TypeBadge type={typeById(form.content_type_id)} size="md" />
            <PlatformBadge platform={form.platform} />
            <span className="font-medium">{getPlatform(form.platform).label}</span>
            <span className="text-muted-foreground">·</span>
            <span className={cn("h-2 w-2 rounded-full", STATUS_CFG[form.status].dot)} />
            <span>{STATUS_CFG[form.status].label}</span>
            {form.scheduled_at && <><span className="text-muted-foreground">·</span><span>{formatTitleWhen(form.scheduled_at)}</span></>}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="button" disabled={saving || !generatedTitle.trim()} onClick={() => void handleSave()}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add to calendar"}
            </Button>
          </div>
        </div>
      </Dialog>

      <ManageTypesDialog
        open={manageTypesOpen}
        types={types}
        onClose={() => setManageTypesOpen(false)}
        onChanged={async (nextId) => {
          await refreshTypes();
          if (nextId) setF("content_type_id", nextId);
        }}
      />
      <ManageStoresDialog
        open={manageStoresOpen}
        stores={stores}
        onClose={() => setManageStoresOpen(false)}
        onChanged={async (nextId) => {
          await refreshStores();
          if (nextId) setF("content_store_id", nextId);
        }}
      />
    </div>
  );
}

const NEW_TYPE_COLORS = ["#8B5CF6", "#3B82F6", "#64748B", "#F59E0B", "#10B981", "#EF4444", "#EC4899", "#06B6D4"];

function ManageTypesDialog({
  open,
  types,
  onClose,
  onChanged,
}: {
  open: boolean;
  types: ContentType[];
  onClose: () => void;
  onChanged: (selectId?: string) => Promise<void>;
}) {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#8B5CF6");
  const [drafts, setDrafts] = useState<Record<string, { name: string; color: string }>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setColor(NEW_TYPE_COLORS[types.length % NEW_TYPE_COLORS.length]);
    setErr(null);
    const next: Record<string, { name: string; color: string }> = {};
    for (const t of types) next[t.id] = { name: t.name, color: normalizeHex(t.color) };
    setDrafts(next);
  }, [open, types]);

  async function addType(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setErr("Enter a type name."); return; }
    setBusy(true); setErr(null);
    const { data, error } = await supabase
      .from("content_types")
      .insert({ name: trimmed, color: normalizeHex(color), sort_order: types.length + 1 })
      .select("id")
      .single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setName("");
    await onChanged(data?.id);
  }

  async function saveType(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    const trimmed = draft.name.trim();
    if (!trimmed) { setErr("Type name cannot be empty."); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase
      .from("content_types")
      .update({ name: trimmed, color: normalizeHex(draft.color) })
      .eq("id", id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await onChanged();
  }

  async function removeType(t: ContentType) {
    if (!confirm(`Remove type “${t.name}”? Existing posts keep their title; the type is cleared.`)) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from("content_types").delete().eq("id", t.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await onChanged();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Manage content types" description="Add your own types and pick a color for each." size="md">
      <div className="space-y-4">
        <div className="space-y-2">
          {types.map((t) => {
            const draft = drafts[t.id] ?? { name: t.name, color: normalizeHex(t.color) };
            const dirty = draft.name.trim() !== t.name || normalizeHex(draft.color) !== normalizeHex(t.color);
            return (
              <div key={t.id} className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-8 w-8 shrink-0 cursor-pointer rounded border border-input bg-background p-0.5"
                  value={draft.color}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [t.id]: { ...draft, color: e.target.value } }))}
                  aria-label={`${t.name} color`}
                />
                <Input
                  value={draft.name}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [t.id]: { ...draft, name: e.target.value } }))}
                />
                <Button type="button" size="sm" variant="outline" disabled={!dirty || busy} onClick={() => void saveType(t.id)}>
                  Save
                </Button>
                <button
                  type="button"
                  className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void removeType(t)}
                  aria-label={`Remove ${t.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {types.length === 0 && <p className="text-sm text-muted-foreground">No types yet. Add Video, Photo, or any custom name.</p>}
        </div>

        <form onSubmit={addType} className="flex items-end gap-2 border-t pt-3">
          <div className="shrink-0">
            <Label>Color</Label>
            <input
              type="color"
              className="mt-1 block h-9 w-9 cursor-pointer rounded border border-input bg-background p-0.5"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </div>
          <div className="min-w-0 flex-1">
            <Label htmlFor="new-content-type">New type</Label>
            <Input id="new-content-type" className="mt-1" placeholder="e.g. Reel, Story…" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy || !name.trim()} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </form>
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>
    </Dialog>
  );
}

function ManageStoresDialog({
  open,
  stores,
  onClose,
  onChanged,
}: {
  open: boolean;
  stores: ContentStore[];
  onClose: () => void;
  onChanged: (selectId?: string) => Promise<void>;
}) {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName("");
    setErr(null);
    const next: Record<string, string> = {};
    for (const s of stores) next[s.id] = s.name;
    setDrafts(next);
  }, [open, stores]);

  async function addStore(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setErr("Enter a store name."); return; }
    setBusy(true); setErr(null);
    const { data, error } = await supabase
      .from("content_stores")
      .insert({ name: trimmed, sort_order: stores.length + 1 })
      .select("id")
      .single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setName("");
    await onChanged(data?.id);
  }

  async function saveStore(id: string) {
    const draft = drafts[id];
    if (draft == null) return;
    const trimmed = draft.trim();
    if (!trimmed) { setErr("Store name cannot be empty."); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.from("content_stores").update({ name: trimmed }).eq("id", id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await onChanged();
  }

  async function removeStore(s: ContentStore) {
    if (!confirm(`Remove store “${s.name}”? Existing posts keep their title; the store is cleared.`)) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from("content_stores").delete().eq("id", s.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await onChanged();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Manage stores" description="Add or rename the stores you schedule content for." size="md">
      <div className="space-y-4">
        <div className="space-y-2">
          {stores.map((s) => {
            const draft = drafts[s.id] ?? s.name;
            const dirty = draft.trim() !== s.name;
            return (
              <div key={s.id} className="flex items-center gap-2">
                <Input
                  value={draft}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))}
                />
                <Button type="button" size="sm" variant="outline" disabled={!dirty || busy} onClick={() => void saveStore(s.id)}>
                  Save
                </Button>
                <button
                  type="button"
                  className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void removeStore(s)}
                  aria-label={`Remove ${s.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
          {stores.length === 0 && <p className="text-sm text-muted-foreground">No stores yet. Add Likha. Apparel or any custom name.</p>}
        </div>

        <form onSubmit={addStore} className="flex items-end gap-2 border-t pt-3">
          <div className="min-w-0 flex-1">
            <Label htmlFor="new-content-store">New store</Label>
            <Input id="new-content-store" className="mt-1" placeholder="e.g. Likha. Apparel" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy || !name.trim()} className="gap-1">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </form>
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>
    </Dialog>
  );
}
