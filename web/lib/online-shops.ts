import type { SalesChannel } from "@/lib/sales";

/** Named marketplace stores under Sales list → Online Shops (not adjustments). */
export type OnlineShopKey = "mensahe_tiktok" | "mensahe_shopee" | "likha_tiktok" | "likha_shopee";

export const ONLINE_SHOP_KEYS: readonly OnlineShopKey[] = [
  "mensahe_tiktok",
  "mensahe_shopee",
  "likha_tiktok",
  "likha_shopee",
];

export type OnlineShopFilter = "all" | OnlineShopKey;

export const ONLINE_SHOP_FILTERS: Array<{ key: OnlineShopFilter; label: string }> = [
  { key: "all", label: "All shops" },
  { key: "mensahe_tiktok", label: "Mensahe · TikTok" },
  { key: "mensahe_shopee", label: "Mensahe · Shopee" },
  { key: "likha_tiktok", label: "Likha · TikTok" },
  { key: "likha_shopee", label: "Likha · Shopee" },
];

export function onlineShopLabel(key: OnlineShopKey): string {
  if (key === "mensahe_tiktok") return "Mensahe · TikTok";
  if (key === "mensahe_shopee") return "Mensahe · Shopee";
  if (key === "likha_tiktok") return "Likha · TikTok";
  return "Likha · Shopee";
}

function normShopText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\./g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Classify a store / REVENUE CHANNEL label into one of the four online shops. */
export function resolveOnlineShop(
  label: string,
  _opts?: { isManualSale?: boolean; channel?: SalesChannel },
): OnlineShopKey | null {
  const s = normShopText(label);
  const hasMensahe = s.includes("mensahe");
  const hasLikha = s.includes("likha");
  const hasTiktok = s.includes("tiktok");
  const hasShopee = s.includes("shopee");

  if (hasMensahe && hasTiktok) return "mensahe_tiktok";
  if (hasMensahe && hasShopee) return "mensahe_shopee";
  if (hasLikha && hasTiktok) return "likha_tiktok";
  if (hasLikha && hasShopee) return "likha_shopee";

  return null;
}

/** Rows for the separate Others tab (adjustments and misc revenue, not online shops). */
export function resolveOthersListRow(
  label: string,
  opts?: { isManualSale?: boolean; channel?: SalesChannel },
): boolean {
  if (resolveOnlineShop(label, opts)) return false;

  const s = normShopText(label);

  if (s.includes("other") || s.includes("adjust")) return true;

  if (opts?.isManualSale && opts.channel === "online") {
    if (!s || s.includes("tiktok") || s.includes("shopee") || s.includes("lazada")) return true;
  }

  if (!opts?.isManualSale && (s.includes("other") || s.includes("adjust"))) return true;

  return false;
}

/** Canonical label for imports and display. */
export function normalizeRevenueChannelLabel(raw: string): string {
  const trimmed = raw.trim();
  const shop = resolveOnlineShop(trimmed, { isManualSale: true, channel: "online" });
  if (shop) return onlineShopLabel(shop);
  if (resolveOthersListRow(trimmed, { isManualSale: true, channel: "online" })) {
    return trimmed || "Others";
  }
  return trimmed || "Others";
}

export function isOnlineShopRow(onlineShop: OnlineShopKey | null | undefined): boolean {
  return onlineShop != null;
}
