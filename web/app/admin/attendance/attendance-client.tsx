"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Clock, Pencil, Plus, ScanFace, Trash2 } from "lucide-react";

export type AttendanceRow = {
  id: string;
  user_id: string;
  time_in: string;
  time_out: string | null;
  notes: string | null;
  payroll_paid?: boolean | null;
  user?: { full_name: string | null; email: string | null } | null;
};

function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDatetimeLocal(s: string) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type EmployeeOption = { id: string; full_name: string | null; email: string; face_descriptor?: number[] | null };

function defaultShiftDatetimeLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return { timeIn: `${y}-${m}-${day}T08:00`, timeOut: `${y}-${m}-${day}T17:00` };
}

function isValidYMD(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s).trim())) return false;
  const [y, m, day] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, day);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === day;
}

/** Start of local calendar day as ISO for `time_in` range queries. */
function localDayStartIso(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

/** End of local calendar day as ISO for `time_in` range queries. */
function localDayEndIso(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

export function AdminAttendanceClient({
  initial,
  employees,
  initialClockMode,
}: {
  initial: AttendanceRow[];
  employees: EmployeeOption[];
  initialClockMode: "manual" | "face";
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<AttendanceRow[]>(initial);
  const [editing, setEditing] = useState<AttendanceRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterCommitted, setFilterCommitted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [clockMode, setClockMode] = useState<"manual" | "face">(initialClockMode);
  const [clockModeBusy, setClockModeBusy] = useState(false);
  const headerSelectRef = useRef<HTMLInputElement>(null);

  async function toggleClockMode() {
    const next = clockMode === "manual" ? "face" : "manual";
    setClockModeBusy(true);
    await supabase.from("app_settings").upsert({ key: "clock_mode", value: next, updated_at: new Date().toISOString() });
    setClockMode(next);
    setClockModeBusy(false);
  }


  useEffect(() => {
    setRows(initial);
  }, [initial]);

  useEffect(() => {
    const el = headerSelectRef.current;
    if (!el) return;
    const n = rows.length;
    const sel = rows.filter((r) => selectedIds.has(r.id)).length;
    el.indeterminate = n > 0 && sel > 0 && sel < n;
  }, [rows, selectedIds]);

  async function fetchRows(fromYmd: string, toYmd: string) {
    let q = supabase
      .from("attendance")
      .select("*, user:user_id(full_name, email)")
      .order("time_in", { ascending: false })
      .limit(800);
    if (fromYmd && toYmd) {
      q = q.gte("time_in", localDayStartIso(fromYmd)).lte("time_in", localDayEndIso(toYmd));
    } else if (fromYmd) {
      q = q.gte("time_in", localDayStartIso(fromYmd));
    } else if (toYmd) {
      q = q.lte("time_in", localDayEndIso(toYmd));
    }
    const { data, error } = await q;
    if (error) {
      alert(error.message);
      return;
    }
    setRows((data as AttendanceRow[]) || []);
    setSelectedIds(new Set());
  }

  async function refresh() {
    await fetchRows(filterFrom.trim().slice(0, 10), filterTo.trim().slice(0, 10));
  }

  async function applyDateFilter() {
    let from = filterFrom.trim().slice(0, 10);
    let to = filterTo.trim().slice(0, 10);
    if (from && !isValidYMD(from)) {
      alert("Start date is not valid.");
      return;
    }
    if (to && !isValidYMD(to)) {
      alert("End date is not valid.");
      return;
    }
    if (from && to && from > to) {
      const a = from;
      from = to;
      to = a;
      setFilterFrom(from);
      setFilterTo(to);
    }
    setFilterCommitted(!!(from || to));
    await fetchRows(from, to);
  }

  async function clearDateFilter() {
    setFilterFrom("");
    setFilterTo("");
    setFilterCommitted(false);
    await fetchRows("", "");
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (rows.length === 0) return;
    const allOn = rows.every((r) => selectedIds.has(r.id));
    if (allOn) setSelectedIds(new Set());
    else setSelectedIds(new Set(rows.map((r) => r.id)));
  }

  async function deleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} attendance record(s)? This cannot be undone.`)) return;
    setBulkBusy(true);
    const { error } = await supabase.from("attendance").delete().in("id", ids);
    setBulkBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    await refresh();
  }

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const selectedCount = selectedIds.size;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="grid gap-1">
            <Label htmlFor="att-filter-from" className="text-xs text-muted-foreground">
              Start date (time in)
            </Label>
            <Input
              id="att-filter-from"
              type="date"
              className="h-9 w-[11.5rem] font-medium tabular-nums"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="att-filter-to" className="text-xs text-muted-foreground">
              End date (time in)
            </Label>
            <Input
              id="att-filter-to"
              type="date"
              className="h-9 w-[11.5rem] font-medium tabular-nums"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => void applyDateFilter()}>
              Apply filter
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => void clearDateFilter()}>
              Clear filter
            </Button>
          </div>
          <p className="w-full max-w-xl text-xs text-muted-foreground sm:pl-1">
            Filter uses each row&apos;s <strong>time in</strong> on your browser&apos;s local calendar (start of first day
            through end of last day). Leave both empty and clear to load the most recent records (up to 800).
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={selectedCount === 0 || bulkBusy}
            onClick={() => void deleteSelected()}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            {bulkBusy ? "Deleting…" : `Delete selected (${selectedCount})`}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void toggleClockMode()}
            disabled={clockModeBusy}
            title={`Employee clock mode: ${clockMode}. Click to switch.`}
          >
            {clockMode === "manual"
              ? <><Clock className="mr-1 h-4 w-4" />Manual Clock</>
              : <><ScanFace className="mr-1 h-4 w-4" />Face ID Clock</>
            }
          </Button>
          <Button type="button" onClick={() => setAdding(true)} disabled={employees.length === 0}>
            <Plus className="mr-1 h-4 w-4" />
            Add attendance
          </Button>
        </div>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="w-10 p-2 pl-3">
                  <input
                    ref={headerSelectRef}
                    type="checkbox"
                    className="h-4 w-4 rounded border-input"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    disabled={rows.length === 0}
                    title="Select all on this page"
                    aria-label="Select all attendance rows"
                  />
                </th>
                <th className="p-3">Employee</th>
                <th className="p-3">Date</th>
                <th className="p-3">Time In</th>
                <th className="p-3">Time Out</th>
                <th className="p-3">Duration</th>
                <th className="p-3 w-[7rem]">Pay status</th>
                <th className="p-3">Notes</th>
                <th className="sticky right-0 z-[1] border-l bg-muted/40 p-3 text-left shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const inT = new Date(a.time_in);
                const outT = a.time_out ? new Date(a.time_out) : null;
                const dur = outT ? `${((outT.getTime() - inT.getTime()) / 3600000).toFixed(2)}h` : "—";
                const note = (a.notes || "").trim();
                return (
                  <tr key={a.id} className="border-t hover:bg-muted/30">
                    <td className="p-2 pl-3 align-middle">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={selectedIds.has(a.id)}
                        onChange={() => toggleSelect(a.id)}
                        aria-label={`Select attendance ${a.id}`}
                      />
                    </td>
                    <td className="p-3">{a.user?.full_name || a.user?.email || "—"}</td>
                    <td className="p-3">{formatDate(inT)}</td>
                    <td className="p-3 whitespace-nowrap">{inT.toLocaleString()}</td>
                    <td className="p-3 whitespace-nowrap">{outT ? outT.toLocaleString() : "—"}</td>
                    <td className="p-3">{dur}</td>
                    <td className="p-3">
                      {a.payroll_paid ? (
                        <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                          Paid in payroll
                        </span>
                      ) : (
                        <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                          Unpaid
                        </span>
                      )}
                    </td>
                    <td className="p-3 max-w-[140px]">
                      {note ? <span className="line-clamp-2 text-muted-foreground" title={note}>{note}</span> : "—"}
                    </td>
                    <td className="sticky right-0 z-[1] border-l bg-card p-3 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(a)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-muted-foreground">
                    {filterCommitted ? "No attendance records in this range." : "No attendance records."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <EditAttendanceDialog
        open={!!editing}
        row={editing}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
      <AddAttendanceDialog
        open={adding}
        employees={employees}
        onClose={() => setAdding(false)}
        onSaved={refresh}
      />
    </>
  );
}

function EditAttendanceDialog({
  open,
  row,
  onClose,
  onSaved,
}: {
  open: boolean;
  row: AttendanceRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [timeIn, setTimeIn] = useState("");
  const [timeOut, setTimeOut] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    setTimeIn(toDatetimeLocalValue(row.time_in));
    setTimeOut(row.time_out ? toDatetimeLocalValue(row.time_out) : "");
    setNotes(row.notes || "");
    setErr(null);
  }, [open, row]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    setErr(null);
    const inIso = parseDatetimeLocal(timeIn);
    if (!inIso) {
      setErr("Time in is invalid.");
      return;
    }
    let outIso: string | null = null;
    if (timeOut.trim()) {
      outIso = parseDatetimeLocal(timeOut.trim());
      if (!outIso) {
        setErr("Time out is invalid.");
        return;
      }
      if (new Date(outIso).getTime() <= new Date(inIso).getTime()) {
        setErr("Time out must be after time in.");
        return;
      }
    }
    setBusy(true);
    const { error } = await supabase
      .from("attendance")
      .update({
        time_in: inIso,
        time_out: outIso,
        notes: notes.trim() || null,
      })
      .eq("id", row.id);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onClose();
    onSaved();
  }

  const dialogOpen = open && !!row;
  const titleText = row
    ? `Edit attendance — ${row.user?.full_name || row.user?.email || "Employee"}`
    : "Edit attendance";

  return (
    <Dialog open={dialogOpen} onClose={onClose} title={titleText} size="md">
      {row ? (
      <form onSubmit={save} className="grid gap-3">
        <p className="text-xs text-muted-foreground">
          Times use your computer’s local timezone. Clear time out to mark an open shift.
        </p>
        <div>
          <Label>Time in</Label>
          <Input type="datetime-local" required value={timeIn} onChange={(e) => setTimeIn(e.target.value)} />
        </div>
        <div>
          <Label>Time out</Label>
          <Input type="datetime-local" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} />
        </div>
        <div>
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </form>
      ) : null}
    </Dialog>
  );
}

function AddAttendanceDialog({
  open,
  employees,
  onClose,
  onSaved,
}: {
  open: boolean;
  employees: EmployeeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [userId, setUserId] = useState("");
  const [timeIn, setTimeIn] = useState("");
  const [timeOut, setTimeOut] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const def = defaultShiftDatetimeLocal();
    setTimeIn(def.timeIn);
    setTimeOut(def.timeOut);
    setNotes("");
    setErr(null);
    setUserId(employees[0]?.id || "");
  }, [open, employees]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!userId) {
      setErr("Choose an employee.");
      return;
    }
    const inIso = parseDatetimeLocal(timeIn);
    if (!inIso) {
      setErr("Time in is invalid.");
      return;
    }
    let outIso: string | null = null;
    if (timeOut.trim()) {
      outIso = parseDatetimeLocal(timeOut.trim());
      if (!outIso) {
        setErr("Time out is invalid.");
        return;
      }
      if (new Date(outIso).getTime() <= new Date(inIso).getTime()) {
        setErr("Time out must be after time in.");
        return;
      }
    }
    setBusy(true);
    const { error } = await supabase.from("attendance").insert({
      user_id: userId,
      time_in: inIso,
      time_out: outIso,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    onClose();
    onSaved();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add attendance" size="md">
      <form onSubmit={save} className="grid gap-3">
        <p className="text-xs text-muted-foreground">
          Times use your computer’s local timezone. Leave time out empty for an open shift (hourly pay counts only completed
          ranges).
        </p>
        <div>
          <Label>Employee</Label>
          <select
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
          >
            {employees.map((em) => (
              <option key={em.id} value={em.id}>
                {em.full_name?.trim() || em.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Time in</Label>
          <Input type="datetime-local" required value={timeIn} onChange={(e) => setTimeIn(e.target.value)} />
        </div>
        <div>
          <Label>Time out</Label>
          <Input type="datetime-local" value={timeOut} onChange={(e) => setTimeOut(e.target.value)} />
        </div>
        <div>
          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
