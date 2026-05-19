"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { peso, formatDate } from "@/lib/utils";
import { ORDER_SERVICE_LABEL, ORDER_SERVICE_STAGES, normalizeOrderServiceStage } from "@/lib/order-services";
import { getOrderKind as getSalesChannel, orderHasTeamsSheet, orderTypeLabel } from "@/lib/sales";
import { Table2 } from "lucide-react";

const SUB_STAGES = [
  { v: "design_layout", label: "Design Layout" },
  { v: "printing", label: "Printing" },
  { v: "heatpress", label: "Heatpress" },
  { v: "cut_sew", label: "Cut & Sew" },
  { v: "quality_control", label: "QC & Packaging" },
  { v: "for_pickup", label: "For Pickup" },
] as const;

const SERVICE_STAGES = ORDER_SERVICE_STAGES.map((v) => ({
  v,
  label: ORDER_SERVICE_LABEL[v] || v,
}));

const FLOW_STATUS = ["pending", "printing", "sewing", "ready"] as const;

export function MyOrdersClient({ initial }: { initial: any[] }) {
  const supabase = createClient();
  const [list, setList] = useState(initial);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("orders").select("*").order("due_date", { ascending: true });
      if (error || cancelled || !data) return;
      setList(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function advanceStatus(o: any) {
    const idx = FLOW_STATUS.indexOf(o.status);
    const next = idx >= 0 && idx < FLOW_STATUS.length - 1 ? FLOW_STATUS[idx + 1] : "ready";
    const { data } = await supabase.from("orders").update({ status: next, updated_at: new Date().toISOString() }).eq("id", o.id).select().single();
    if (data) setList((prev) => prev.map((x) => (x.id === o.id ? data : x)));
  }

  async function setStage(o: any, stage: string) {
    const { data } = await supabase.from("orders").update({ sub_stage: stage, updated_at: new Date().toISOString() }).eq("id", o.id).select().single();
    if (data) setList((prev) => prev.map((x) => (x.id === o.id ? data : x)));
  }

  async function setServiceStage(o: any, stage: string) {
    const { data } = await supabase.from("orders").update({ stage, updated_at: new Date().toISOString() }).eq("id", o.id).select().single();
    if (data) setList((prev) => prev.map((x) => (x.id === o.id ? data : x)));
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {list.map((o) => {
        const ch = getSalesChannel(o);
        const showSheet = orderHasTeamsSheet(o);
        const isSub = ch === "sublimation";
        const stageIdx = SUB_STAGES.findIndex((s) => s.v === o.sub_stage);
        const svcNorm = normalizeOrderServiceStage(o.stage);
        const svcIdx = SERVICE_STAGES.findIndex((s) => s.v === svcNorm);
        return (
          <Card key={o.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-mono text-xs text-muted-foreground">#{o.order_no}</div>
                  <div className="font-semibold">{o.customer_name}</div>
                  {o.customer_phone && <div className="text-xs text-muted-foreground">{o.customer_phone}</div>}
                </div>
                <Badge
                  variant={
                    isSub ? "teal" : ch === "online" ? "purple" : ch === "services" ? "amber" : "blue"
                  }
                >
                  {orderTypeLabel(ch)}
                </Badge>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-muted-foreground">Quantity</dt><dd>{o.quantity}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Total</dt><dd>{peso(o.total)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Due</dt><dd>{formatDate(o.due_date)}</dd></div>
              </dl>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <dt className="mb-1 text-xs text-muted-foreground">Status</dt>
                  <StatusBadge status={o.status} />
                </div>
                {showSheet && (
                  <Link
                    href={`/employee/orders/${o.id}/teams`}
                    className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Table2 className="mr-1.5 h-3.5 w-3.5" />
                    View sheet
                  </Link>
                )}
              </div>

              {isSub && (
                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sublimation Process</div>
                  <div className="space-y-1.5">
                    {SUB_STAGES.map((s, i) => {
                      const done = stageIdx > i;
                      const active = stageIdx === i;
                      return (
                        <button
                          key={s.v}
                          onClick={() => setStage(o, s.v)}
                          className={
                            "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm " +
                            (active ? "border-primary bg-primary/5" : done ? "border-emerald-300/40 bg-emerald-500/5 text-muted-foreground" : "hover:bg-accent")
                          }
                        >
                          <span className={"flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " + (done ? "bg-emerald-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted")}>{i + 1}</span>
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!isSub && (
                <div className="mt-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Services</div>
                  <div className="space-y-1.5">
                    {SERVICE_STAGES.map((s, i) => {
                      const done = svcIdx > i;
                      const active = svcIdx === i;
                      return (
                        <button
                          key={s.v}
                          type="button"
                          onClick={() => setServiceStage(o, s.v)}
                          className={
                            "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm " +
                            (active ? "border-primary bg-primary/5" : done ? "border-emerald-300/40 bg-emerald-500/5 text-muted-foreground" : "hover:bg-accent")
                          }
                        >
                          <span
                            className={
                              "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                              (done ? "bg-emerald-500 text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted")
                            }
                          >
                            {i + 1}
                          </span>
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {!isSub && !["ready", "delivered", "cancelled"].includes(o.status) && (
                <Button size="sm" className="mt-4 w-full" onClick={() => advanceStatus(o)}>
                  Advance to {FLOW_STATUS[Math.min(FLOW_STATUS.length - 1, FLOW_STATUS.indexOf(o.status) + 1)]}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
      {list.length === 0 && <p className="text-sm text-muted-foreground">No orders assigned.</p>}
    </div>
  );
}
