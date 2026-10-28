"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  employeeCanEditOrderRecord,
  parseDriverReturns,
  parseOrderRecordSource,
  parseUsageSheets,
  type DriverReturnPick,
  type ManualUsageSheet,
  type OrderRecordAttachment,
  type OrderRecordRow,
  type OrderRecordSource,
} from "@/lib/order-records";
import { OrderRecordAttachments } from "@/components/order-record-attachments";
import { OrderRecordBigSellerImport } from "@/components/order-record-bigseller-import";
import { OrderRecordDriverReturns } from "@/components/order-record-driver-returns";
import { prepareStorageUpload } from "@/lib/compress-image";
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
  const persistLock = useRef<Promise<OrderRecordRow | null> | null>(null);

  useEffect(() => {
    const preventNav = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener("dragover", preventNav);
    window.addEventListener("drop", preventNav);
    return () => {
      window.removeEventListener("dragover", preventNav);
      window.removeEventListener("drop", preventNav);
    };
  }, []);

  const syncRecordUrl = (id: string) => {
    if (layout !== "page" || typeof window === "undefined") return;
    const next = `${backHref}/${id}`;
    if (window.location.pathname !== next) {
      window.history.replaceState(window.history.state, "", next);
    }
  };

  const [title, setTitle] = useState(initialRecord?.title || "");
  const [recordDate, setRecordDate] = useState(
    initialRecord?.record_date || new Date().toISOString().slice(0, 10),
  );
  const [source, setSource] = useState<OrderRecordSource>(
    parseOrderRecordSource(initialRecord?.source),
  );
  const [notes, setNotes] = useState(initialRecord?.notes || "");
  const isNote = source === "note";
  const [usageSheets, setUsageSheets] = useState<ManualUsageSheet[]>(() => {
    const sheets = initialRecord ? parseUsageSheets(initialRecord.stock_lines) : [];
    return sheets.length > 0 ? sheets : [emptyUsageSheet()];
  });
  const [driverReturns, setDriverReturns] = useState<DriverReturnPick[]>(
    () => parseDriverReturns(initialRecord?.driver_returns),
  );

  const employeeCanEdit =
    !record || employeeCanEditOrderRecord(record.status, record.submitted_by, userId);

  const editorReadOnly =
    readOnlyProp ?? (mode === "admin" ? false : !!record && !employeeCanEdit);

  const canEditForm = !editorReadOnly;
  const backHref = mode === "employee" ? "/employee/order-records" : "/admin/order-records";
  const creatingOrOpen = !record || record.status === "draft" || record.status === "rejected";
  const employeePending = mode === "employee" && record?.status === "submitted";

  const saveDraft = async (opts?: { navigate?: boolean }): Promise<OrderRecordRow | null> => {
    if (persistLock.current) return persistLock.current;

    const run = (async (): Promise<OrderRecordRow | null> => {
      setBusy(true);
      setErr(null);
      const payload: Record<string, unknown> = {
        record_date: recordDate,
        title: title.trim() || (isNote ? "Daily order note" : null),
        notes: notes.trim() || null,
        source,
        stock_lines: isNote ? [] : usageSheets,
        driver_returns: isNote ? [] : driverReturns,
        updated_at: new Date().toISOString(),
      };
      if (mode !== "admin" && record?.status !== "submitted") {
        payload.status = "draft";
      }

      const applyRow = (raw: Record<string, unknown>) => {
        const row = mapRecord(raw);
        if (!row.id) {
          setErr("Could not save this record.");
          return null;
        }
        setRecord(row);
        if ("driver_returns" in raw) {
          setDriverReturns(parseDriverReturns(raw.driver_returns));
        }
        onSaved?.(row);
        syncRecordUrl(row.id);
        return row;
      };

      if (record) {
        const updated = await writeRecord("update", payload, record.id);
        setBusy(false);
        if (!updated) return null;
        const row = applyRow(updated);
        if (row && opts?.navigate !== false && layout === "page" && mode === "admin") {
          router.refresh();
        }
        return row;
      }

      const inserted = await writeRecord("insert", { ...payload, submitted_by: userId });
      setBusy(false);
      if (!inserted) return null;
      return applyRow(inserted);
    })();

    persistLock.current = run;
    try {
      return await run;
    } finally {
      persistLock.current = null;
    }
  };

  const writeRecord = async (
    kind: "update" | "insert",
    payload: Record<string, unknown>,
    recordId?: string,
  ): Promise<Record<string, unknown> | null> => {
    const attempt = async (body: Record<string, unknown>) => {
      if (kind === "update" && recordId) {
        return supabase.from("order_records").update(body).eq("id", recordId).select("*").single();
      }
      return supabase.from("order_records").insert(body).select("*").single();
    };
    let { data, error } = await attempt(payload);
    if (error && /driver_returns/i.test(error.message)) {
      const { driver_returns: _omit, ...rest } = payload;
      ({ data, error } = await attempt(rest));
      if (!error) {
        setErr("Returns were not saved. Apply the latest database migration, then save again.");
      }
    }
    if (error && /source/i.test(error.message)) {
      const { source: _omit, ...rest } = payload;
      ({ data, error } = await attempt(rest));
      if (!error) {
        setErr("Saved without the Daily order note type. Apply the latest database migration, then save again.");
      }
    }
    if (error) {
      setErr(error.message);
      return null;
    }
    return data as Record<string, unknown>;
  };

  const submitRecord = async () => {
    if (isNote && !notes.trim()) {
      setErr("Paste the daily order note before submitting.");
      return;
    }
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
    try {
      let recordId = record?.id;
      if (!recordId) {
        const saved = await saveDraft({ navigate: false });
        if (!saved?.id) return;
        recordId = saved.id;
      }
      for (const file of list) {
        if (!attachmentKind(file)) {
          setErr("Only PDF and image files are allowed.");
          continue;
        }
        let prepared;
        try {
          prepared = await prepareStorageUpload(file, "screenshot");
        } catch (err) {
          setErr(err instanceof Error ? err.message : "Could not compress this file.");
          break;
        }
        const fd = new FormData();
        fd.append("file", prepared.file);
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
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = async (att: OrderRecordAttachment) => {
    if (!canEditForm || !record) return;
    const res = await fetch(
      `/api/order-records/${record.id}/attachments?attachmentId=${encodeURIComponent(att.id)}`,
      { method: "DELETE" },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json.error || "Could not remove file");
      return;
    }
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
    ? isNote
      ? "New daily order note"
      : "New order record"
    : mode === "admin"
      ? record.status === "submitted"
        ? "Review order record"
        : "Order record"
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

      <form
        className="space-y-4 rounded-lg border bg-card p-4 sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        {!record && (
          <div>
            <Label>Record type</Label>
            <div className="mt-1 flex flex-wrap gap-1 rounded-lg border p-0.5">
              <Button
                type="button"
                size="sm"
                variant={!isNote ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => {
                  setSource("manual");
                  if (title.trim() === "Daily order note") setTitle("");
                }}
              >
                Stock usage
              </Button>
              <Button
                type="button"
                size="sm"
                variant={isNote ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => {
                  setSource("note");
                  if (!title.trim()) setTitle("Daily order note");
                }}
              >
                Daily order note
              </Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {isNote
                ? "Paste order texts in one note. No usage sheet required."
                : "Upload files and fill usage sheets for stock review."}
            </p>
          </div>
        )}

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
              placeholder={isNote ? "Daily order note" : "e.g. Walk-in orders May 29"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={editorReadOnly}
            />
          </div>
        </div>

        {isNote ? (
          <div>
            <Label>Daily order note</Label>
            <textarea
              className="mt-1 min-h-[280px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Paste order notes here…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={editorReadOnly}
              spellCheck={false}
            />
          </div>
        ) : (
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
        )}

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

        {!isNote && (
          <OrderRecordDriverReturns
            selected={driverReturns}
            onChange={setDriverReturns}
            readOnly={!canEditForm}
          />
        )}

        {!isNote && canEditForm && (
          <OrderRecordBigSellerImport
            disabled={busy || uploading}
            existingSheets={usageSheets}
            onApply={(mergedSheets, summary) => {
              setUsageSheets(mergedSheets);
              setNotes((n) => {
                const tag = `BigSeller import: ${summary}.`;
                return n.trim() ? `${n.trim()}\n${tag}` : tag;
              });
            }}
          />
        )}

        {!isNote && (
          <OrderRecordManualSheet sheets={usageSheets} onChange={setUsageSheets} readOnly={!canEditForm} />
        )}

        {record?.status === "rejected" && record.rejection_reason && (
          <p className="text-sm text-destructive">Rejected: {record.rejection_reason}</p>
        )}

        {err && <p className="text-sm text-destructive">{err}</p>}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={handleClose}>
            {layout === "page" ? "Cancel" : "Close"}
          </Button>

          {mode === "admin" && record?.status === "submitted" && onReject && onApprove && (
            <>
              <Button type="button" variant="outline" className="gap-1.5 text-destructive" disabled={busy} onClick={() => onReject(record.id)}>
                <XCircle className="h-4 w-4" /> Reject
              </Button>
              <Button
                type="button"
                className="gap-1.5"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    const saved = await saveDraft();
                    if (saved) onApprove(saved.id);
                  })();
                }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Mark approved
              </Button>
            </>
          )}

          {canEditForm && mode === "admin" && creatingOrOpen && (
            <>
              <Button type="button" variant="outline" disabled={busy || uploading} onClick={() => void saveDraft()}>
                Save draft
              </Button>
              <Button type="button" disabled={busy || uploading} onClick={() => void submitRecord()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit for review"}
              </Button>
            </>
          )}
          {canEditForm && mode === "admin" && !creatingOrOpen && (
            <Button type="button" disabled={busy || uploading} onClick={() => void saveDraft()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>
          )}
          {canEditForm && mode === "employee" && employeePending && (
            <Button type="button" disabled={busy || uploading} onClick={() => void saveDraft()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
            </Button>
          )}
          {canEditForm && mode === "employee" && !employeePending && (
            <>
              <Button type="button" variant="outline" disabled={busy || uploading} onClick={() => void saveDraft()}>
                Save draft
              </Button>
              <Button type="button" disabled={busy || uploading} onClick={() => void submitRecord()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit for review"}
              </Button>
            </>
          )}
        </div>
      </form>
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
    source: parseOrderRecordSource(data.source),
    stock_lines: parseUsageSheets(data.stock_lines),
    driver_returns: parseDriverReturns(data.driver_returns),
    reviewed_by: (data.reviewed_by as string) || null,
    reviewed_at: (data.reviewed_at as string) || null,
    rejection_reason: (data.rejection_reason as string) || null,
    created_at: data.created_at as string,
    updated_at: data.updated_at as string,
    submitter: null,
  };
}
