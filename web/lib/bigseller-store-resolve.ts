import { BIGSELLER_KNOWN_STORES_SORTED } from "@/lib/bigseller-store-labels";

export type StoreOption = { id: string; name: string; pdf_label?: string | null };

/** Match BigSeller PDF / Excel store label to `stores` row (pdf_label or name). */
export function resolveStoreId(
  stores: StoreOption[],
  storeLabel: string | undefined,
): { id: string | null; matchedName: string | null } {
  if (!storeLabel?.trim() || stores.length === 0) return { id: null, matchedName: null };
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const target = norm(storeLabel);

  type Labeled = { s: StoreOption; pn: string };
  const labeled: Labeled[] = [];
  for (const s of stores) {
    const pl = s.pdf_label?.trim();
    if (!pl) continue;
    labeled.push({ s, pn: norm(pl) });
  }
  for (const { s, pn } of labeled) {
    if (pn === target) return { id: s.id, matchedName: s.name };
  }
  const containedInTarget = labeled
    .filter((x) => target.includes(x.pn))
    .sort((a, b) => b.pn.length - a.pn.length);
  if (containedInTarget[0]) return { id: containedInTarget[0].s.id, matchedName: containedInTarget[0].s.name };
  const targetInLabel = labeled
    .filter((x) => x.pn.includes(target))
    .sort((a, b) => b.pn.length - a.pn.length);
  if (targetInLabel[0]) return { id: targetInLabel[0].s.id, matchedName: targetInLabel[0].s.name };

  let canonical = storeLabel.trim();
  for (const name of BIGSELLER_KNOWN_STORES_SORTED) {
    if (target.includes(name.toLowerCase())) {
      canonical = name;
      break;
    }
  }
  const cnorm = norm(canonical);

  for (const s of stores) {
    if (norm(s.name) === cnorm) return { id: s.id, matchedName: s.name };
  }
  for (const s of stores) {
    const n = norm(s.name);
    if (n === cnorm || n.includes(cnorm) || cnorm.includes(n)) return { id: s.id, matchedName: s.name };
  }
  return { id: null, matchedName: null };
}
