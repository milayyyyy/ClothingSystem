"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Pencil, Plus, Trash2 } from "lucide-react";

export type OnCallStaff = {
  id: string;
  full_name: string;
  phone?: string | null;
  position?: string | null;
  notes?: string | null;
  facebook_account?: string | null;
  active?: boolean;
};

function facebookHref(raw: string | null | undefined): string {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("facebook.com") || t.startsWith("www.facebook.com")) return `https://${t}`;
  const handle = t.replace(/^@/, "");
  return `https://facebook.com/${handle}`;
}

type EmpPosition = { id: string; name: string; sort_order: number };

const selectClass = cn(
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary",
);

function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export function OnCallStaffPanel({
  list,
  positions,
  onRefresh,
}: {
  list: OnCallStaff[];
  positions: EmpPosition[];
  onRefresh: () => void | Promise<void>;
}) {
  const supabase = createClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<OnCallStaff | null>(null);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add on-call contact
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.length === 0 && (
          <p className="col-span-full rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            No on-call contacts yet. Add technicians, sewers, or other workers you call in as needed.
          </p>
        )}
        {list.map((person) => (
          <Card key={person.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200 font-semibold">
                    {initials(person.full_name)}
                  </div>
                  <div>
                    <div className="font-medium">{person.full_name}</div>
                    {person.phone && <div className="text-xs text-muted-foreground">{person.phone}</div>}
                    {person.position && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{person.position}</div>
                    )}
                    {person.facebook_account && (
                      <a
                        href={facebookHref(person.facebook_account)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block text-xs text-primary underline-offset-4 hover:underline"
                      >
                        Facebook
                      </a>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(person)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Edit contact"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge variant="amber">On call</Badge>
              </div>

              {person.notes && (
                <p className="mt-3 text-xs text-muted-foreground leading-relaxed">{person.notes}</p>
              )}

              <p className="mt-3 text-[11px] text-muted-foreground">Contact only — no login or app access.</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <OnCallStaffDialog
        open={adding}
        onClose={() => setAdding(false)}
        positions={positions}
        onSaved={async () => {
          setAdding(false);
          await onRefresh();
        }}
      />
      <OnCallStaffDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        positions={positions}
        person={editing}
        onSaved={async () => {
          setEditing(null);
          await onRefresh();
        }}
        onDelete={async () => {
          if (!editing) return;
          if (!confirm(`Remove "${editing.full_name}" from on-call contacts?`)) return;
          const { error } = await supabase.from("on_call_staff").delete().eq("id", editing.id);
          if (error) {
            alert(error.message);
            return;
          }
          setEditing(null);
          await onRefresh();
        }}
      />
    </>
  );
}

function OnCallStaffDialog({
  open,
  onClose,
  positions,
  person,
  onSaved,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  positions: EmpPosition[];
  person?: OnCallStaff | null;
  onSaved: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const supabase = createClient();
  const isEdit = !!person;
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    position: "",
    notes: "",
    facebook_account: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (person) {
      setForm({
        full_name: person.full_name || "",
        phone: person.phone || "",
        position: person.position || "",
        notes: person.notes || "",
        facebook_account: person.facebook_account || "",
      });
    } else {
      setForm({ full_name: "", phone: "", position: "", notes: "", facebook_account: "" });
    }
  }, [open, person]);

  function set(k: string, v: string | boolean) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const full_name = form.full_name.trim();
    if (!full_name) return alert("Name is required.");
    setBusy(true);
    const payload = {
      full_name,
      phone: form.phone.trim() || null,
      position: form.position.trim() || null,
      notes: form.notes.trim() || null,
      facebook_account: form.facebook_account.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = isEdit
      ? await supabase.from("on_call_staff").update(payload).eq("id", person!.id)
      : await supabase.from("on_call_staff").insert(payload);
    setBusy(false);
    if (error) {
      alert(error.message);
      return;
    }
    await onSaved();
  }

  const positionInList = positions.some((p) => p.name === form.position);
  const hasLegacy = form.position && !positionInList;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit on-call contact" : "Add on-call contact"}
      description="Contact details only — no email, password, or system access."
      size="md"
    >
      <form onSubmit={(e) => void save(e)} className="grid gap-3">
        <div>
          <Label>Full name</Label>
          <Input required value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div>
          <Label>Position / role</Label>
          <select className={selectClass} value={form.position} onChange={(e) => set("position", e.target.value)}>
            <option value="">— Select position —</option>
            {positions.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
            {hasLegacy && <option value={form.position}>{form.position} (legacy)</option>}
          </select>
        </div>
        <div>
          <Label>Facebook account</Label>
          <Input
            value={form.facebook_account}
            onChange={(e) => set("facebook_account", e.target.value)}
            placeholder="https://facebook.com/… or @username"
            autoComplete="off"
          />
        </div>
        <div>
          <Label>Notes</Label>
          <Input
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Optional — skills, availability, etc."
          />
        </div>
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          {isEdit && onDelete ? (
            <Button type="button" variant="destructive" size="sm" onClick={() => void onDelete()}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : isEdit ? "Save" : "Add"}
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
