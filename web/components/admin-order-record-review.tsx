"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OrderRecordEditor } from "@/components/order-record-editor";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { OrderRecordAttachment, OrderRecordRow } from "@/lib/order-records";

type Props = {
  userId: string;
  viewerRole?: string;
  record: OrderRecordRow;
  attachments: OrderRecordAttachment[];
};

export function AdminOrderRecordReview({ userId, viewerRole = "manager", record, attachments }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const backHref = "/admin/order-records";
  const isAdmin = viewerRole === "admin";
  const [deleting, setDeleting] = useState(false);

  async function approve(id: string) {
    const res = await fetch(`/api/order-records/${id}/approve`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || "Approve failed");
      return;
    }
    router.push(backHref);
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
    if (!res.ok) {
      alert(json.error || "Reject failed");
      return;
    }
    router.push(backHref);
    router.refresh();
  }

  async function handleDelete() {
    const label = record.title || "Order record";
    const confirmed = window.confirm(
      `Delete "${label}"?\n\nThis will permanently remove the record and all its attachments. This cannot be undone.`,
    );
    if (!confirmed) return;
    setDeleting(true);
    const { error } = await supabase.from("order_records").delete().eq("id", record.id);
    setDeleting(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.push(backHref);
    router.refresh();
  }

  const submitterName =
    record.submitter?.full_name || record.submitter?.email || "Employee";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {record.status === "submitted" ? (
            <>
              Submitted by <span className="font-medium text-foreground">{submitterName}</span>
              {" · "}
              You can edit the record below, then save changes and approve or reject. Deduct stock manually in
              Inventory.
            </>
          ) : (
            <>
              Record by <span className="font-medium text-foreground">{submitterName}</span>
              {" · "}
              You can edit and save changes. Status: {record.status}.
            </>
          )}
        </p>
        {isAdmin && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="shrink-0"
            disabled={deleting}
            onClick={() => void handleDelete()}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
            {deleting ? "Deleting…" : "Delete record"}
          </Button>
        )}
      </div>
      <OrderRecordEditor
        mode="admin"
        userId={userId}
        record={record}
        initialAttachments={attachments}
        layout="page"
        onApprove={approve}
        onReject={reject}
      />
    </div>
  );
}
