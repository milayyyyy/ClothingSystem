export type OrdersSortKey = "latest" | "oldest" | "quantity" | "unit_price" | "size";

export const ORDERS_SORT_OPTIONS: { value: OrdersSortKey; label: string }[] = [
  { value: "latest", label: "Latest" },
  { value: "oldest", label: "Oldest" },
  { value: "quantity", label: "Quantity" },
  { value: "unit_price", label: "Unit price" },
  { value: "size", label: "Size" },
];

const SHIRT_SIZE_RANK: Record<string, number> = {
  small: 1,
  medium: 2,
  large: 3,
  xlarge: 4,
  "2xlarge": 5,
  "3xlarge": 6,
};

function orderTimestampMs(o: { updated_at?: string | null; created_at?: string | null }): number {
  const t = new Date(o.updated_at || o.created_at || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

function shirtSizeRank(raw: string | null | undefined): number {
  const x = String(raw || "")
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!x) return 999;
  return SHIRT_SIZE_RANK[x] ?? 500;
}

/** Stable sort for admin orders tables (after filters). */
export function sortOrders<T extends {
  updated_at?: string | null;
  created_at?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  shirt_size?: string | null;
}>(rows: T[], sort: OrdersSortKey): T[] {
  const out = [...rows];
  out.sort((a, b) => {
    switch (sort) {
      case "oldest":
        return orderTimestampMs(a) - orderTimestampMs(b);
      case "quantity":
        return Number(b.quantity || 0) - Number(a.quantity || 0);
      case "unit_price":
        return Number(b.unit_price || 0) - Number(a.unit_price || 0);
      case "size": {
        const d = shirtSizeRank(a.shirt_size) - shirtSizeRank(b.shirt_size);
        return d !== 0 ? d : orderTimestampMs(b) - orderTimestampMs(a);
      }
      case "latest":
      default:
        return orderTimestampMs(b) - orderTimestampMs(a);
    }
  });
  return out;
}
