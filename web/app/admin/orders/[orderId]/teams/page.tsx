import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { TeamsSheetClient } from "./teams-sheet-client";

export const dynamic = "force-dynamic";

export default async function TeamsSheetPage({ params }: { params: { orderId: string } }) {
  const supabase = createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_no, customer_name, kind, order_type")
    .eq("id", params.orderId)
    .single();
  if (!order) notFound();
  return (
    <TeamsSheetClient
      orderId={order.id}
      orderNo={Number(order.order_no)}
      customerName={order.customer_name}
    />
  );
}
