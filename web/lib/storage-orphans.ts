import type { SupabaseClient } from "@supabase/supabase-js";
import { ORDER_RECORD_BUCKET } from "@/lib/order-records";
import {
  EXPENSE_RECEIPTS_BUCKET,
  JERSEY_DESIGNS_BUCKET,
  storagePathFromPublicUrl,
} from "@/lib/media-storage";

const SKIP_NEWER_THAN_MS = 2 * 60 * 60 * 1000;
const LIST_PAGE = 1000;
const DELETE_CHUNK = 50;

type ListedObject = { bucket: string; path: string; createdAt: number };

function isFolderEntry(item: { id?: string | null; metadata?: unknown; name: string }) {
  if (!item.name || item.name.startsWith(".")) return true;
  const meta = item.metadata as { size?: unknown; mimetype?: unknown } | null;
  if (meta && (typeof meta.size === "number" || typeof meta.mimetype === "string")) return false;
  return item.id == null;
}

async function listBucketObjects(supabase: SupabaseClient, bucket: string): Promise<ListedObject[]> {
  const out: ListedObject[] = [];

  async function walk(prefix: string) {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(bucket).list(prefix || undefined, {
        limit: LIST_PAGE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`${bucket}: ${error.message}`);
      const rows = data || [];
      for (const item of rows) {
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (isFolderEntry(item)) {
          if (item.name && !item.name.startsWith(".")) await walk(path);
          continue;
        }
        const createdAt = item.created_at ? Date.parse(item.created_at) : 0;
        out.push({ bucket, path, createdAt: Number.isFinite(createdAt) ? createdAt : 0 });
      }
      if (rows.length < LIST_PAGE) break;
      offset += LIST_PAGE;
    }
  }

  await walk("");
  return out;
}

async function referencedPaths(supabase: SupabaseClient): Promise<Set<string>> {
  const keys = new Set<string>();
  const add = (bucket: string, path: string | null | undefined) => {
    const p = String(path || "").trim().replace(/^\/+/, "");
    if (p) keys.add(`${bucket}:${p}`);
  };

  const [{ data: expenses, error: expErr }, { data: atts, error: attErr }, { data: teams, error: teamErr }, { data: players, error: playerErr }] =
    await Promise.all([
      supabase.from("expenses").select("receipt_path").not("receipt_path", "is", null),
      supabase.from("order_record_attachments").select("path"),
      supabase.from("sublimation_teams").select("design_image_urls"),
      supabase.from("sublimation_team_players").select("design_image_url"),
    ]);

  if (expErr) throw new Error(expErr.message);
  if (attErr) throw new Error(attErr.message);
  if (teamErr) throw new Error(teamErr.message);
  if (playerErr) throw new Error(playerErr.message);

  for (const row of expenses || []) add(EXPENSE_RECEIPTS_BUCKET, (row as { receipt_path?: string | null }).receipt_path);
  for (const row of atts || []) add(ORDER_RECORD_BUCKET, (row as { path?: string | null }).path);
  for (const row of teams || []) {
    const urls = (row as { design_image_urls?: unknown }).design_image_urls;
    if (!Array.isArray(urls)) continue;
    for (const url of urls) {
      if (typeof url !== "string") continue;
      add(JERSEY_DESIGNS_BUCKET, storagePathFromPublicUrl(url, JERSEY_DESIGNS_BUCKET));
    }
  }
  for (const row of players || []) {
    const url = (row as { design_image_url?: string | null }).design_image_url;
    if (!url) continue;
    add(JERSEY_DESIGNS_BUCKET, storagePathFromPublicUrl(url, JERSEY_DESIGNS_BUCKET));
  }

  return keys;
}

export type StorageCleanupResult = {
  scanned: number;
  referenced: number;
  skippedRecent: number;
  deleted: number;
  errors: string[];
};

export async function cleanupOrphanMedia(supabase: SupabaseClient): Promise<StorageCleanupResult> {
  const [receipts, designs, attachments, referenced] = await Promise.all([
    listBucketObjects(supabase, EXPENSE_RECEIPTS_BUCKET),
    listBucketObjects(supabase, JERSEY_DESIGNS_BUCKET),
    listBucketObjects(supabase, ORDER_RECORD_BUCKET),
    referencedPaths(supabase),
  ]);

  const now = Date.now();
  const orphans: ListedObject[] = [];
  let skippedRecent = 0;
  for (const obj of [...receipts, ...designs, ...attachments]) {
    if (referenced.has(`${obj.bucket}:${obj.path}`)) continue;
    if (obj.createdAt && now - obj.createdAt < SKIP_NEWER_THAN_MS) {
      skippedRecent += 1;
      continue;
    }
    orphans.push(obj);
  }

  const errors: string[] = [];
  let deleted = 0;
  const byBucket = new Map<string, string[]>();
  for (const obj of orphans) {
    const list = byBucket.get(obj.bucket) || [];
    list.push(obj.path);
    byBucket.set(obj.bucket, list);
  }

  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += DELETE_CHUNK) {
      const chunk = paths.slice(i, i + DELETE_CHUNK);
      const { error } = await supabase.storage.from(bucket).remove(chunk);
      if (error) errors.push(`${bucket}: ${error.message}`);
      else deleted += chunk.length;
    }
  }

  return {
    scanned: receipts.length + designs.length + attachments.length,
    referenced: referenced.size,
    skippedRecent,
    deleted,
    errors,
  };
}
