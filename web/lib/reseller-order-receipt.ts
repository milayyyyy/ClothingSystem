"use client";

import { createClient } from "@/lib/supabase/client";
import { prepareStorageUpload } from "@/lib/compress-image";
import { RESELLER_ORDER_RECEIPTS_BUCKET, resellerOrderReceiptPath } from "@/lib/media-storage";

export async function uploadResellerOrderReceipt(resellerId: string, orderId: string, file: File) {
  const prepared = await prepareStorageUpload(file, "receipt");
  if (prepared.ext !== "jpg") {
    throw new Error("Upload a receipt photo (JPG or PNG).");
  }
  const path = resellerOrderReceiptPath(resellerId, orderId);
  const supabase = createClient();
  const { error } = await supabase.storage.from(RESELLER_ORDER_RECEIPTS_BUCKET).upload(path, prepared.file, {
    upsert: true,
    contentType: "image/jpeg",
  });
  if (error) throw new Error(error.message);
  return path;
}
