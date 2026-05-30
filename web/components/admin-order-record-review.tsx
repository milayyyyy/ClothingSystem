"use client";

import { useRouter } from "next/navigation";
import { OrderRecordEditor } from "@/components/order-record-editor";
import type { OrderRecordAttachment, OrderRecordRow } from "@/lib/order-records";

type Props = {
  userId: string;
  record: OrderRecordRow;
  attachments: OrderRecordAttachment[];
};

export function AdminOrderRecordReview({ userId, record, attachments }: Props) {
  const router = useRouter();
  const backHref = "/admin/order-records";

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

  const submitterName =
    record.submitter?.full_name || record.submitter?.email || "Employee";

  return (
    <div className="space-y-4">
      {record.status === "submitted" && (
        <p className="text-sm text-muted-foreground">
          Submitted by <span className="font-medium text-foreground">{submitterName}</span>
          {" · "}Review attachments and usage sheets, then approve or reject. Deduct stock manually in Inventory.
        </p>
      )}
      <OrderRecordEditor
        mode="admin"
        userId={userId}
        record={record}
        initialAttachments={attachments}
        layout="page"
        readOnly
        onApprove={approve}
        onReject={reject}
      />
    </div>
  );
}
