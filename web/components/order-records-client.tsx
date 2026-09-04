"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  parseUsageSheets,
  usageSheetsSummary,
  type OrderRecordAttachment,
  type OrderRecordRow,
  type OrderRecordStatus,
} from "@/lib/order-records";
import { createClient } from "@/lib/supabase/client";
import { ClipboardList, Plus, Trash2 } from "lucide-react";

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
  /** Role of the viewer — only admins can delete approved records. */
  viewerRole?: string;
  initialRecords: OrderRecordRow[];
  initialAttachments: OrderRecordAttachment[];
  submitters: ProfileBrief[];
};

export function OrderRecordsClient({
  mode,
  userId,
  viewerRole = "manager",
  initialRecords,
  initialAttachments,
  submitters,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAdmin = viewerRole === "admin";

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
    mode === "employee"
      ? `/employee/order-records/${r.id}`
      : `/admin/order-records/${r.id}`;

  async function handleDelete(r: OrderRecordRow) {
    const label = r.title || "Order record";
    const confirmed = window.confirm(
      `Delete "${label}" (${fmtDate(r.record_date)})?\n\nThis will permanently remove the record and all its attachments. This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingId(r.id);
    const { error } = await supabase.from("order_records").delete().eq("id", r.id);
    setDeletingId(null);

    if (error) {
      alert(error.message);
      return;
    }

    // Remove from local state immediately
    setRecords((prev) => prev.filter((x) => x.id !== r.id));
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
            const isDeleting = deletingId === r.id;
            const canDelete = isAdmin && mode === "admin";

            return (
              <div
                key={r.id}
                className="flex w-full flex-col gap-1 rounded-lg border px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
              >
                {/* Left: info — clicking this navigates to the record */}
                <Link href={href} className="flex-1 min-w-0">
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
                </Link>

                {/* Right: actions */}
                <div className="flex shrink-0 items-center gap-3">
                  {mode === "admin" && (
                    <Link href={href} className="text-xs text-primary">
                      {r.status === "submitted" ? "Review →" : "View →"}
                    </Link>
                  )}
                  {mode === "employee" && canEditRecord(r) && (
                    <Link href={href} className="text-xs text-primary">Edit →</Link>
                  )}
                  {mode === "employee" && !canEditRecord(r) && (
                    <Link href={href} className="text-xs text-primary">View →</Link>
                  )}
                  {canDelete && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={isDeleting}
                      onClick={(e) => {
                        e.preventDefault();
                        void handleDelete(r);
                      }}
                      title="Delete this record"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
