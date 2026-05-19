import type { SupabaseClient } from "@supabase/supabase-js";
import { mapTeamsFromSupabase, type TeamDraft } from "@/lib/sublimation-teams";
import { getOrderKind, orderHasTeamsSheet } from "@/lib/sales";

/** Must match teams-sheet-client price chart keys. */
export function jerseyLineKey(name: string, size: string): string {
  return `${name.trim()}|||${size.trim()}`;
}

export type InvoiceLineItem = {
  key: string;
  name: string;
  size: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type OrderInvoiceData = {
  orderId: string;
  orderNo: number;
  customerName: string;
  customerPhone: string | null;
  createdAt: string;
  dueDate: string | null;
  isServicesSheet: boolean;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  downPayment: number;
  balance: number;
  notes: string | null;
  hasSheetPricing: boolean;
};

function buildLineItemsFromTeams(
  teams: TeamDraft[],
  linePrices: Record<string, number>,
): InvoiceLineItem[] {
  const map = new Map<string, { key: string; name: string; size: string; count: number }>();
  for (const team of teams) {
    for (const player of team.players) {
      for (const item of player.jersey_checklist) {
        const name = item.name.trim();
        if (!name) continue;
        const size = item.size.trim();
        const key = jerseyLineKey(name, size);
        const cur = map.get(key);
        if (cur) cur.count += 1;
        else map.set(key, { key, name, size, count: 1 });
      }
    }
  }
  return Array.from(map.values())
    .sort((a, b) => {
      const nc = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      if (nc !== 0) return nc;
      return a.size.localeCompare(b.size, undefined, { sensitivity: "base" });
    })
    .map((row) => {
      const unitPrice = Number(linePrices[row.key] ?? 0);
      return {
        key: row.key,
        name: row.name,
        size: row.size,
        quantity: row.count,
        unitPrice,
        subtotal: row.count * unitPrice,
      };
    });
}

export async function fetchOrderInvoiceData(
  supabase: SupabaseClient,
  orderId: string,
): Promise<OrderInvoiceData | null> {
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, order_no, customer_name, customer_phone, created_at, due_date, down_payment, unit_price, quantity, jersey_line_prices, teams_sheet_format, kind, order_type, source, notes",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) return null;

  const linePrices =
    order.jersey_line_prices && typeof order.jersey_line_prices === "object"
      ? (order.jersey_line_prices as Record<string, number>)
      : {};

  let teams: TeamDraft[] = [];
  if (orderHasTeamsSheet(order)) {
    const { data: teamRows } = await supabase
      .from("sublimation_teams")
      .select("id, name, sort_order, design_image_urls, players:sublimation_team_players(*)")
      .eq("order_id", orderId)
      .order("sort_order", { ascending: true });
    teams = mapTeamsFromSupabase(teamRows);
  }

  let lineItems = buildLineItemsFromTeams(teams, linePrices);
  const hasSheetPricing = lineItems.length > 0;

  const kind = getOrderKind(order as { kind?: string; order_type?: string });
  const sheetFmt = String(order.teams_sheet_format ?? "").toLowerCase();
  const isServicesSheet =
    kind === "services" || sheetFmt === "services";

  if (lineItems.length === 0) {
    const qty = Math.max(1, Number(order.quantity) || 1);
    const unit = Number(order.unit_price) || 0;
    if (unit > 0) {
      lineItems = [
        {
          key: "order-total",
          name: isServicesSheet ? "Services order" : "Order",
          size: "",
          quantity: qty,
          unitPrice: unit,
          subtotal: qty * unit,
        },
      ];
    }
  }

  const subtotal = lineItems.reduce((s, l) => s + l.subtotal, 0);
  const downPayment = Math.max(0, Number(order.down_payment) || 0);
  const balance = Math.max(0, subtotal - downPayment);

  return {
    orderId: order.id,
    orderNo: Number(order.order_no),
    customerName: order.customer_name || "Customer",
    customerPhone: order.customer_phone ?? null,
    createdAt: order.created_at || new Date().toISOString(),
    dueDate: order.due_date ?? null,
    isServicesSheet,
    lineItems,
    subtotal,
    downPayment,
    balance,
    notes: order.notes ?? null,
    hasSheetPricing,
  };
}
