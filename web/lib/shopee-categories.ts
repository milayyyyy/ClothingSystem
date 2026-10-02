import { SHOPEE_CATEGORIES, type ShopeeCategory } from "@/lib/shopee-categories.data";

export type { ShopeeCategory };
export { SHOPEE_CATEGORIES };

export type ShopeeCategoryLeaf = {
  path: string;
  names: string[];
};

export function shopeeCategoryPath(names: string[]) {
  return names.map((n) => n.trim()).filter(Boolean).join(" > ");
}

export function splitCategoryPath(path: string) {
  return path
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function flattenShopeeCategories(tree: ShopeeCategory[] = SHOPEE_CATEGORIES): ShopeeCategoryLeaf[] {
  const out: ShopeeCategoryLeaf[] = [];
  function walk(nodes: ShopeeCategory[], prefix: string[]) {
    for (const node of nodes) {
      const names = [...prefix, node.name];
      if (!node.children.length) out.push({ path: shopeeCategoryPath(names), names });
      else walk(node.children, names);
    }
  }
  walk(tree, []);
  return out;
}

export const SHOPEE_CATEGORY_LEAVES = flattenShopeeCategories();

export function findShopeeCategoryNames(path: string): string[] {
  const parts = splitCategoryPath(path);
  if (!parts.length) return [];
  const exact = SHOPEE_CATEGORY_LEAVES.find((leaf) => leaf.path === path);
  if (exact) return exact.names;
  const byJoin = SHOPEE_CATEGORY_LEAVES.find((leaf) => leaf.names.join(" > ") === parts.join(" > "));
  if (byJoin) return byJoin.names;
  return parts;
}

export function isShopeeCategoryPath(path: string) {
  const names = findShopeeCategoryNames(path);
  return SHOPEE_CATEGORY_LEAVES.some((leaf) => leaf.path === shopeeCategoryPath(names));
}

export function searchShopeeCategories(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return SHOPEE_CATEGORY_LEAVES;
  return SHOPEE_CATEGORY_LEAVES.filter((leaf) => leaf.path.toLowerCase().includes(q));
}
