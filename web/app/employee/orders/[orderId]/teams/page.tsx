import { createClient, getSessionUser } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { TeamsSheetClient } from "@/app/admin/orders/[orderId]/teams/teams-sheet-client";

export const dynamic = "force-dynamic";

export default async function EmployeeTeamsSheetPage({ params }: { params: { orderId: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_no, customer_name, kind, order_type, down_payment, unit_price, quantity")
    .eq("id", params.orderId)
    .single();
  if (!order) notFound();

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

  const rawKind = String(order.kind ?? order.order_type ?? "local").toLowerCase().trim();
  const orderKind =
    rawKind === "sublimation"
      ? "sublimation"
      : rawKind === "services"
        ? "services"
        : rawKind === "online"
          ? "online"
          : "local";

  return (
    <TeamsSheetClient
      orderId={order.id}
      orderNo={Number(order.order_no)}
      customerName={order.customer_name}
      orderKind={orderKind}
      initialDownPayment={Number(order.down_payment ?? 0)}
      initialUnitPrice={Number(order.unit_price ?? 0)}
      initialQuantity={Number(order.quantity ?? 1)}
      initialLinePrices={linePrices}
      readOnly
      backHref="/employee/orders"
    />
  );
}
