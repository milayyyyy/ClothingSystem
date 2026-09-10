"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ContentItem = {
  id: string;
  title: string;
  platform: Platform;
  scheduled_at: string;
  status: Status;
  caption?: string | null;
  notes?: string | null;
  created_by?: string | null;
};

type Platform = "facebook" | "instagram" | "tiktok" | "youtube" | "twitter" | "other";
type Status   = "draft" | "scheduled" | "posted" | "cancelled";

// ─── Platform config ─────────────────────────────────────────────────────────

const PLATFORMS: { value: Platform; label: string; color: string; bg: string; icon: string }[] = [
  { value: "facebook",  label: "Facebook",  color: "text-[#1877F2]", bg: "bg-[#1877F2]", icon: "f" },
  { value: "instagram", label: "Instagram", color: "text-[#E1306C]", bg: "bg-[#E1306C]", icon: "ig" },
  { value: "tiktok",    label: "TikTok",    color: "text-[#010101] dark:text-white", bg: "bg-[#010101]", icon: "tt" },
  { value: "youtube",   label: "YouTube",   color: "text-[#FF0000]", bg: "bg-[#FF0000]", icon: "yt" },
  { value: "twitter",   label: "X / Twitter", color: "text-[#1DA1F2]", bg: "bg-[#1DA1F2]", icon: "x" },
  { value: "other",     label: "Other",     color: "text-muted-foreground", bg: "bg-muted-foreground", icon: "•" },
];

const STATUS_CONFIG: Record<Status, { label: string; itemBg: string; dotColor: string }> = {
  scheduled: { label: "Scheduled", itemBg: "bg-teal-500/15 border-teal-500/30",    dotColor: "bg-teal-500" },
  posted:    { label: "Posted",    itemBg: "bg-emerald-500/15 border-emerald-500/30", dotColor: "bg-emerald-500" },
  draft:     { label: "Draft",     itemBg: "bg-amber-400/15 border-amber-400/30",  dotColor: "bg-amber-400" },
  cancelled: { label: "Cancelled", itemBg: "bg-muted/40 border-border",            dotColor: "bg-muted-foreground" },
};

function getPlatform(value: Platform) {
  return PLATFORMS.find((p) => p.value === value) ?? PLATFORMS[PLATFORMS.length - 1];
}

// ─── Platform icon pill ───────────────────────────────────────────────────────

function PlatformDot({ platform }: { platform: Platform }) {
  const p = getPlatform(platform);
  return (
    <span className={cn("inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold uppercase leading-none text-white", p.bg)}>
      {p.icon}
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1);
}

/** Returns ISO date string YYYY-MM-DD for a JS Date in local time */
function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Build 6-week grid starting from Monday before/on the 1st of the month */
function buildGrid(year: number, month: number) {
  const first = startOfMonth(year, month);
  // JS: 0=Sun → shift to Mon-based: Mon=0…Sun=6
  const dow = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(1 - dow);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

const MAX_VISIBLE = 3;

type FormState = {
  title: string;
  platform: Platform;
  scheduled_at: string; // datetime-local value
  status: Status;
  caption: string;
  notes: string;
};

function blankForm(dateStr?: string): FormState {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const defaultDt = dateStr
    ? `${dateStr}T09:00`
    : `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T09:00`;
  return { title: "", platform: "facebook", scheduled_at: defaultDt, status: "scheduled", caption: "", notes: "" };
}

export function ContentPlannerClient({ initial, userId }: { initial: ContentItem[]; userId: string }) {
  const supabase = createClient();
  const today = new Date();

  const [items, setItems] = useState<ContentItem[]>(initial);
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-based
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [form, setForm] = useState<FormState>(blankForm());
  const [saving, setSaving] = useState(false);
  const [expandDay, setExpandDay] = useState<string | null>(null); // dateStr for "+N more" expand

  // ── Calendar grid ──────────────────────────────────────────────────────────
  const grid = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    for (const item of items) {
      const key = toLocalDateStr(new Date(item.scheduled_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    // sort each day by time
    for (const [, arr] of map) arr.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    return map;
  }, [items]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function goToday() { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  function openAdd(dateStr?: string) {
    setEditing(null);
    setForm(blankForm(dateStr));
    setDialogOpen(true);
  }

  function openEdit(item: ContentItem, e: React.MouseEvent) {
    e.stopPropagation();
    setEditing(item);
    setForm({
      title: item.title,
      platform: item.platform,
      scheduled_at: toDatetimeLocal(item.scheduled_at),
      status: item.status,
      caption: item.caption ?? "",
      notes: item.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this content item?")) return;
    await supabase.from("content_schedules").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const payload = {
      title:        form.title.trim(),
      platform:     form.platform,
      scheduled_at: new Date(form.scheduled_at).toISOString(),
      status:       form.status,
      caption:      form.caption || null,
      notes:        form.notes   || null,
      created_by:   userId,
    };
    if (editing) {
      const { data } = await supabase.from("content_schedules").update(payload).eq("id", editing.id).select().single();
      if (data) setItems(prev => prev.map(i => i.id === editing.id ? (data as ContentItem) : i));
    } else {
      const { data } = await supabase.from("content_schedules").insert(payload).select().single();
      if (data) setItems(prev => [...prev, data as ContentItem]);
    }
    setSaving(false);
    setDialogOpen(false);
  }

  function setF<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(prev => ({ ...prev, [k]: v }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const todayStr = toLocalDateStr(today);

  return (
    <div className="space-y-4">
      {/* ── Header bar ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
          <Button variant="outline" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <h2 className="ml-2 text-lg font-semibold">
            {MONTHS[viewMonth]} {viewYear}
          </h2>
        </div>
        <Button size="sm" onClick={() => openAdd()}>
          <Plus className="mr-1.5 h-4 w-4" /> Add content
        </Button>
      </div>

      {/* ── Calendar ─────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/50">
          {DAYS.map(d => (
            <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {d}
            </div>
          ))}
        </div>

        {/* Grid rows */}
        <div className="grid grid-cols-7 divide-x divide-y divide-border">
          {grid.map((day) => {
            const dateStr = toLocalDateStr(day);
            const isCurrentMonth = day.getMonth() === viewMonth;
            const isToday = dateStr === todayStr;
            const dayItems = itemsByDay.get(dateStr) ?? [];
            const isExpanded = expandDay === dateStr;
            const visible = isExpanded ? dayItems : dayItems.slice(0, MAX_VISIBLE);
            const overflow = dayItems.length - MAX_VISIBLE;

            return (
              <div
                key={dateStr}
                className={cn(
                  "min-h-[7.5rem] cursor-pointer p-1 transition-colors hover:bg-muted/20",
                  isToday && "bg-primary/5",
                  !isCurrentMonth && "bg-muted/10",
                )}
                onClick={() => openAdd(dateStr)}
              >
                {/* Date number */}
                <div className="mb-1 flex items-center justify-between">
                  <span className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : isCurrentMonth
                        ? "text-foreground"
                        : "text-muted-foreground/50",
                  )}>
                    {day.getDate()}
                  </span>
                </div>

                {/* Content items */}
                <div className="space-y-0.5">
                  {visible.map((item) => {
                    const sc = STATUS_CONFIG[item.status];
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "group/item flex items-center gap-1 rounded border px-1 py-0.5 text-[10px]",
                          sc.itemBg,
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="shrink-0 font-medium tabular-nums text-foreground/80">
                          {formatTime(item.scheduled_at)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-foreground/70">
                          {item.title}
                        </span>
                        <PlatformDot platform={item.platform} />
                        <span className="ml-auto hidden shrink-0 gap-0.5 group-hover/item:flex">
                          <button
                            type="button"
                            className="rounded p-0.5 hover:bg-background/60"
                            onClick={(e) => openEdit(item, e)}
                          >
                            <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-0.5 hover:bg-destructive/10"
                            onClick={(e) => void handleDelete(item.id, e)}
                          >
                            <Trash2 className="h-2.5 w-2.5 text-destructive/70" />
                          </button>
                        </span>
                      </div>
                    );
                  })}

                  {/* Overflow toggle */}
                  {!isExpanded && overflow > 0 && (
                    <button
                      type="button"
                      className="w-full rounded px-1 py-0.5 text-left text-[10px] text-primary hover:underline"
                      onClick={(e) => { e.stopPropagation(); setExpandDay(dateStr); }}
                    >
                      + {overflow} more
                    </button>
                  )}
                  {isExpanded && dayItems.length > MAX_VISIBLE && (
                    <button
                      type="button"
                      className="w-full rounded px-1 py-0.5 text-left text-[10px] text-muted-foreground hover:underline"
                      onClick={(e) => { e.stopPropagation(); setExpandDay(null); }}
                    >
                      Show less
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium">Status:</span>
        {Object.entries(STATUS_CONFIG).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-full", v.dotColor)} />
            {v.label}
          </span>
        ))}
        <span className="ml-4 font-medium">Platforms:</span>
        {PLATFORMS.map(p => (
          <span key={p.value} className="flex items-center gap-1">
            <PlatformDot platform={p.value} />
            {p.label}
          </span>
        ))}
      </div>

      {/* ── Add / Edit dialog ─────────────────────────────────────────── */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? "Edit content" : "Add content"}
      >
        <div className="space-y-4">
          {/* Title */}
          <div>
            <Label htmlFor="cp-title">Title / post name</Label>
            <Input
              id="cp-title"
              className="mt-1"
              placeholder="e.g. Summer sale promo"
              value={form.title}
              onChange={(e) => setF("title", e.target.value)}
              autoFocus
            />
          </div>

          {/* Platform + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cp-platform">Platform</Label>
              <select
                id="cp-platform"
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                value={form.platform}
                onChange={(e) => setF("platform", e.target.value as Platform)}
              >
                {PLATFORMS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="cp-status">Status</Label>
              <select
                id="cp-status"
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                value={form.status}
                onChange={(e) => setF("status", e.target.value as Status)}
              >
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date + Time */}
          <div>
            <Label htmlFor="cp-datetime">Date &amp; time</Label>
            <Input
              id="cp-datetime"
              type="datetime-local"
              className="mt-1"
              value={form.scheduled_at}
              onChange={(e) => setF("scheduled_at", e.target.value)}
            />
          </div>

          {/* Caption */}
          <div>
            <Label htmlFor="cp-caption">Caption <span className="text-muted-foreground">(optional)</span></Label>
            <textarea
              id="cp-caption"
              className="mt-1 flex min-h-[70px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Post caption or description…"
              value={form.caption}
              onChange={(e) => setF("caption", e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="cp-notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="cp-notes"
              className="mt-1"
              placeholder="Internal notes…"
              value={form.notes}
              onChange={(e) => setF("notes", e.target.value)}
            />
          </div>

          {/* Platform preview badge */}
          <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs">
            <PlatformDot platform={form.platform} />
            <span className="font-medium">{getPlatform(form.platform).label}</span>
            <span className="text-muted-foreground">·</span>
            <span className={cn("h-2 w-2 rounded-full", STATUS_CONFIG[form.status].dotColor)} />
            <span className="text-muted-foreground">{STATUS_CONFIG[form.status].label}</span>
            {form.scheduled_at && (
              <>
                <span className="text-muted-foreground">·</span>
                <span>{new Date(form.scheduled_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button type="button" onClick={() => void handleSave()} disabled={saving || !form.title.trim()}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add to calendar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
