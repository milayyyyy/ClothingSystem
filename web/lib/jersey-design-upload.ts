"use client";

import { createClient } from "@/lib/supabase/client";
import { extensionFromFileName, jerseyDesignUploadErrorMessage } from "@/lib/sublimation-teams";

const BUCKET = "jersey-designs";

/** Upload via server API; fall back to direct storage if the API is unavailable. */
export async function uploadJerseyDesignPhoto(
  orderId: string,
  teamKey: string,
  file: File,
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("teamKey", teamKey);

  let apiError = "";
  try {
    const res = await fetch(`/api/orders/${orderId}/jersey-designs`, {
      method: "POST",
      body: form,
    });
    const payload = (await res.json().catch(() => ({}))) as {
      publicUrl?: string;
      error?: string;
      hint?: string;
    };
    if (res.ok && payload.publicUrl) return payload.publicUrl;
    apiError = payload.hint
      ? `${payload.error ?? "Upload failed"} (${payload.hint})`
      : (payload.error ?? `Upload failed (${res.status})`);
    if (res.status !== 404 && res.status !== 500 && res.status !== 502 && res.status !== 503) {
      throw new Error(apiError);
    }
  } catch (err) {
    if (err instanceof Error && err.message && !apiError) throw err;
    if (apiError && !/404|500|502|503/.test(apiError)) throw new Error(apiError);
  }

  const supabase = createClient();
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${orderId}/teams/${teamKey}/${id}.${extensionFromFileName(file.name)}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || undefined,
  });
  if (upErr) {
    throw new Error(apiError ? `${apiError} — ${jerseyDesignUploadErrorMessage(upErr)}` : jerseyDesignUploadErrorMessage(upErr));
  }
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) throw new Error(apiError || "Upload failed");
  return pub.publicUrl;
}
