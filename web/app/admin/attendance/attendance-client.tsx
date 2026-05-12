"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { Pencil, Plus } from "lucide-react";

export type AttendanceRow = {
  id: string;
  user_id: string;
  time_in: string;
  time_out: string | null;
  notes: string | null;
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

export type EmployeeOption = { id: string; full_name: string | null; email: string };

function defaultShiftDatetimeLocal() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  return { timeIn: `${y}-${m}-${day}T08:00`, timeOut: `${y}-${m}-${day}T17:00` };
}

export function AdminAttendanceClient({
  initial,
  employees,
}: {
  initial: AttendanceRow[];
  employees: EmployeeOption[];
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<AttendanceRow[]>(initial);
  const [editing, setEditing] = useState<AttendanceRow | null>(null);
  const [adding, setAdding] = useState(false);

  async function refresh() {
    const { data } = await supabase
      .from("attendance")
      .select("*, user:user_id(full_name, email)")
      .order("time_in", { ascending: false })
      .limit(200);
    setRows((data as AttendanceRow[]) || []);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Button type="button" onClick={() => setAdding(true)} disabled={employees.length === 0}>
          <Plus className="mr-1 h-4 w-4" />
          Add attendance
        </Button>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3">Employee</th>
                <th className="p-3">Date</th>
                <th className="p-3">Time In</th>
                <th className="p-3">Time Out</th>
                <th className="p-3">Duration</th>
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
                    <td className="p-3">{a.user?.full_name || a.user?.email || "—"}</td>
                    <td className="p-3">{formatDate(inT)}</td>
                    <td className="p-3 whitespace-nowrap">{inT.toLocaleString()}</td>
                    <td className="p-3 whitespace-nowrap">{outT ? outT.toLocaleString() : "—"}</td>
                    <td className="p-3">{dur}</td>
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
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">No attendance records.</td>
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
