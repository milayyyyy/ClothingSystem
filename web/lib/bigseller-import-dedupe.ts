import { BIGSELLER_ORDERS_OR_FILTER } from "@/lib/bigseller-orders-query";

/** Normalize marketplace order / waybill / package keys for duplicate checks. */
export function normalizeImportDedupeKey(raw: unknown): string {
  if (raw == null) return "";
  let s = String(raw).trim();
  if (!s || s === "--") return "";

  if (s.startsWith("'")) s = s.slice(1).trim();

  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (Number.isInteger(raw) || Math.abs(raw) >= 1e11) {
      s = String(Math.trunc(raw));
    }
  } else if (/^\d+(?:\.\d+)?[eE][+-]?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) s = String(Math.trunc(n));
  }

  return s.toLowerCase();
}

export type ImportDedupeSets = {
  packages: Set<string>;
  external: Set<string>;
  waybills: Set<string>;
};

export function buildImportDedupeSets(
  rows: { sku_code?: string | null; external_order_no?: string | null; waybill_no?: string | null }[],
): ImportDedupeSets {
  const packages = new Set<string>();
  const external = new Set<string>();
  const waybills = new Set<string>();

  for (const row of rows) {
    const p = normalizeImportDedupeKey(row.sku_code);
    const e = normalizeImportDedupeKey(row.external_order_no);
    const w = normalizeImportDedupeKey(row.waybill_no);
    if (p) packages.add(p);
    if (e) external.add(e);
    if (w) waybills.add(w);
  }

  return { packages, external, waybills };
}

export function orderMatchesImportDedupe(
  order: { packageNo: string; externalOrderNo: string; waybillNo?: string },
  sets: ImportDedupeSets,
): boolean {
  const pkgKey = normalizeImportDedupeKey(order.packageNo);
  const extKey = normalizeImportDedupeKey(order.externalOrderNo);
  const wbKey = normalizeImportDedupeKey(order.waybillNo);
  return (
    (pkgKey.length > 0 && sets.packages.has(pkgKey)) ||
    (extKey.length > 0 && sets.external.has(extKey)) ||
    (wbKey.length > 0 && sets.waybills.has(wbKey))
  );
}

/** Load all BigSeller / marketplace Excel order keys (paginated; default PostgREST cap is 1000). */
export async function fetchExistingImportDedupeSets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<{ sets: ImportDedupeSets; error: string | null }> {
  const all: { sku_code?: string | null; external_order_no?: string | null; waybill_no?: string | null }[] = [];
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("orders")
      .select("sku_code,external_order_no,waybill_no")
      .or(BIGSELLER_ORDERS_OR_FILTER)
      .range(from, from + pageSize - 1);

    if (error) return { sets: buildImportDedupeSets([]), error: error.message };
    const batch = (data || []) as typeof all;
    all.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return { sets: buildImportDedupeSets(all), error: null };
}
