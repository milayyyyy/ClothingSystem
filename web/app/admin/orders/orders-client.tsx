"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { peso, formatDate } from "@/lib/utils";
import { Pencil, Plus, Trash2 } from "lucide-react";

type Order = any;
type Emp = { id: string; full_name: string; email: string };

const KINDS = [
  { v: "local", label: "Local Order", hint: "Walk-in / Facebook Marketplace", variant: "blue" },
  { v: "online", label: "Online Order", hint: "Shopee / TikTok Shop", variant: "purple" },
  { v: "sublimation", label: "Sublimation Order", hint: "Full sublimation pipeline", variant: "teal" },
] as const;

const SUB_STAGES = [
  { v: "design_layout", label: "Design & Layout" },
  { v: "printing", label: "Printing" },
  { v: "heatpress", label: "Heatpress" },
  { v: "cut_sew", label: "Cut & Sew" },
  { v: "reprint_error", label: "Reprint Error" },
  { v: "quality_control", label: "Packaging & Quality Control" },
] as const;

const LOCAL_STAGES = ["preparing", "packing_qc", "for_pickup", "shipped", "complete"] as const;
const ONLINE_STAGES = ["preparing", "packing_qc", "for_pickup", "shipped"] as const;
const SYSTEM_STATUSES = ["pending", "printing", "sewing", "ready", "delivered", "cancelled"] as const;

const STAGE_LABEL: Record<string, string> = {
  preparing: "Preparing",
  packing_qc: "Packing & Quality Control",
  for_pickup: "For Pick up",
  shipped: "Shipped",
  complete: "Complete",
};

function stageOptions(kind: "local" | "online" | "sublimation") {
  if (kind === "online") return ONLINE_STAGES;
  if (kind === "local") return LOCAL_STAGES;
  return [] as const;
}

function getOrderKind(order: any): "local" | "online" | "sublimation" {
  const raw = String(order?.kind ?? order?.order_type ?? "local").toLowerCase().trim();
  if (raw === "online" || raw === "sublimation") return raw;
  return "local";
}

export function OrdersClient({ initialOrders, employees }: { initialOrders: Order[]; employees: Emp[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [stageFilter, setStageFilter] = useState<"all" | string>("all");
  const [kindFilter, setKindFilter] = useState<string>(params.get("type") || "local");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);

  useEffect(() => {
    setKindFilter(params.get("type") || "local");
  }, [params]);

  function selectKind(k: string) {
    setKindFilter(k);
    setStageFilter("all");
    const url = `/admin/orders?type=${k}`;
    router.replace(url);
  }

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const k = getOrderKind(o);
      if (k !== kindFilter) return false;

      if (stageFilter !== "all") {
        if (k === "sublimation") {
          if (String(o.sub_stage || "") !== stageFilter) return false;
        } else {
          if (String(o.stage || "preparing") !== stageFilter) return false;
        }
      }

      if (search) {
        const s = search.toLowerCase();
        if (!o.customer_name.toLowerCase().includes(s) && !String(o.order_no).includes(s)) return false;
      }
      return true;
    });
  }, [orders, kindFilter, stageFilter, search]);

  async function refresh() {
    const { data } = await supabase.from("orders").select("*, assigned:assigned_to(id, full_name, email)").order("created_at", { ascending: false });
    setOrders(data || []);
  }
  async function remove(id: string) {
    if (!confirm("Delete this order?")) return;
    await supabase.from("orders").delete().eq("id", id);
    refresh();
  }

  const TABS = [
    { v: "local", label: "Local" },
    { v: "online", label: "Online" },
    { v: "sublimation", label: "Sublimation" },
  ] as const;

  return (
    <>
      {/* Tab bar */}
      <div className="mb-4 border-b">
        <div className="flex flex-wrap items-end gap-1">
          {TABS.map((t) => {
            const active = kindFilter === t.v;
            return (
              <button
                key={t.v}
                onClick={() => selectKind(t.v)}
                className={
                  "relative px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2 " +
                  (active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground")
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status filters + search + new order */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            const k = kindFilter as "local" | "online" | "sublimation";
            const pills: Array<{ v: string; label: string }> = [{ v: "all", label: "All" }];
            if (k === "sublimation") {
              SUB_STAGES.forEach((s) => pills.push({ v: s.v, label: s.label }));
            } else {
              stageOptions(k).forEach((v) => pills.push({ v, label: STAGE_LABEL[v] || v }));
            }
            return pills.map((p) => (
              <button
                key={p.v}
                onClick={() => setStageFilter(p.v)}
                className={
                  "rounded-full border px-3 py-1 text-xs transition-colors " +
                  (stageFilter === p.v ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent")
                }
              >
                {p.label}
              </button>
            ));
          })()}
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Search customer or #" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-1 h-4 w-4" /> New Order</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">#</th>
                <th className="text-left font-medium">Customer</th>
                <th className="text-left font-medium">Type</th>
                <th className="text-left font-medium">Stage</th>
                <th className="text-left font-medium">Qty</th>
                <th className="text-left font-medium">Total</th>
                <th className="text-left font-medium">Balance</th>
                <th className="text-left font-medium">Status</th>
                <th className="text-left font-medium">Assigned</th>
                <th className="text-left font-medium">Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const balance = Number(o.total) - Number(o.down_payment || 0);
                const k = KINDS.find((x) => x.v === getOrderKind(o)) || KINDS[0];
                const isSub = getOrderKind(o) === "sublimation";
                const stage = isSub ? SUB_STAGES.find((s) => s.v === o.sub_stage) : null;
                const stageLabel = isSub
                  ? (stage?.label || "—")
                  : (STAGE_LABEL[String(o.stage || "preparing")] || "—");
                return (
                  <tr key={o.id} className="border-t row-hover hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">#{o.order_no}</td>
                    <td>
                      <div className="font-medium">{o.customer_name}</div>
                      <div className="mt-0.5 space-y-0.5 text-[11px] text-muted-foreground">
                        {o.customer_social && <div>{o.customer_social}</div>}
                        {o.customer_phone && <div>{o.customer_phone}</div>}
                        {o.customer_email && <div>{o.customer_email}</div>}
                      </div>
                    </td>
                    <td><Badge variant={k.variant as any}>{k.label.split(" ")[0]}</Badge></td>
                    <td className="text-xs">{stageLabel}</td>
                    <td>{o.quantity}</td>
                    <td>{peso(o.total)}</td>
                    <td>{peso(balance)}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="text-xs text-muted-foreground">{o.assigned?.full_name || "—"}</td>
                    <td className="text-xs">{formatDate(o.due_date)}</td>
                    <td className="pr-3 text-right">
                      <button onClick={() => { setEditing(o); setOpen(true); }} className="mr-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(o.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">No orders match.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <OrderForm open={open} onClose={() => setOpen(false)} order={editing} employees={employees} onSaved={refresh} />
    </>
  );
}

function OrderForm({ open, onClose, order, employees, onSaved }: { open: boolean; onClose: () => void; order: Order | null; employees: Emp[]; onSaved: () => void }) {
  const supabase = createClient();
  const empty = useMemo(() => ({
    customer_name: "", customer_phone: "", customer_email: "", customer_social: "",
    kind: "local", source: "", stage: "preparing", sub_stage: null,
    quantity: 1, unit_price: 0, down_payment: 0, status: "pending",
    due_date: "", design_ref: "", notes: "", assigned_to: ""
  }), []);

  const [form, setForm] = useState<any>(() => order || empty);
  const [saving, setSaving] = useState(false);
  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }

  useEffect(() => {
    if (!open) return;
    if (order) setForm({ ...order, kind: getOrderKind(order) });
    else setForm(empty);
  }, [open, order, empty]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    const kind = getOrderKind(form);
    const payload = {
      ...form,
      assigned_to: form.assigned_to || null,
      due_date: form.due_date || null,
      stage: kind === "sublimation" ? null : (form.stage || "preparing"),
      sub_stage: kind === "sublimation" ? (form.sub_stage || "design_layout") : null,
      // legacy column for compatibility
      order_type: kind,
    };
    if (order) await supabase.from("orders").update(payload).eq("id", order.id);
    else await supabase.from("orders").insert(payload);
    setSaving(false); onClose(); onSaved();
  }

  const total = Number(form.quantity || 0) * Number(form.unit_price || 0);
  const balance = total - Number(form.down_payment || 0);

  return (
    <Dialog open={open} onClose={onClose} title={order ? `Edit Order #${order.order_no}` : "New Order"} size="xl">
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Order type</Label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {KINDS.map((k) => (
              <button type="button" key={k.v} onClick={() => set("kind", k.v)} className={"rounded-md border p-3 text-left text-xs " + (form.kind === k.v ? "border-primary bg-primary/5" : "hover:bg-accent")}>
                <div className="text-sm font-medium">{k.label}</div>
                <div className="text-[11px] text-muted-foreground">{k.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {form.kind !== "local" && (
          <div className="col-span-2">
            <Label>{form.kind === "online" ? "Platform" : "Source"}</Label>
            <Input placeholder={form.kind === "online" ? "Shopee / TikTok Shop / Lazada" : "Facebook / Walk-in / Referral"} value={form.source || ""} onChange={(e) => set("source", e.target.value)} />
          </div>
        )}

        {form.kind === "sublimation" && (
          <div className="col-span-2">
            <Label>Sublimation Stage</Label>
            <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.sub_stage || "design_layout"} onChange={(e) => set("sub_stage", e.target.value)}>
              {SUB_STAGES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
            </select>
          </div>
        )}

        {form.kind !== "sublimation" && (
          <div className="col-span-2">
            <Label>Stage</Label>
            <select
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              value={form.stage || "preparing"}
              onChange={(e) => set("stage", e.target.value)}
            >
              {stageOptions(getOrderKind(form)).map((v) => (
                <option key={v} value={v}>{STAGE_LABEL[v] || v}</option>
              ))}
            </select>
          </div>
        )}

        <div className="col-span-2 mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</div>
        <div><Label>Customer name</Label><Input required value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} /></div>
        <div><Label>Phone</Label><Input value={form.customer_phone || ""} onChange={(e) => set("customer_phone", e.target.value)} /></div>
        <div><Label>Email</Label><Input type="email" value={form.customer_email || ""} onChange={(e) => set("customer_email", e.target.value)} /></div>
        <div><Label>Social media</Label><Input placeholder="@username / FB profile" value={form.customer_social || ""} onChange={(e) => set("customer_social", e.target.value)} /></div>

        <div className="col-span-2 mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order details</div>
        <div><Label>Status</Label>
          <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.status} onChange={(e) => set("status", e.target.value)}>
            {SYSTEM_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><Label>Assigned to</Label>
          <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.assigned_to || ""} onChange={(e) => set("assigned_to", e.target.value)}>
            <option value="">— Unassigned —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.email}</option>)}
          </select>
        </div>
        <div><Label>Quantity</Label><Input type="number" min={1} value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} /></div>
        <div><Label>Unit price (₱)</Label><Input type="number" min={0} step="0.01" value={form.unit_price} onChange={(e) => set("unit_price", Number(e.target.value))} /></div>
        <div><Label>Down payment (₱)</Label><Input type="number" min={0} step="0.01" value={form.down_payment} onChange={(e) => set("down_payment", Number(e.target.value))} /></div>
        <div><Label>Due date</Label><Input type="date" value={form.due_date || ""} onChange={(e) => set("due_date", e.target.value)} /></div>
        <div className="col-span-2"><Label>Design reference</Label><Input value={form.design_ref || ""} onChange={(e) => set("design_ref", e.target.value)} /></div>
        <div className="col-span-2"><Label>Notes</Label><textarea className="min-h-[60px] w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></div>

        <div className="col-span-2 rounded-md bg-muted/40 p-3 text-sm">
          Total: <b>{peso(total)}</b> &nbsp;·&nbsp; Balance: <b>{peso(balance)}</b>
        </div>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
