/** Batch Supabase writes/reads to avoid PostgREST body and URL size limits. */

export async function insertOrdersBatched(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  payloads: Record<string, unknown>[],
  opts?: { chunkSize?: number; select?: string },
): Promise<{ ids: string[]; insertedCount: number }> {
  const chunkSize = opts?.chunkSize ?? 50;
  const select = opts?.select ?? "id";
  const ids: string[] = [];

  for (let i = 0; i < payloads.length; i += chunkSize) {
    const chunk = payloads.slice(i, i + chunkSize);
    const { data, error } = await supabase.from("orders").insert(chunk).select(select);
    if (error) {
      const err = new Error(error.message) as Error & { code?: string; details?: string };
      err.code = error.code;
      err.details = `Failed at rows ${i + 1}–${i + chunk.length} of ${payloads.length}.`;
      throw err;
    }
    for (const row of (data || []) as { id?: string }[]) {
      if (row?.id) ids.push(row.id);
    }
  }

  return { ids, insertedCount: ids.length };
}

export async function fetchOrdersByIdsBatched<T = Record<string, unknown>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ids: string[],
  select: string,
  chunkSize = 80,
): Promise<T[]> {
  const all: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase.from("orders").select(select).in("id", slice);
    if (error) throw error;
    if (data?.length) all.push(...(data as T[]));
  }
  return all;
}
