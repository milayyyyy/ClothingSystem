"use client";

import { createClient } from "@/lib/supabase/client";
import { prepareStorageUpload } from "@/lib/compress-image";
import {
  RESELLER_PRODUCT_IMAGE_MAX,
  RESELLER_PRODUCTS_BUCKET,
  sanitizeStorageSegment,
  storagePathFromPublicUrl,
} from "@/lib/media-storage";
import type { ResellerImage } from "@/lib/reseller-products";

function nextImagePath(productId: string, existingPaths: string[]) {
  const prefix = `${sanitizeStorageSegment(productId)}/`;
  const used = new Set(existingPaths.filter((p) => p.startsWith(prefix)));
  for (let i = 0; i < RESELLER_PRODUCT_IMAGE_MAX + 40; i++) {
    const path = `${prefix}${i}.jpg`;
    if (!used.has(path)) return path;
  }
  throw new Error(`At most ${RESELLER_PRODUCT_IMAGE_MAX} product photos.`);
}

export async function uploadResellerProductImage(
  productId: string,
  file: File,
  existing: ResellerImage[],
): Promise<ResellerImage> {
  const prepared = await prepareStorageUpload(file, "design");
  const existingPaths = existing
    .map((img) => img.path || storagePathFromPublicUrl(img.url, RESELLER_PRODUCTS_BUCKET) || "")
    .filter(Boolean);
  const path = nextImagePath(productId, existingPaths);
  const supabase = createClient();
  const { error } = await supabase.storage.from(RESELLER_PRODUCTS_BUCKET).upload(path, prepared.file, {
    upsert: true,
    contentType: "image/jpeg",
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(RESELLER_PRODUCTS_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Upload failed");
  return { url: data.publicUrl, path };
}

export async function uploadResellerOptionImage(productId: string, optionId: string, file: File): Promise<ResellerImage> {
  const prepared = await prepareStorageUpload(file, "design");
  const path = `${sanitizeStorageSegment(productId)}/options/${sanitizeStorageSegment(optionId)}.jpg`;
  const supabase = createClient();
  const { error } = await supabase.storage.from(RESELLER_PRODUCTS_BUCKET).upload(path, prepared.file, {
    upsert: true,
    contentType: "image/jpeg",
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(RESELLER_PRODUCTS_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("Upload failed");
  return { url: data.publicUrl, path };
}

export async function removeResellerProductFiles(paths: string[]) {
  const clean = paths.map((p) => p.trim()).filter(Boolean);
  if (!clean.length) return;
  const supabase = createClient();
  await supabase.storage.from(RESELLER_PRODUCTS_BUCKET).remove(clean);
}
