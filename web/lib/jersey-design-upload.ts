"use client";

import { createClient } from "@/lib/supabase/client";
import { extensionFromFileName, jerseyDesignUploadErrorMessage } from "@/lib/sublimation-teams";

const BUCKET = "jersey-designs";

/** Same pattern as finance QR uploads: direct Supabase storage from the browser. */
export async function uploadJerseyDesignPhoto(
  orderId: string,
  teamKey: string,
  file: File,
): Promise<string> {
  const supabase = createClient();
  const ext = extensionFromFileName(file.name);
  const path = `${orderId}/teams/${teamKey}/${Date.now()}-${globalThis.crypto?.randomUUID?.() ?? "img"}.${ext}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || undefined,
  });
  if (upErr) throw new Error(jerseyDesignUploadErrorMessage(upErr));
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Upload failed");
  return data.publicUrl;
}
