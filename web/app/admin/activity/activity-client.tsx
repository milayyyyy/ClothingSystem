"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { ShieldCheck, Trash2 } from "lucide-react";

type L = any;

const ACTION_VARIANT: Record<string, any> = {
  INSERT: "green", UPDATE: "blue", DELETE: "red",
};

function pad2(n: number) { return String(n).padStart(2, "0"); }
function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function offsetDaysYMD(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function monthStartYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}
function weekStartYMD() { return offsetDaysYMD(-6); }

function localDateKey(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// 2FA verification dialog
// ---------------------------------------------------------------------------
function TwoFaDialog({
  open,
  onClose,
  onVerified,
  label,
}: {
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
  label: string;
}) {
  const supabase = createClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.find((f: any) => f.status === "verified");
      if (!totp) {
        // No 2FA enrolled — allow through
        onVerified();
        return;
      }
      const { data: ch, error: ce } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (ce) throw ce;
      const { error: ve } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: ch.id, code: code.replace(/\s/g, "") });
      if (ve) throw ve;
      setCode("");
      onVerified();
    } catch (err: unknown) {
      setMsg("Invalid code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    setCode("");
    setMsg(null);
    onClose();
  }

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
            <Input
              id="tfa-code"
              className="mt-1 w-40 text-center font-mono text-lg tracking-widest"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
            />
          </div>
          {msg && <p className="text-sm text-destructive">{msg}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || code.length < 6}>
              {busy ? "Verifying…" : "Confirm"}
            </Button>
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main activity log client
// ---------------------------------------------------------------------------
export function ActivityClient({ initial, canDelete }: { initial: L[]; canDelete: boolean }) {
  const supabase = createClient();
  const [list, setList] = useState<L[]>(initial);
  const [filter, setFilter] = useState("");
  const [entity, setEntity] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const headerCheckRef = useRef<HTMLInputElement>(null);

  // 2FA gate state
  const [twoFaOpen, setTwoFaOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);

  // Check if 2FA is enrolled
  const [has2Fa, setHas2Fa] = useState(false);
  useEffect(() => {
    if (!canDelete) return;
    supabase.auth.mfa.listFactors().then(({ data }) => {
      setHas2Fa(!!data?.totp?.find((f: any) => f.status === "verified"));
    });
  }, [canDelete]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return list.filter((l) => {
      if (entity !== "all" && l.entity !== entity) return false;
      if (dateFrom || dateTo) {
        const key = localDateKey(l.created_at);
        if (dateFrom && key < dateFrom) return false;
        if (dateTo && key > dateTo) return false;
      }
      if (q) {
        const hay = `${l.actor?.full_name || ""} ${l.actor?.email || ""} ${l.entity} ${l.summary || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [list, filter, entity, dateFrom, dateTo]);

  const entities = useMemo(() => Array.from(new Set(list.map((l) => l.entity))).sort(), [list]);

  // Keep header checkbox indeterminate state in sync
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

  function remove(id: string) { requestDelete([id]); }
  function deleteSelected() { requestDelete(Array.from(selectedIds)); }

  return (
    <>
      <TwoFaDialog
        open={twoFaOpen}
        onClose={() => { setTwoFaOpen(false); setPendingDeleteIds([]); }}
        onVerified={() => {
          setTwoFaOpen(false);
          void executeDeletion(pendingDeleteIds);
        }}
        label={pendingDeleteIds.length === 1 ? "delete this record" : `delete ${pendingDeleteIds.length} records`}
      />

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="space-y-4 p-4">
          {/* Date presets */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Quick range</span>
            {(["today", "week", "month", "all"] as const).map((p) => (
              <Button key={p} type="button" size="sm" variant="outline" onClick={() => applyPreset(p)}>
                {p === "today" ? "Today" : p === "week" ? "This week" : p === "month" ? "This month" : "All time"}
              </Button>
            ))}
          </div>

          {/* Custom date range + text filters */}
          <div className="grid gap-3 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="ac-from">From</Label>
              <Input id="ac-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="ac-to">To</Label>
              <Input id="ac-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="ac-entity">Entity</Label>
              <select id="ac-entity" className="mt-1 h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={entity} onChange={(e) => setEntity(e.target.value)}>
                <option value="all">All entities</option>
                {entities.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <Label htmlFor="ac-search">Search</Label>
              <Input id="ac-search" className="mt-1" placeholder="Actor, summary…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk actions bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Showing <span className="font-medium text-foreground">{filtered.length}</span> of {list.length} records
          {selectedIds.size > 0 && <span className="ml-2 text-primary">· {selectedIds.size} selected</span>}
        </span>
        {canDelete && selectedIds.size > 0 && (
          <Button type="button" size="sm" variant="destructive" onClick={deleteSelected}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete selected ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {canDelete && (
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      ref={headerCheckRef}
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                      aria-label="Select all visible"
                      onChange={toggleSelectAllVisible}
                    />
                  </th>
                )}
                <th className="px-4 py-3 text-left font-medium">When</th>
                <th className="text-left font-medium">Actor</th>
                <th className="text-left font-medium">Action</th>
                <th className="text-left font-medium">Entity</th>
                <th className="text-left font-medium">Summary</th>
                {canDelete && <th className="w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className={`border-t hover:bg-muted/30 ${selectedIds.has(l.id) ? "bg-primary/5" : ""}`}>
                  {canDelete && (
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                        checked={selectedIds.has(l.id)}
                        onChange={() => toggleSelect(l.id)}
                        aria-label="Select row"
                      />
                    </td>
                  )}
                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(l.created_at).toLocaleString()}
                  </td>
                  <td>
                    <div className="text-sm">{l.actor?.full_name || l.actor?.email || "—"}</div>
                    {l.actor_role && <div className="text-[11px] capitalize text-muted-foreground">{l.actor_role.replace("_", " ")}</div>}
                  </td>
                  <td><Badge variant={ACTION_VARIANT[l.action] || "outline"}>{l.action}</Badge></td>
                  <td className="font-mono text-xs">{l.entity}</td>
                  <td className="max-w-[320px] truncate text-xs text-muted-foreground" title={l.summary}>{l.summary}</td>
                  {canDelete && (
                    <td className="px-2">
                      <button
                        onClick={() => remove(l.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Delete record"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canDelete ? 7 : 5} className="p-8 text-center text-muted-foreground">
                    No activity matches.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
