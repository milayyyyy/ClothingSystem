"use client";

import { createClient } from "@/lib/supabase/client";
import { prepareStorageUpload } from "@/lib/compress-image";
import { JERSEY_DESIGNS_BUCKET, nextJerseyDesignPath } from "@/lib/media-storage";
import { jerseyDesignUploadErrorMessage } from "@/lib/sublimation-teams";

/** Same pattern as finance QR uploads: compress in the browser, then store JPEG. */
export async function uploadJerseyDesignPhoto(
  orderId: string,
  teamKey: string,
  file: File,
  existingUrls: string[] = [],
): Promise<string> {
  const prepared = await prepareStorageUpload(file, "design");
  const path = nextJerseyDesignPath(orderId, teamKey, existingUrls);
  const supabase = createClient();
  const { error: upErr } = await supabase.storage.from(JERSEY_DESIGNS_BUCKET).upload(path, prepared.file, {
    upsert: true,
    contentType: "image/jpeg",
  });
  if (upErr) throw new Error(jerseyDesignUploadErrorMessage(upErr));
  const { data } = supabase.storage.from(JERSEY_DESIGNS_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Upload failed");
  return data.publicUrl;
}
