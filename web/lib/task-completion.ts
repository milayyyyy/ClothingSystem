import type { SupabaseClient } from "@supabase/supabase-js";
import { isPdfUpload, prepareStorageUpload } from "@/lib/compress-image";
import { TASK_COMPLETIONS_BUCKET, taskCompletionPhotoPath } from "@/lib/media-storage";

export { TASK_COMPLETIONS_BUCKET, taskCompletionPhotoPath };

export type TaskCompletionFields = {
  id: string;
  completion_note?: string | null;
  completion_photo_path?: string | null;
};

export async function signedTaskCompletionPhotoUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
): Promise<string | null> {
  const p = String(path || "").trim();
  if (!p) return null;
  const { data, error } = await supabase.storage.from(TASK_COMPLETIONS_BUCKET).createSignedUrl(p, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function uploadTaskCompletionPhoto(
  supabase: SupabaseClient,
  taskId: string,
  file: File,
): Promise<string> {
  if (isPdfUpload(file)) {
    throw new Error("Attach a photo, not a PDF.");
  }
  const prepared = await prepareStorageUpload(file, "screenshot");
  if (prepared.ext !== "jpg") {
    throw new Error("Attach a photo (JPG, PNG, or HEIC converted to JPG).");
  }
  const path = taskCompletionPhotoPath(taskId);
  const { error } = await supabase.storage.from(TASK_COMPLETIONS_BUCKET).upload(path, prepared.file, {
    contentType: prepared.file.type || "image/jpeg",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeTaskCompletionPhoto(
  supabase: SupabaseClient,
  path: string | null | undefined,
): Promise<void> {
  const p = String(path || "").trim();
  if (!p) return;
  const { error } = await supabase.storage.from(TASK_COMPLETIONS_BUCKET).remove([p]);
  if (error) console.warn("Task completion photo delete:", error.message);
}

type SaveOpts = {
  markDone?: boolean;
  note: string;
  photoFile?: File | null;
  removePhoto?: boolean;
  existingPhotoPath?: string | null;
};

export async function saveTaskCompletion(
  supabase: SupabaseClient,
  taskId: string,
  opts: SaveOpts,
): Promise<{ photoPath: string | null }> {
  const note = opts.note.trim() || null;
  let photoPath = opts.existingPhotoPath || null;

  if (opts.photoFile && opts.photoFile.size > 0) {
    photoPath = await uploadTaskCompletionPhoto(supabase, taskId, opts.photoFile);
  } else if (opts.removePhoto) {
    await removeTaskCompletionPhoto(supabase, photoPath);
    photoPath = null;
  }

  const patch: Record<string, unknown> = {
    completion_note: note,
    completion_photo_path: photoPath,
  };
  if (opts.markDone) {
    patch.status = "done";
    patch.completed_at = new Date().toISOString();
  }

  const { error } = await supabase.from("tasks").update(patch).eq("id", taskId);
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("completion_note") || msg.includes("completion_photo")) {
      throw new Error("Apply Supabase migration 136 (task completion photo/note), then try again.");
    }
    throw new Error(error.message);
  }
  return { photoPath };
}

export async function clearTaskCompletionOnReopen(
  supabase: SupabaseClient,
  task: TaskCompletionFields,
): Promise<void> {
  await removeTaskCompletionPhoto(supabase, task.completion_photo_path);
  const patch: Record<string, unknown> = {
    status: "open",
    completed_at: null,
    completion_note: null,
    completion_photo_path: null,
  };
  const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("completion_note") || msg.includes("completion_photo")) {
      const retry = await supabase.from("tasks").update({ status: "open", completed_at: null }).eq("id", task.id);
      if (retry.error) throw new Error(retry.error.message);
      return;
    }
    throw new Error(error.message);
  }
}
