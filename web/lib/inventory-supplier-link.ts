export type InventorySupplierOption = {
  id: string;
  name: string;
  online_store_url?: string | null;
  social_media_url?: string | null;
};

/** True when the supplier is an online marketplace / ecommerce vendor. */
export function isOnlineEcommerceSupplier(
  supplierName: string | null | undefined,
  suppliers: InventorySupplierOption[],
): boolean {
  const trimmed = String(supplierName || "").trim();
  if (!trimmed) return false;

  const row = suppliers.find((s) => s.name === trimmed);
  if (row?.online_store_url?.trim() || row?.social_media_url?.trim()) return true;

  const n = trimmed.toLowerCase();
  return (
    n.includes("shopee") ||
    n.includes("lazada") ||
    n.includes("tiktok") ||
    n.includes("online") ||
    n.includes("ecommerce") ||
    n.includes("e-commerce") ||
    n.includes("marketplace") ||
    n.includes("shein") ||
    n.includes("temu") ||
    n.includes("amazon")
  );
}

export function supplierProductLinkLabel(supplierName: string | null | undefined): string {
  const n = String(supplierName || "").toLowerCase();
  if (n.includes("shopee")) return "Shopee product link";
  if (n.includes("lazada")) return "Lazada product link";
  if (n.includes("tiktok")) return "TikTok Shop product link";
  return "Online store product link";
}

export function normalizeSupplierLinkUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}
