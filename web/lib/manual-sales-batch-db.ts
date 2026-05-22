/** Batch Supabase manual_sales inserts (PostgREST body size limits). */

export async function insertManualSalesBatched(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  payloads: Record<string, unknown>[],
  chunkSize = 50,
): Promise<{ insertedCount: number }> {
  let insertedCount = 0;
  for (let i = 0; i < payloads.length; i += chunkSize) {
    const chunk = payloads.slice(i, i + chunkSize);
    const { error } = await supabase.from("manual_sales").insert(chunk);
    if (error) {
      const err = new Error(error.message) as Error & { details?: string };
      err.details = `Failed at rows ${i + 1}–${i + chunk.length} of ${payloads.length}.`;
      throw err;
    }
    insertedCount += chunk.length;
  }
  return { insertedCount };
}
