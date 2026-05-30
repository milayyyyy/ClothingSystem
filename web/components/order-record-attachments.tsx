"use client";

import { useCallback, useEffect, useId, useState, type DragEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { ORDER_RECORD_BUCKET, attachmentKind, type OrderRecordAttachment } from "@/lib/order-records";
import { ExternalLink, FileText, Loader2, Trash2, Upload } from "lucide-react";

type Props = {
  attachments: OrderRecordAttachment[];
  onUpload: (files: FileList | File[]) => Promise<void>;
  onRemove: (att: OrderRecordAttachment) => void;
  onOpen: (path: string) => void;
  readOnly?: boolean;
  disabled?: boolean;
  uploading?: boolean;
  onError?: (message: string) => void;
};

function AttachmentCard({
  att,
  readOnly,
  onOpen,
  onRemove,
}: {
  att: OrderRecordAttachment;
  readOnly?: boolean;
  onOpen: (path: string) => void;
  onRemove: (att: OrderRecordAttachment) => void;
}) {
  const supabase = createClient();
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbLoading, setThumbLoading] = useState(att.kind === "photo");

  useEffect(() => {
    if (att.kind !== "photo") {
      setThumbLoading(false);
      return;
    }
    let cancelled = false;
    setThumbLoading(true);
    supabase.storage
      .from(ORDER_RECORD_BUCKET)
      .createSignedUrl(att.path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data?.signedUrl) setThumbUrl(data.signedUrl);
        setThumbLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [att.path, att.kind, supabase]);

  const isPdf = att.kind === "pdf";

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
      <button
        type="button"
        className="relative flex aspect-[4/3] w-full items-center justify-center bg-muted/40 hover:bg-muted/60"
        onClick={() => onOpen(att.path)}
      >
        {thumbLoading && (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        )}
        {!thumbLoading && isPdf && (
          <div className="flex flex-col items-center gap-1 px-2 text-center">
            <FileText className="h-10 w-10 text-red-500/90" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">PDF</span>
          </div>
        )}
        {!thumbLoading && !isPdf && thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
        )}
        {!thumbLoading && !isPdf && !thumbUrl && (
          <span className="text-xs text-muted-foreground">Preview unavailable</span>
        )}
      </button>
      <div className="flex min-h-0 flex-1 flex-col gap-1 border-t p-2">
        <p className="truncate text-xs font-medium" title={att.file_name}>
          {att.file_name}
        </p>
        <div className="mt-auto flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 flex-1 gap-1 text-[10px]"
            onClick={() => onOpen(att.path)}
          >
            <ExternalLink className="h-3 w-3" /> Open
          </Button>
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 shrink-0 p-0 text-destructive hover:text-destructive"
              onClick={() => onRemove(att)}
              aria-label="Remove file"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function OrderRecordAttachments({
  attachments,
  onUpload,
  onRemove,
  onOpen,
  onError,
  readOnly,
  disabled,
  uploading,
}: Props) {
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);
  const dropDisabled = readOnly || disabled || uploading;

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      const valid = list.filter((f) => attachmentKind(f));
      if (!valid.length) {
        onError?.("Only PDF and image files are allowed.");
        return;
      }
      await onUpload(valid);
    },
    [onUpload, onError],
  );

  function onDragOver(e: DragEvent) {
    if (dropDisabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  async function onDrop(e: DragEvent) {
    if (dropDisabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const dropped = e.dataTransfer.files;
    if (!dropped?.length) return;
    await handleFiles(dropped);
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Attachments (PDF or photos)</Label>
        <p className="text-xs text-muted-foreground">
          Drag and drop files here, or click to browse. Uploads save automatically.
        </p>
      </div>

      {!readOnly && (
        <div
          className={cn(
            "relative rounded-lg border-2 border-dashed p-6 text-center transition-colors",
            dragOver && !dropDisabled && "border-primary bg-primary/5",
            !dragOver && "border-muted-foreground/25 hover:border-muted-foreground/40 hover:bg-muted/20",
            dropDisabled && "pointer-events-none opacity-60",
          )}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <input
            id={inputId}
            type="file"
            className="sr-only"
            accept="application/pdf,image/*"
            multiple
            disabled={dropDisabled}
            onChange={(e) => {
              const list = e.target.files;
              e.target.value = "";
              if (list?.length) void handleFiles(list);
            }}
          />
          <label
            htmlFor={inputId}
            className={cn("flex cursor-pointer flex-col items-center gap-2", dropDisabled && "cursor-not-allowed")}
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">
              {uploading ? "Uploading…" : dragOver ? "Drop files to upload" : "Drag PDF or photos here"}
            </span>
            <span className="text-xs text-muted-foreground">or click to choose files</span>
          </label>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Uploaded ({attachments.length})
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {attachments.map((att) => (
              <AttachmentCard
                key={att.id}
                att={att}
                readOnly={readOnly}
                onOpen={onOpen}
                onRemove={onRemove}
              />
            ))}
          </div>
        </div>
      )}

      {attachments.length === 0 && readOnly && (
        <p className="text-sm text-muted-foreground">No attachments.</p>
      )}
    </div>
  );
}
