"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { OrderRecordEditor } from "@/components/order-record-editor";
import {
  parseUsageSheets,
  usageSheetsSummary,
  type OrderRecordAttachment,
  type OrderRecordRow,
  type OrderRecordStatus,
} from "@/lib/order-records";
import { ClipboardList, Plus } from "lucide-react";

const STATUS_LABEL: Record<OrderRecordStatus, string> = {
  draft: "Draft",
  submitted: "Pending review",
  approved: "Approved",
  rejected: "Rejected",
};

function statusVariant(s: OrderRecordStatus): "default" | "green" | "red" | "outline" | "amber" {
  if (s === "submitted") return "amber";
  if (s === "approved") return "green";
  if (s === "rejected") return "red";
  return "outline";
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type ProfileBrief = { id: string; full_name: string | null; email: string };

type Props = {
  mode: "employee" | "admin";
  userId: string;
  initialRecords: OrderRecordRow[];
  initialAttachments: OrderRecordAttachment[];
  submitters: ProfileBrief[];
};

export function OrderRecordsClient({
  mode,
  userId,
  initialRecords,
  initialAttachments,
  submitters,
}: Props) {
  const router = useRouter();
  const submitterMap = useMemo(() => new Map(submitters.map((p) => [p.id, p])), [submitters]);
  const enrichRecord = useCallback(
    (r: OrderRecordRow): OrderRecordRow => ({
      ...r,
      submitter: r.submitter ?? submitterMap.get(r.submitted_by) ?? null,
    }),
    [submitterMap],
  );
  const [records, setRecords] = useState(initialRecords.map(enrichRecord));
  const [filter, setFilter] = useState<"all" | "pending">(mode === "admin" ? "pending" : "all");
  const [reviewing, setReviewing] = useState<OrderRecordRow | null>(null);

  const attByRecord = useMemo(() => {
    const m = new Map<string, OrderRecordAttachment[]>();
    for (const a of initialAttachments) {
      if (!m.has(a.record_id)) m.set(a.record_id, []);
      m.get(a.record_id)!.push(a);
    }
    return m;
  }, [initialAttachments]);

  const filtered = useMemo(() => {
    let list = [...records];
    if (mode === "employee") {
      list = list.filter((r) => r.submitted_by === userId);
    }
    if (filter === "pending") {
      list = list.filter((r) => r.status === "submitted");
    }
    return list.sort((a, b) => (b.record_date > a.record_date ? 1 : -1));
  }, [records, filter, mode, userId]);

  const canEditRecord = (r: OrderRecordRow) =>
    (r.status === "draft" || r.status === "rejected") && r.submitted_by === userId;

  const recordHref = (r: OrderRecordRow) =>
    mode === "employee" ? `/employee/order-records/${r.id}` : undefined;

  async function approve(id: string) {
    const res = await fetch(`/api/order-records/${id}/approve`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { alert(json.error || "Approve failed"); return; }
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: "approved" as const, reviewed_at: new Date().toISOString(), reviewed_by: userId }
          : r,
      ),
    );
    setReviewing(null);
    router.refresh();
  }

  async function reject(id: string) {
    const reason = window.prompt("Rejection reason (optional):") ?? "";
    const res = await fetch(`/api/order-records/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { alert(json.error || "Reject failed"); return; }
    setRecords((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: "rejected" as const, rejection_reason: reason || null, reviewed_at: new Date().toISOString() }
          : r,
      ),
    );
    setReviewing(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {mode === "admin" ? (
          <div className="flex gap-1 rounded-lg border p-0.5">
            {(["pending", "all"] as const).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => setFilter(f)}
              >
                {f === "pending" ? "Pending review" : "All records"}
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Submit order PDFs/photos and fill in usage sheets. Admin reviews and deducts stock manually.
          </p>
        )}
        {mode === "employee" && (
          <Link
            href="/employee/order-records/new"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> New record
          </Link>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <ClipboardList className="h-10 w-10 opacity-30" />
            <p className="text-sm">No order records yet.</p>
            {mode === "employee" && (
              <Link
                href="/employee/order-records/new"
                className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
              >
                Create your first record
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const atts = attByRecord.get(r.id) || [];
            const name = r.submitter?.full_name || r.submitter?.email || (mode === "employee" ? "You" : "Employee");
            const href = recordHref(r);
            const inner = (
              <>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.title || "Order record"}</span>
                    <Badge variant={statusVariant(r.status)}>{STATUS_LABEL[r.status]}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {fmtDate(r.record_date)}
                    {mode === "admin" && ` · ${name}`}
                    {` · ${usageSheetsSummary(parseUsageSheets(r.stock_lines))}`}
                    {atts.length > 0 && ` · ${atts.length} file(s)`}
                  </div>
                </div>
                {mode === "admin" && r.status === "submitted" && (
                  <span className="text-xs text-primary">Review →</span>
                )}
                {mode === "employee" && canEditRecord(r) && (
                  <span className="text-xs text-primary">Edit →</span>
                )}
              </>
            );

            if (mode === "employee" && href) {
              return (
                <Link
                  key={r.id}
                  href={href}
                  className="flex w-full flex-col gap-1 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  {inner}
                </Link>
              );
            }

            return (
              <button
                key={r.id}
                type="button"
                className="flex w-full flex-col gap-1 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                onClick={() => setReviewing(r)}
              >
                {inner}
              </button>
            );
          })}
        </div>
      )}

      {mode === "admin" && reviewing && (
        <Dialog open onClose={() => setReviewing(null)} title="Review order record" size="lg">
          <OrderRecordEditor
            mode="admin"
            userId={userId}
            record={reviewing}
            initialAttachments={attByRecord.get(reviewing.id) || []}
            layout="embedded"
            onClose={() => setReviewing(null)}
            onApprove={approve}
            onReject={reject}
          />
        </Dialog>
      )}
    </div>
  );
}
