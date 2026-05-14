import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { TeamsSheetClient } from "./teams-sheet-client";

export const dynamic = "force-dynamic";

export default async function TeamsSheetPage({ params }: { params: { orderId: string } }) {
  const supabase = createClient();

  // Core order data — must succeed or we 404.
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_no, customer_name, kind, order_type, down_payment, unit_price, quantity")
    .eq("id", params.orderId)
    .single();
  if (!order) notFound();

  // Pricing column added in migration 057 — gracefully fall back if not yet applied.
  let linePrices: Record<string, number> = {};
  try {
    const { data: pricingRow } = await supabase
      .from("orders")
      .select("jersey_line_prices")
      .eq("id", params.orderId)
      .single();
    if (pricingRow?.jersey_line_prices && typeof pricingRow.jersey_line_prices === "object") {
      linePrices = pricingRow.jersey_line_prices as Record<string, number>;
    }
  } catch {
    // column not yet in DB — ignore
  }

  return (
    <TeamsSheetClient
      orderId={order.id}
      orderNo={Number(order.order_no)}
      customerName={order.customer_name}
      initialDownPayment={Number(order.down_payment ?? 0)}
      initialUnitPrice={Number(order.unit_price ?? 0)}
      initialQuantity={Number(order.quantity ?? 1)}
      initialLinePrices={linePrices}
    />
  );
}
