export const RESELLER_PRODUCT_NAME_MAX = 100;
export const RESELLER_PRODUCT_DESC_MAX = 3000;
export const RESELLER_VARIATION_MAX = 2;
export const RESELLER_OPTION_MAX = 20;

export type ResellerImage = { url: string; path: string };

export type ResellerVariationOption = {
  id: string;
  label: string;
  image_url?: string;
  image_path?: string;
};

export type ResellerVariation = {
  id: string;
  name: string;
  options: ResellerVariationOption[];
};

export type ResellerSku = {
  option_ids: string[];
  price: number;
  stock: number;
  sku: string;
};

export type ResellerSizeChartRow = {
  size: string;
  width: string;
  top_length: string;
  sleeve_length: string;
};

export type ResellerSizeChart = {
  name: string;
  rows: ResellerSizeChartRow[];
};

export type ResellerShipping = {
  weight_g: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
};

export type ResellerProductStatus = "draft" | "listed";

export type ResellerProduct = {
  id: string;
  name: string;
  category: string;
  description: string;
  images: ResellerImage[];
  specs: Record<string, string>;
  variations: ResellerVariation[];
  skus: ResellerSku[];
  size_chart: ResellerSizeChart;
  shipping: ResellerShipping;
  preorder: boolean;
  status: ResellerProductStatus;
  created_at: string;
  updated_at: string;
};

export const RESELLER_CATEGORIES = [
  "Men Clothes > Tops > T-shirts",
  "Men Clothes > Tops > Polo",
  "Women Clothes > Tops > T-shirts",
  "Unisex > Tops > T-shirts",
  "Kids > Tops > T-shirts",
] as const;

export const RESELLER_SPEC_FIELDS: { key: string; label: string; options: string[] }[] = [
  { key: "brand", label: "Brand", options: ["No brand", "Likha. Apparel", "Mensahe. Apparel", "Padayon. Apparel", "Drips. Apparel"] },
  { key: "material", label: "Material", options: ["Pro-Club Cotton", "Cotton", "Cotton Blend", "Polyester", "Dry Fit"] },
  { key: "pattern", label: "Pattern", options: ["Print", "Solid", "Graphic", "Striped"] },
  { key: "sleeve_length", label: "Sleeve length", options: ["Short Sleeves", "Long Sleeves", "Sleeveless"] },
  { key: "plus_size", label: "Plus size", options: ["No", "Yes"] },
  { key: "country_of_origin", label: "Country of origin", options: ["Philippines", "Indonesia", "China", "Vietnam"] },
  { key: "neckline", label: "Neckline", options: ["PRO-CLUB CREW NECK", "Crew Neck", "V-Neck", "Collar"] },
  { key: "occasion", label: "Occasion", options: ["Casual", "Sports", "Work"] },
  { key: "season", label: "Season", options: ["Summer", "All Season", "Rainy"] },
  { key: "style", label: "Style", options: ["Korean", "Classic", "Streetwear", "Basic"] },
];

export const RESELLER_SIZE_PRESETS = ["S", "M", "L", "XL", "2XL", "3XL"] as const;

export const DEFAULT_SIZE_CHART_ROWS: ResellerSizeChartRow[] = [
  { size: "S", width: "20", top_length: "27", sleeve_length: "8.5" },
  { size: "M", width: "21", top_length: "28", sleeve_length: "9" },
  { size: "L", width: "22", top_length: "29", sleeve_length: "9.5" },
  { size: "XL", width: "23", top_length: "30", sleeve_length: "10" },
  { size: "2XL", width: "24", top_length: "31", sleeve_length: "10.5" },
  { size: "3XL", width: "25", top_length: "32", sleeve_length: "11" },
];

export function newResellerId() {
  return crypto.randomUUID();
}

export function emptySizeChart(): ResellerSizeChart {
  return { name: "", rows: [] };
}

export function emptyShipping(): ResellerShipping {
  return { weight_g: 0, length_cm: 0, width_cm: 0, height_cm: 0 };
}

export function emptyResellerDraft(id = newResellerId()): ResellerProduct {
  return {
    id,
    name: "",
    category: "",
    description: "",
    images: [],
    specs: {},
    variations: [],
    skus: [{ option_ids: [], price: 0, stock: 0, sku: "" }],
    size_chart: emptySizeChart(),
    shipping: emptyShipping(),
    preorder: false,
    status: "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function asImages(value: unknown): ResellerImage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as { url?: unknown; path?: unknown };
      const url = typeof o.url === "string" ? o.url : "";
      const path = typeof o.path === "string" ? o.path : "";
      if (!url) return null;
      return { url, path };
    })
    .filter((x): x is ResellerImage => Boolean(x));
}

function asVariations(value: unknown): ResellerVariation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as { id?: unknown; name?: unknown; options?: unknown };
      const options = Array.isArray(o.options)
        ? o.options
            .map((opt) => {
              if (!opt || typeof opt !== "object") return null;
              const p = opt as { id?: unknown; label?: unknown; image_url?: unknown; image_path?: unknown };
              const id = typeof p.id === "string" ? p.id : newResellerId();
              return {
                id,
                label: typeof p.label === "string" ? p.label : "",
                image_url: typeof p.image_url === "string" ? p.image_url : undefined,
                image_path: typeof p.image_path === "string" ? p.image_path : undefined,
              };
            })
            .filter((x): x is ResellerVariationOption => Boolean(x))
        : [];
      return {
        id: typeof o.id === "string" ? o.id : newResellerId(),
        name: typeof o.name === "string" ? o.name : "",
        options,
      };
    })
    .filter((x): x is ResellerVariation => Boolean(x));
}

function asSkus(value: unknown): ResellerSku[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as { option_ids?: unknown; price?: unknown; stock?: unknown; sku?: unknown };
      const option_ids = Array.isArray(o.option_ids) ? o.option_ids.filter((id): id is string => typeof id === "string") : [];
      return {
        option_ids,
        price: Number(o.price) || 0,
        stock: Number(o.stock) || 0,
        sku: typeof o.sku === "string" ? o.sku : "",
      };
    })
    .filter((x): x is ResellerSku => Boolean(x));
}

function asSizeChart(value: unknown): ResellerSizeChart {
  if (!value || typeof value !== "object") return emptySizeChart();
  const o = value as { name?: unknown; rows?: unknown };
  const rows = Array.isArray(o.rows)
    ? o.rows
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const r = row as { size?: unknown; width?: unknown; top_length?: unknown; sleeve_length?: unknown };
          return {
            size: typeof r.size === "string" ? r.size : "",
            width: typeof r.width === "string" ? r.width : String(r.width ?? ""),
            top_length: typeof r.top_length === "string" ? r.top_length : String(r.top_length ?? ""),
            sleeve_length: typeof r.sleeve_length === "string" ? r.sleeve_length : String(r.sleeve_length ?? ""),
          };
        })
        .filter((x): x is ResellerSizeChartRow => Boolean(x))
    : [];
  return { name: typeof o.name === "string" ? o.name : "", rows };
}

function asShipping(value: unknown): ResellerShipping {
  if (!value || typeof value !== "object") return emptyShipping();
  const o = value as { weight_g?: unknown; length_cm?: unknown; width_cm?: unknown; height_cm?: unknown };
  return {
    weight_g: Number(o.weight_g) || 0,
    length_cm: Number(o.length_cm) || 0,
    width_cm: Number(o.width_cm) || 0,
    height_cm: Number(o.height_cm) || 0,
  };
}

export function parseResellerProduct(row: Record<string, unknown>): ResellerProduct {
  const specs =
    row.specs && typeof row.specs === "object" && !Array.isArray(row.specs)
      ? Object.fromEntries(
          Object.entries(row.specs as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][],
        )
      : {};
  const skus = asSkus(row.skus);
  return {
    id: String(row.id || newResellerId()),
    name: typeof row.name === "string" ? row.name : "",
    category: typeof row.category === "string" ? row.category : "",
    description: typeof row.description === "string" ? row.description : "",
    images: asImages(row.images),
    specs,
    variations: asVariations(row.variations),
    skus: skus.length ? skus : [{ option_ids: [], price: 0, stock: 0, sku: "" }],
    size_chart: asSizeChart(row.size_chart),
    shipping: asShipping(row.shipping),
    preorder: Boolean(row.preorder),
    status: row.status === "listed" ? "listed" : "draft",
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}

export function skuComboKey(optionIds: string[]) {
  return optionIds.join("|");
}

export function orderVariations(product: ResellerProduct) {
  return product.variations.filter((v) => labeledOptions(v).length > 0);
}

export function findSkuForOptionIds(product: ResellerProduct, optionIds: string[]) {
  const key = skuComboKey(optionIds);
  return (
    product.skus.find((s) => skuComboKey(s.option_ids) === key) ||
    product.skus.find((s) => s.option_ids.length === 0) ||
    product.skus[0] ||
    null
  );
}

function cartesian<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, list) => acc.flatMap((prefix) => list.map((item) => [...prefix, item])), [[]]);
}

export function labeledOptions(variation: ResellerVariation) {
  return variation.options.filter((o) => o.label.trim());
}

export function expandResellerSkus(variations: ResellerVariation[], existing: ResellerSku[]): ResellerSku[] {
  const lists = variations.map(labeledOptions).filter((opts) => opts.length > 0);
  if (lists.length === 0) {
    return existing.find((s) => s.option_ids.length === 0)
      ? existing.filter((s) => s.option_ids.length === 0)
      : [{ option_ids: [], price: 0, stock: 0, sku: "" }];
  }
  const prev = new Map(existing.map((s) => [skuComboKey(s.option_ids), s]));
  return cartesian(lists).map((opts) => {
    const option_ids = opts.map((o) => o.id);
    const found = prev.get(skuComboKey(option_ids));
    return found ?? { option_ids, price: 0, stock: 0, sku: "" };
  });
}

export function optionLabelMap(variations: ResellerVariation[]) {
  const map = new Map<string, string>();
  for (const variation of variations) {
    for (const option of variation.options) map.set(option.id, option.label);
  }
  return map;
}

export function skuPart(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, "").toUpperCase();
}

export function suggestSku(name: string, labels: string[]) {
  return [name, ...labels].map(skuPart).filter(Boolean).join("-").slice(0, 80);
}

export function skuOptionLabels(sku: ResellerSku, variations: ResellerVariation[]) {
  const map = optionLabelMap(variations);
  return sku.option_ids.map((id) => map.get(id) || "").filter(Boolean);
}

export function coverImage(images: ResellerImage[]) {
  return images[0]?.url || "";
}

export function skuPriceRange(skus: ResellerSku[]) {
  const prices = skus.map((s) => Number(s.price) || 0).filter((n) => n > 0);
  if (!prices.length) return { min: 0, max: 0 };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function skuStockTotal(skus: ResellerSku[]) {
  return skus.reduce((sum, s) => sum + (Number(s.stock) || 0), 0);
}

export function formatResellerPrice(skus: ResellerSku[]) {
  const { min, max } = skuPriceRange(skus);
  if (min <= 0 && max <= 0) return "";
  if (min === max) return `₱${min.toLocaleString("en-PH")}`;
  return `₱${min.toLocaleString("en-PH")} – ₱${max.toLocaleString("en-PH")}`;
}

export function toResellerProductPayload(product: ResellerProduct, userId?: string) {
  return {
    id: product.id,
    name: product.name.trim(),
    category: product.category.trim() || null,
    description: product.description.trim() || null,
    images: product.images,
    specs: product.specs,
    variations: product.variations,
    skus: expandResellerSkus(product.variations, product.skus),
    size_chart: product.size_chart,
    shipping: product.shipping,
    preorder: product.preorder,
    status: product.status,
    created_by: userId || null,
  };
}

export function resellerTableMissing(message: string) {
  return /reseller_products|schema cache|does not exist/i.test(message);
}

export function asResellerProductList(rows: unknown[] | null | undefined): ResellerProduct[] {
  return (rows || []).map((row) => parseResellerProduct(row as Record<string, unknown>));
}
