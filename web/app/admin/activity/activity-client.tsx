"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import {
  ShieldCheck, Trash2, Download, ChevronDown, ChevronRight,
  Activity, PlusCircle, Pencil, XCircle, Search, SlidersHorizontal,
  Layers, List, Package, ShoppingBag, Banknote, Users, ClipboardList,
  Wrench, Store, Truck, BellRing, CheckSquare,
} from "lucide-react";
import { formatActivityLog, ENTITY_CATEGORY } from "@/lib/activity-log-format";
import { cn } from "@/lib/utils";

type L = {
  id: string;
  action: string;
  entity: string;
  entity_id?: string | null;
  summary?: string | null;
  payload?: unknown;
  created_at: string;
  actor_role?: string | null;
  actor?: { full_name?: string | null; email?: string | null } | null;
};

const ACTION_VARIANT: Record<string, any> = {
  INSERT: "green", UPDATE: "blue", DELETE: "red",
};
const ACTION_LABEL: Record<string, string> = {
  INSERT: "Created", UPDATE: "Updated", DELETE: "Deleted",
};

// Category icons
const CATEGORY_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  Orders: ShoppingBag,
  Inventory: Package,
  "Ready-made Inventory": Package,
  Finance: Banknote,
  "HR & Payroll": Users,
  Accounts: Users,
  Tasks: CheckSquare,
  Reminders: BellRing,
  Maintenance: Wrench,
  Stores: Store,
  Suppliers: Truck,
};

function pad2(n: number) { return String(n).padStart(2, "0"); }
function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function offsetDaysYMD(offset: number) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function monthStartYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}
function weekStartYMD() { return offsetDaysYMD(-6); }

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function initials(name?: string | null, email?: string | null) {
  const n = name || email || "?";
  return n.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
}

function exportToCSV(rows: L[], formatted: Map<string, ReturnType<typeof formatActivityLog>>, dateFrom: string, dateTo: string) {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const headers = ["Date/Time", "Actor", "Role", "Action", "Area", "Summary", "Details"];
  const lines = [
    headers.map(esc).join(","),
    ...rows.map((l) => {
      const detail = formatted.get(l.id) ?? formatActivityLog(l);
      return [
        new Date(l.created_at).toLocaleString(),
        l.actor?.full_name || l.actor?.email || "",
        l.actor_role || "",
        ACTION_LABEL[l.action] || l.action,
        detail.entityLabel,
        detail.context || l.summary || "",
        detail.lines.join(" | "),
      ].map(esc).join(",");
    }),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const suffix = dateFrom && dateTo ? `${dateFrom}_to_${dateTo}` : dateFrom || dateTo || todayYMD();
  a.download = `activity-log_${suffix}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Session grouping: consecutive logs from same actor + entity_id within 5 min
// ---------------------------------------------------------------------------
const SESSION_GAP_MS = 5 * 60 * 1000; // 5 minutes

type SessionGroup = {
  key: string;
  logs: L[];
  actor: L["actor"];
  actor_role: string | null;
  entity: string;
  entity_id?: string | null;
  firstAt: string;
  lastAt: string;
  actionCounts: { INSERT: number; UPDATE: number; DELETE: number };
};

function buildSessions(logs: L[]): SessionGroup[] {
  const sessions: SessionGroup[] = [];
  for (const log of logs) {
    const prev = sessions[sessions.length - 1];
    const sameActor = prev && (prev.actor?.email === log.actor?.email);
    const sameEntity = prev && prev.entity === log.entity && prev.entity_id === log.entity_id;
    const withinGap = prev && (new Date(prev.firstAt).getTime() - new Date(log.created_at).getTime()) < SESSION_GAP_MS;
    if (prev && sameActor && sameEntity && withinGap) {
      prev.logs.push(log);
      prev.lastAt = log.created_at;
      (prev.actionCounts as any)[log.action] = ((prev.actionCounts as any)[log.action] || 0) + 1;
    } else {
      sessions.push({
        key: `${log.id}`,
        logs: [log],
        actor: log.actor,
        actor_role: log.actor_role ?? null,
        entity: log.entity,
        entity_id: log.entity_id,
        firstAt: log.created_at,
        lastAt: log.created_at,
        actionCounts: { INSERT: 0, UPDATE: 0, DELETE: 0, [log.action]: 1 } as any,
      });
    }
  }
  return sessions;
}

// ---------------------------------------------------------------------------
// Category grouping: group sessions by ENTITY_CATEGORY
// ---------------------------------------------------------------------------
type CategoryGroup = {
  category: string;
  sessions: SessionGroup[];
  totalLogs: number;
};

function buildCategoryGroups(sessions: SessionGroup[]): CategoryGroup[] {
  const map = new Map<string, SessionGroup[]>();
  for (const s of sessions) {
    const cat = ENTITY_CATEGORY[s.entity] || "Other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(s);
  }
  return Array.from(map.entries()).map(([category, sessions]) => ({
    category,
    sessions,
    totalLogs: sessions.reduce((n, s) => n + s.logs.length, 0),
  }));
}

// ---------------------------------------------------------------------------
// 2FA verification dialog
// ---------------------------------------------------------------------------
function TwoFaDialog({ open, onClose, onVerified, label }: {
  open: boolean; onClose: () => void; onVerified: () => void; label: string;
}) {
  const supabase = createClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.find((f: any) => f.status === "verified");
      if (!totp) { onVerified(); return; }
      const { data: ch, error: ce } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (ce) throw ce;
      const { error: ve } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: ch.id, code: code.replace(/\s/g, "") });
      if (ve) throw ve;
      setCode(""); onVerified();
    } catch {
      setMsg("Invalid code. Please try again.");
    } finally { setBusy(false); }
  }

  function handleClose() { setCode(""); setMsg(null); onClose(); }

  return (
    <Dialog open={open} onClose={handleClose} title="Verify your identity" size="md">
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>2FA is required to {label}. Enter the 6-digit code from your authenticator app.</span>
        </div>
        <form onSubmit={verify} className="space-y-3">
          <div>
            <Label htmlFor="tfa-code">Authenticator code</Label>
            <Input id="tfa-code" className="mt-1 w-40 text-center font-mono text-lg tracking-widest"
              placeholder="000000" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6} inputMode="numeric" autoComplete="one-time-code" autoFocus required />
          </div>
          {msg && <p className="text-sm text-destructive">{msg}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || code.length < 6}>{busy ? "Verifying…" : "Confirm"}</Button>
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Expandable log row
// ---------------------------------------------------------------------------
function LogRow({ l, detail, selected, canDelete, onToggleSelect, onDelete, compact }: {
  l: L;
  detail: ReturnType<typeof formatActivityLog>;
  selected: boolean;
  canDelete: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = detail.lines.length > 0;

  return (
    <div className={cn(
      "group border-b last:border-b-0 transition-colors",
      compact ? "border-dashed border-border/50" : "",
      selected ? "bg-primary/5" : "hover:bg-muted/30",
    )}>
      <div className={cn("flex items-start gap-3 px-4", compact ? "py-2" : "py-3")}>
        {canDelete && (
          <div className="mt-0.5 shrink-0">
            <input type="checkbox" className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
              checked={selected} onChange={onToggleSelect} aria-label="Select row" />
          </div>
        )}
        <div className={cn(
          "flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white",
          compact ? "h-6 w-6" : "h-8 w-8",
          l.action === "INSERT" ? "bg-emerald-500" : l.action === "DELETE" ? "bg-red-500" : "bg-blue-500",
        )}>
          {initials(l.actor?.full_name, l.actor?.email)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={cn("font-medium text-foreground", compact ? "text-xs" : "text-sm")}>
              {l.actor?.full_name || l.actor?.email || "System"}
            </span>
            {l.actor_role && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                {l.actor_role.replace("_", " ")}
              </span>
            )}
            <Badge variant={ACTION_VARIANT[l.action] || "outline"} className="text-[10px] px-1.5 py-0">
              {detail.actionLabel}
            </Badge>
            <span className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>
              {detail.entityLabel}
            </span>
            <span className="ml-auto text-xs text-muted-foreground" title={new Date(l.created_at).toLocaleString()}>
              {relativeTime(l.created_at)}
            </span>
          </div>
          {detail.context && (
            <p className={cn("mt-0.5 text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>{detail.context}</p>
          )}
          {hasDetails && (
            <button type="button"
              className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {expanded ? "Hide details" : `${detail.lines.length} change${detail.lines.length !== 1 ? "s" : ""}`}
            </button>
          )}
          {expanded && (
            <ul className="mt-2 space-y-1 rounded-md border bg-muted/30 px-3 py-2">
              {detail.lines.map((line, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  <span className="break-words leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {canDelete && (
          <button onClick={onDelete}
            className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
            title="Delete record">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session row (collapses multiple related logs from same actor/entity)
// ---------------------------------------------------------------------------
function SessionRow({ session, formattedById, selected, canDelete, onToggleSelect, onDelete }: {
  session: SessionGroup;
  formattedById: Map<string, ReturnType<typeof formatActivityLog>>;
  selected: Set<string>;
  canDelete: boolean;
  onToggleSelect: (id: string) => void;
  onDelete: (ids: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isSingle = session.logs.length === 1;
  const first = session.logs[0];
  const firstDetail = formattedById.get(first.id) ?? formatActivityLog(first);

  if (isSingle) {
    return (
      <LogRow
        l={first}
        detail={firstDetail}
        selected={selected.has(first.id)}
        canDelete={canDelete}
        onToggleSelect={() => onToggleSelect(first.id)}
        onDelete={() => onDelete([first.id])}
      />
    );
  }

  // Multi-log session
  const { INSERT, UPDATE, DELETE: DEL } = session.actionCounts;
  const summaryParts: string[] = [];
  if (INSERT > 0) summaryParts.push(`${INSERT} created`);
  if (UPDATE > 0) summaryParts.push(`${UPDATE} updated`);
  if (DEL > 0) summaryParts.push(`${DEL} deleted`);

  const allSelected = session.logs.every((l) => selected.has(l.id));
  const anySelected = session.logs.some((l) => selected.has(l.id));

  return (
    <div className="border-b last:border-b-0">
      {/* Session header */}
      <div className={cn(
        "group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors",
        anySelected ? "bg-primary/5" : "hover:bg-muted/30",
      )} onClick={() => setExpanded((v) => !v)}>
        {canDelete && (
          <div className="mt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox"
              className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = anySelected && !allSelected; }}
              onChange={() => {
                if (allSelected) session.logs.forEach((l) => onToggleSelect(l.id));
                else session.logs.filter((l) => !selected.has(l.id)).forEach((l) => onToggleSelect(l.id));
              }}
              aria-label="Select session"
            />
          </div>
        )}
        {/* Stacked avatar */}
        <div className="flex shrink-0 -space-x-1">
          <div className="z-10 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-[11px] font-semibold text-white ring-2 ring-background">
            {initials(session.actor?.full_name, session.actor?.email)}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium text-foreground">
              {session.actor?.full_name || session.actor?.email || "System"}
            </span>
            {session.actor_role && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                {session.actor_role.replace("_", " ")}
              </span>
            )}
            {/* Count badge */}
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
              {session.logs.length} changes
            </span>
            <span className="text-sm text-muted-foreground">{firstDetail.entityLabel}</span>
            <span className="ml-auto text-xs text-muted-foreground" title={new Date(session.firstAt).toLocaleString()}>
              {relativeTime(session.firstAt)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{summaryParts.join(" · ")}</p>
          <div className="mt-1 flex items-center gap-1 text-xs font-medium text-primary">
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {expanded ? "Collapse" : "Show all changes"}
          </div>
        </div>
        {canDelete && (
          <button onClick={(e) => { e.stopPropagation(); onDelete(session.logs.map((l) => l.id)); }}
            className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
            title="Delete session records">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* Expanded entries */}
      {expanded && (
        <div className="border-l-2 border-primary/20 ml-12 bg-muted/10">
          {session.logs.map((l) => {
            const detail = formattedById.get(l.id) ?? formatActivityLog(l);
            return (
              <LogRow key={l.id} l={l} detail={detail}
                selected={selected.has(l.id)}
                canDelete={canDelete}
                onToggleSelect={() => onToggleSelect(l.id)}
                onDelete={() => onDelete([l.id])}
                compact
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category group (Inventory, Orders, Finance etc.)
// ---------------------------------------------------------------------------
function CategoryGroupBlock({ group, formattedById, selected, canDelete, onToggleSelect, onDelete, defaultOpen }: {
  group: CategoryGroup;
  formattedById: Map<string, ReturnType<typeof formatActivityLog>>;
  selected: Set<string>;
  canDelete: boolean;
  onToggleSelect: (id: string) => void;
  onDelete: (ids: string[]) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = CATEGORY_ICON[group.category] || ClipboardList;
  const allIds = group.sessions.flatMap((s) => s.logs.map((l) => l.id));
  const insertCount = group.sessions.flatMap((s) => s.logs).filter((l) => l.action === "INSERT").length;
  const updateCount = group.sessions.flatMap((s) => s.logs).filter((l) => l.action === "UPDATE").length;
  const deleteCount = group.sessions.flatMap((s) => s.logs).filter((l) => l.action === "DELETE").length;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Category header */}
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{group.category}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {group.totalLogs} records
            </span>
            {insertCount > 0 && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                +{insertCount}
              </span>
            )}
            {updateCount > 0 && (
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                ~{updateCount}
              </span>
            )}
            {deleteCount > 0 && (
              <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                -{deleteCount}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Most recent: {relativeTime(group.sessions[0].firstAt)}
          </p>
        </div>
        {canDelete && (
          <button
            type="button"
            className="mr-2 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="Delete all in this group"
            onClick={(e) => { e.stopPropagation(); onDelete(allIds); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
               : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>

      {/* Entries */}
      {open && (
        <div className="border-t border-border">
          {group.sessions.map((session) => (
            <SessionRow
              key={session.key}
              session={session}
              formattedById={formattedById}
              selected={selected}
              canDelete={canDelete}
              onToggleSelect={onToggleSelect}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------
function StatsBar({ filtered }: { filtered: L[] }) {
  const counts = useMemo(() => ({
    total: filtered.length,
    created: filtered.filter((l) => l.action === "INSERT").length,
    updated: filtered.filter((l) => l.action === "UPDATE").length,
    deleted: filtered.filter((l) => l.action === "DELETE").length,
  }), [filtered]);

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[
        { label: "Total", value: counts.total, icon: Activity, color: "text-foreground", bg: "bg-muted/50" },
        { label: "Created", value: counts.created, icon: PlusCircle, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20" },
        { label: "Updated", value: counts.updated, icon: Pencil, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/20" },
        { label: "Deleted", value: counts.deleted, icon: XCircle, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-900/20" },
      ].map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className={cn("flex items-center gap-3 rounded-lg border px-4 py-3", bg)}>
          <Icon className={cn("h-5 w-5 shrink-0", color)} />
          <div>
            <div className={cn("text-xl font-bold tabular-nums", color)}>{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main activity log client
// ---------------------------------------------------------------------------
type ViewMode = "timeline" | "grouped";

export function ActivityClient({ initial, canDelete }: { initial: L[]; canDelete: boolean }) {
  const supabase = createClient();
  const [list, setList] = useState<L[]>(initial);
  const [filter, setFilter] = useState("");
  const [entity, setEntity] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [fetching, setFetching] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");
  const headerCheckRef = useRef<HTMLInputElement>(null);

  // 2FA gate state
  const [twoFaOpen, setTwoFaOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [has2Fa, setHas2Fa] = useState(false);

  useEffect(() => {
    if (!canDelete) return;
    supabase.auth.mfa.listFactors().then(({ data }) => {
      setHas2Fa(!!data?.totp?.find((f: any) => f.status === "verified"));
    });
  }, [canDelete]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch on date range change
  useEffect(() => {
    let cancelled = false;
    async function fetchByRange() {
      setFetching(true);
      let q = supabase
        .from("activity_logs")
        .select("*, actor:actor_id(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00.000Z`);
      if (dateTo) {
        const end = new Date(`${dateTo}T00:00:00.000Z`);
        end.setDate(end.getDate() + 1);
        q = q.lt("created_at", end.toISOString());
      }
      const { data } = await q;
      if (!cancelled && data) setList(data);
      if (!cancelled) setFetching(false);
    }
    void fetchByRange();
    return () => { cancelled = true; };
  }, [dateFrom, dateTo]); // eslint-disable-line react-hooks/exhaustive-deps

  const formattedById = useMemo(() => {
    const m = new Map<string, ReturnType<typeof formatActivityLog>>();
    for (const l of list) m.set(l.id, formatActivityLog(l));
    return m;
  }, [list]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return list.filter((l) => {
      if (entity !== "all" && l.entity !== entity) return false;
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (q) {
        const detail = formattedById.get(l.id);
        const hay = `${l.actor?.full_name || ""} ${l.actor?.email || ""} ${l.entity} ${l.summary || ""} ${detail?.searchText || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [list, filter, entity, actionFilter, formattedById]);

  // Sessions (for timeline view: collapse same actor+entity+id within 5 min)
  const sessions = useMemo(() => buildSessions(filtered), [filtered]);

  // Category groups (for grouped view)
  const categoryGroups = useMemo(() => buildCategoryGroups(sessions), [sessions]);

  const entities = useMemo(() => Array.from(new Set(list.map((l) => l.entity))).sort(), [list]);

  // Header checkbox sync
  useEffect(() => {
    const el = headerCheckRef.current;
    if (!el) return;
    const visibleIds = filtered.map((l) => l.id);
    const selCount = visibleIds.filter((id) => selectedIds.has(id)).length;
    el.indeterminate = selCount > 0 && selCount < visibleIds.length;
    el.checked = visibleIds.length > 0 && selCount === visibleIds.length;
  }, [filtered, selectedIds]);

  function applyPreset(preset: "today" | "week" | "month" | "all") {
    if (preset === "today") { setDateFrom(todayYMD()); setDateTo(todayYMD()); }
    else if (preset === "week") { setDateFrom(weekStartYMD()); setDateTo(todayYMD()); }
    else if (preset === "month") { setDateFrom(monthStartYMD()); setDateTo(todayYMD()); }
    else { setDateFrom(""); setDateTo(""); }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const visibleIds = filtered.map((l) => l.id);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function executeDeletion(ids: string[]) {
    const { error } = await supabase.from("activity_logs").delete().in("id", ids);
    if (error) { alert(error.message); return; }
    setList((p) => p.filter((x) => !ids.includes(x.id)));
    setSelectedIds(new Set());
    setPendingDeleteIds([]);
  }

  function requestDelete(ids: string[]) {
    if (!ids.length) return;
    if (has2Fa) {
      setPendingDeleteIds(ids);
      setTwoFaOpen(true);
    } else {
      const msg = ids.length === 1
        ? "Delete this audit record? This is irreversible."
        : `Delete ${ids.length} audit records? This is irreversible.`;
      if (!confirm(msg)) return;
      void executeDeletion(ids);
    }
  }

  const activePreset = (() => {
    const t = todayYMD();
    if (dateFrom === t && dateTo === t) return "today";
    if (dateFrom === weekStartYMD() && dateTo === t) return "week";
    if (dateFrom === monthStartYMD() && dateTo === t) return "month";
    if (!dateFrom && !dateTo) return "all";
    return null;
  })();

  const selectClass = "h-9 w-full rounded-md border bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <>
      <TwoFaDialog
        open={twoFaOpen}
        onClose={() => { setTwoFaOpen(false); setPendingDeleteIds([]); }}
        onVerified={() => { setTwoFaOpen(false); void executeDeletion(pendingDeleteIds); }}
        label={pendingDeleteIds.length === 1 ? "delete this record" : `delete ${pendingDeleteIds.length} records`}
      />

      {/* Stats */}
      <StatsBar filtered={filtered} />

      {/* Filter card */}
      <Card className="mb-4">
        <CardContent className="p-4">
          {/* Top row: date presets + export + filter toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Date range</span>
            {(["today", "week", "month", "all"] as const).map((p) => (
              <button key={p} type="button" onClick={() => applyPreset(p)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors border",
                  activePreset === p
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                )}>
                {p === "today" ? "Today" : p === "week" ? "This week" : p === "month" ? "This month" : "All time"}
              </button>
            ))}

            <div className="ml-auto flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex items-center rounded-md border border-input overflow-hidden text-xs">
                <button type="button"
                  onClick={() => setViewMode("grouped")}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 transition-colors",
                    viewMode === "grouped" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                  title="Grouped by area">
                  <Layers className="h-3.5 w-3.5" /> Grouped
                </button>
                <button type="button"
                  onClick={() => setViewMode("timeline")}
                  className={cn("flex items-center gap-1.5 px-3 py-1.5 transition-colors",
                    viewMode === "timeline" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
                  title="Flat timeline">
                  <List className="h-3.5 w-3.5" /> Timeline
                </button>
              </div>

              {/* Export CSV */}
              <Button type="button" size="sm" variant="outline"
                onClick={() => exportToCSV(filtered, formattedById, dateFrom, dateTo)}
                disabled={filtered.length === 0}
                title={`Export ${filtered.length} row${filtered.length !== 1 ? "s" : ""} to CSV`}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export CSV
                {filtered.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {filtered.length}
                  </span>
                )}
              </Button>

              {/* Toggle advanced filters */}
              <button type="button" onClick={() => setShowFilters((v) => !v)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  showFilters ? "border-primary bg-primary/5 text-primary" : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                )}>
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters
                {(entity !== "all" || actionFilter !== "all" || dateFrom || dateTo) && (
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            </div>
          </div>

          {/* Advanced filter row */}
          {showFilters && (
            <div className="mt-3 grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label htmlFor="ac-from">From date</Label>
                <Input id="ac-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="ac-to">To date</Label>
                <Input id="ac-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="ac-entity">Area</Label>
                <select id="ac-entity" className={cn(selectClass, "mt-1")} value={entity} onChange={(e) => setEntity(e.target.value)}>
                  <option value="all">All areas</option>
                  {entities.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="ac-search">Search</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input id="ac-search" className="pl-8" placeholder="Actor, summary…" value={filter} onChange={(e) => setFilter(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Action type filter chips */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Action</span>
            {[
              { key: "all", label: "All", variant: null },
              { key: "INSERT", label: "Created", variant: "green" },
              { key: "UPDATE", label: "Updated", variant: "blue" },
              { key: "DELETE", label: "Deleted", variant: "red" },
            ].map(({ key, label }) => {
              const count = key === "all" ? list.length : list.filter((l) => l.action === key).length;
              const active = actionFilter === key;
              return (
                <button key={key} type="button" onClick={() => setActionFilter(key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? key === "INSERT" ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : key === "UPDATE" ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : key === "DELETE" ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                        : "border-primary bg-primary/10 text-primary"
                      : "border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}>
                  {key === "INSERT" && <PlusCircle className="h-3 w-3" />}
                  {key === "UPDATE" && <Pencil className="h-3 w-3" />}
                  {key === "DELETE" && <XCircle className="h-3 w-3" />}
                  {label}
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                    active ? "bg-black/10 dark:bg-white/10" : "bg-muted")}>{count}</span>
                </button>
              );
            })}

            {!showFilters && (
              <div className="relative ml-auto w-52">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-8 pl-8 text-xs" placeholder="Search actor, area…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions bar */}
      {(canDelete || fetching) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {canDelete && (
              <input ref={headerCheckRef} type="checkbox"
                className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                aria-label="Select all visible" onChange={toggleSelectAllVisible} />
            )}
            {fetching ? (
              <span className="text-primary animate-pulse">Loading records…</span>
            ) : (
              <>
                Showing <span className="font-medium text-foreground">{filtered.length}</span>
                {filtered.length !== list.length && <> of {list.length}</>} records
                {selectedIds.size > 0 && <span className="text-primary">· {selectedIds.size} selected</span>}
              </>
            )}
          </div>
          {canDelete && selectedIds.size > 0 && (
            <Button type="button" size="sm" variant="destructive" onClick={() => requestDelete(Array.from(selectedIds))}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete {selectedIds.size} selected
            </Button>
          )}
        </div>
      )}

      {/* Log feed */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Activity className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No activity found</p>
            <p className="text-xs text-muted-foreground">
              {filter || entity !== "all" || actionFilter !== "all"
                ? "Try adjusting your filters."
                : dateFrom || dateTo
                ? "No records in the selected date range."
                : "Activity will appear here when records are created or changed."}
            </p>
            {(filter || entity !== "all" || actionFilter !== "all" || dateFrom || dateTo) && (
              <button type="button"
                onClick={() => { setFilter(""); setEntity("all"); setActionFilter("all"); setDateFrom(""); setDateTo(""); }}
                className="text-xs font-medium text-primary hover:underline">
                Clear all filters
              </button>
            )}
          </CardContent>
        </Card>
      ) : viewMode === "grouped" ? (
        // ── Grouped by area ────────────────────────────────────────────────
        <div className="space-y-3">
          {categoryGroups.map((group, i) => (
            <CategoryGroupBlock
              key={group.category}
              group={group}
              formattedById={formattedById}
              selected={selectedIds}
              canDelete={canDelete}
              onToggleSelect={toggleSelect}
              onDelete={requestDelete}
              defaultOpen={i === 0}
            />
          ))}
        </div>
      ) : (
        // ── Flat timeline with session collapsing ──────────────────────────
        <Card>
          <CardContent className="p-0">
            {sessions.map((session) => (
              <SessionRow
                key={session.key}
                session={session}
                formattedById={formattedById}
                selected={selectedIds}
                canDelete={canDelete}
                onToggleSelect={toggleSelect}
                onDelete={requestDelete}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}
