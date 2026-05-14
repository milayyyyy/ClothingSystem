import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { TeamsSheetClient } from "./teams-sheet-client";

export const dynamic = "force-dynamic";

export default async function TeamsSheetPage({ params }: { params: { orderId: string } }) {
  const supabase = createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_no, customer_name, kind, order_type, down_payment, unit_price, quantity, jersey_line_prices")
    .eq("id", params.orderId)
    .single();
  if (!order) notFound();
  return (
    <TeamsSheetClient
      orderId={order.id}
      orderNo={Number(order.order_no)}
      customerName={order.customer_name}
      initialDownPayment={Number(order.down_payment ?? 0)}
      initialUnitPrice={Number(order.unit_price ?? 0)}
      initialQuantity={Number(order.quantity ?? 1)}
      initialLinePrices={(order.jersey_line_prices as Record<string, number>) ?? {}}
    />
  );
}
