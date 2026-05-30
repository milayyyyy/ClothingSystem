"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrderRecordManualSheet } from "@/components/order-record-manual-sheet";
import {
  ORDER_RECORD_BUCKET,
  attachmentKind,
  emptyUsageSheet,
  parseUsageSheets,
  type ManualUsageSheet,
  type OrderRecordAttachment,
  type OrderRecordRow,
} from "@/lib/order-records";
import { OrderRecordAttachments } from "@/components/order-record-attachments";
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from "lucide-react";

type Props = {
  mode: "employee" | "admin";
  userId: string;
  record: OrderRecordRow | null;
  initialAttachments: OrderRecordAttachment[];
  /** Full page: back link + redirect after submit. Embedded: parent handles close. */
  layout?: "page" | "embedded";
  readOnly?: boolean;
  onClose?: () => void;
  onSaved?: (record: OrderRecordRow) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
};

export function OrderRecordEditor({
  mode,
  userId,
  record: initialRecord,
  initialAttachments,
  layout = "page",
  readOnly: readOnlyProp,
  onClose,
  onSaved,
  onApprove,
  onReject,
}: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [record, setRecord] = useState(initialRecord);
  const [attachments, setAttachments] = useState(
    initialAttachments.filter((a) => !initialRecord || a.record_id === initialRecord.id),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState(initialRecord?.title || "");
  const [recordDate, setRecordDate] = useState(
    initialRecord?.record_date || new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(initialRecord?.notes || "");
  const [usageSheets, setUsageSheets] = useState<ManualUsageSheet[]>(() => {
    const sheets = initialRecord ? parseUsageSheets(initialRecord.stock_lines) : [];
    return sheets.length > 0 ? sheets : [emptyUsageSheet()];
  });

  const canEditRecord =
    !record || ((record.status === "draft" || record.status === "rejected") && record.submitted_by === userId);

  const editorReadOnly =
    readOnlyProp ??
    (mode === "admin"
      ? !!record && (record.status === "submitted" || record.status === "approved")
      : !!record && !canEditRecord);

  const canEditForm = !editorReadOnly;
  const backHref = mode === "employee" ? "/employee/order-records" : "/admin/order-records";

  const saveDraft = async (): Promise<OrderRecordRow | null> => {
    setBusy(true);
    setErr(null);
    const payload = {
      record_date: recordDate,
      title: title.trim() || null,
      notes: notes.trim() || null,
      stock_lines: usageSheets,
      status: "draft" as const,
      updated_at: new Date().toISOString(),
    };

    if (record) {
      const { data, error } = await supabase
        .from("order_records")
        .update(payload)
        .eq("id", record.id)
        .select("*")
        .single();
      setBusy(false);
      if (error) { setErr(error.message); return null; }
      const row = mapRecord(data);
      setRecord(row);
      onSaved?.(row);
      if (layout === "page" && mode === "employee" && !initialRecord) {
        router.replace(`/employee/order-records/${row.id}`);
      }
      return row;
    }

    const { data, error } = await supabase
      .from("order_records")
      .insert({ ...payload, submitted_by: userId })
      .select("*")
      .single();
    setBusy(false);
    if (error) { setErr(error.message); return null; }
    const row = mapRecord(data);
    setRecord(row);
    onSaved?.(row);
    if (layout === "page" && mode === "employee") {
      router.replace(`/employee/order-records/${row.id}`);
    }
    return row;
  };

  const submitRecord = async () => {
    setBusy(true);
    setErr(null);
    const saved = await saveDraft();
    if (!saved) { setBusy(false); return; }
    const { data, error } = await supabase
      .from("order_records")
      .update({ status: "submitted", updated_at: new Date().toISOString() })
      .eq("id", saved.id)
      .select("*")
      .single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (layout === "page") {
      router.push(backHref);
      router.refresh();
      return;
    }
    onClose?.();
    router.refresh();
  };

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    setErr(null);
    let recordId = record?.id;
    if (!recordId) {
      const saved = await saveDraft();
      if (!saved) { setUploading(false); return; }
      recordId = saved.id;
    }
    for (const file of list) {
      if (!attachmentKind(file)) {
        setErr("Only PDF and image files are allowed.");
        continue;
      }
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/order-records/${recordId}/attachments`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(json.error || "Upload failed");
        break;
      }
      if (json.attachment) {
        setAttachments((prev) => [...prev, json.attachment as OrderRecordAttachment]);
      }
    }
    setUploading(false);
  };

  const removeAttachment = async (att: OrderRecordAttachment) => {
    if (!canEditForm) return;
    await supabase.storage.from(ORDER_RECORD_BUCKET).remove([att.path]);
    await supabase.from("order_record_attachments").delete().eq("id", att.id);
    setAttachments((prev) => prev.filter((a) => a.id !== att.id));
  };

  const openAttachment = useCallback(async (path: string) => {
    const { data, error } = await supabase.storage.from(ORDER_RECORD_BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      alert(error?.message || "Could not open file");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }, [supabase]);

  const handleClose = () => {
    if (onClose) onClose();
    else router.push(backHref);
  };

  const formTitle = !record
    ? "New order record"
    : editorReadOnly
      ? "View record"
      : "Edit record";

  return (
    <div className="space-y-6">
      {layout === "page" && (
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground -ml-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">{formTitle}</h1>
        </div>
      )}

      <div className="space-y-4 rounded-lg border bg-card p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Record date</Label>
            <Input
              type="date"
              className="mt-1"
              value={recordDate}
              onChange={(e) => setRecordDate(e.target.value)}
              disabled={editorReadOnly}
            />
          </div>
          <div>
            <Label>Title (optional)</Label>
            <Input
              className="mt-1"
              placeholder="e.g. Walk-in orders May 29"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={editorReadOnly}
            />
          </div>
        </div>

        <div>
          <Label>Notes</Label>
          <Input
            className="mt-1"
            placeholder="Summary for admin…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={editorReadOnly}
          />
        </div>

        <OrderRecordAttachments
          attachments={attachments}
          onUpload={uploadFiles}
          onRemove={removeAttachment}
          onOpen={openAttachment}
          onError={setErr}
          readOnly={!canEditForm}
          disabled={busy}
          uploading={uploading}
        />

        <OrderRecordManualSheet sheets={usageSheets} onChange={setUsageSheets} readOnly={!canEditForm} />

        {record?.status === "rejected" && record.rejection_reason && (
          <p className="text-sm text-destructive">Rejected: {record.rejection_reason}</p>
        )}

        {err && <p className="text-sm text-destructive">{err}</p>}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={handleClose}>
            {layout === "page" ? "Cancel" : "Close"}
          </Button>

          {mode === "admin" && record?.status === "submitted" && onReject && onApprove && (
            <>
              <Button variant="outline" className="gap-1.5 text-destructive" disabled={busy} onClick={() => onReject(record.id)}>
                <XCircle className="h-4 w-4" /> Reject
              </Button>
              <Button className="gap-1.5" disabled={busy} onClick={() => onApprove(record.id)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Mark approved
              </Button>
            </>
          )}

          {canEditForm && (
            <>
              <Button variant="outline" disabled={busy || uploading} onClick={() => void saveDraft()}>
                Save draft
              </Button>
              <Button disabled={busy || uploading} onClick={() => void submitRecord()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit for review"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function mapRecord(data: Record<string, unknown>): OrderRecordRow {
  return {
    id: data.id as string,
    submitted_by: data.submitted_by as string,
    record_date: data.record_date as string,
    title: (data.title as string) || null,
    notes: (data.notes as string) || null,
    status: data.status as OrderRecordRow["status"],
    stock_lines: parseUsageSheets(data.stock_lines),
    reviewed_by: (data.reviewed_by as string) || null,
    reviewed_at: (data.reviewed_at as string) || null,
    rejection_reason: (data.rejection_reason as string) || null,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
    submitter: null,
  };
}
