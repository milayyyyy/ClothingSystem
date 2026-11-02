"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, StickyNote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { signedTaskCompletionPhotoUrl } from "@/lib/task-completion";

export type TaskCompleteTarget = {
  id: string;
  title: string;
  completion_note?: string | null;
  completion_photo_path?: string | null;
};

export function TaskCompleteDialog({
  open,
  task,
  mode,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  task: TaskCompleteTarget | null;
  mode: "complete" | "edit";
  saving?: boolean;
  onClose: () => void;
  onSubmit: (payload: { note: string; photoFile: File | null; removePhoto: boolean }) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [existingUrl, setExistingUrl] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  useEffect(() => {
    if (!open || !task) return;
    setNote(String(task.completion_note || ""));
    setPhotoFile(null);
    setPreview(null);
    setRemovePhoto(false);
    if (fileRef.current) fileRef.current.value = "";
    let cancelled = false;
    const path = task.completion_photo_path;
    if (path) {
      void signedTaskCompletionPhotoUrl(supabase, path).then((url) => {
        if (!cancelled) setExistingUrl(url);
      });
    } else {
      setExistingUrl(null);
    }
    return () => {
      cancelled = true;
    };
  }, [open, task, supabase]);

  useEffect(() => {
    if (!photoFile) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  if (!task) return null;

  const shownPhoto = preview || (!removePhoto ? existingUrl : null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === "complete" ? "Mark task done" : "Completion record"}
      description={
        mode === "complete"
          ? "Optionally add a photo or notes for this completed task."
          : "Photo and notes recorded when this task was marked done."
      }
    >
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ note, photoFile, removePhoto: removePhoto && !photoFile });
        }}
      >
        <p className="text-sm font-medium">{task.title}</p>
        <div>
          <Label className="flex items-center gap-1.5">
            <StickyNote className="h-3.5 w-3.5" />
            Notes
          </Label>
          <textarea
            className="mt-1 min-h-[88px] w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            placeholder="What was done, leftover issues, etc."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div>
          <Label className="flex items-center gap-1.5">
            <ImagePlus className="h-3.5 w-3.5" />
            Photo
          </Label>
          {shownPhoto && (
            <div className="relative mt-1 overflow-hidden rounded-md border">
              <img src={shownPhoto} alt="Task completion" className="max-h-56 w-full object-contain bg-muted/40" />
              <button
                type="button"
                className="absolute right-2 top-2 rounded-full bg-background/90 p-1 text-muted-foreground shadow hover:text-foreground"
                title="Remove photo"
                onClick={() => {
                  setPhotoFile(null);
                  setRemovePhoto(true);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="mt-2 block w-full text-sm file:mr-2 file:rounded-md file:border file:bg-muted file:px-2 file:py-1"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setPhotoFile(f);
              if (f) setRemovePhoto(false);
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">Optional. Phone camera or an existing photo.</p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : mode === "complete" ? "Mark done" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
