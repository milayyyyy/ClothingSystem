import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { TeamsSheetClient } from "./teams-sheet-client";

export const dynamic = "force-dynamic";

function isSublimation(o: { kind?: string; order_type?: string } | null) {
  const raw = String(o?.kind ?? o?.order_type ?? "local").toLowerCase().trim();
  return raw === "sublimation";
}

export default async function TeamsSheetPage({ params }: { params: { orderId: string } }) {
  const supabase = createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_no, customer_name, kind, order_type")
    .eq("id", params.orderId)
    .single();
  if (!order) notFound();
  if (!isSublimation(order)) redirect("/admin/orders?type=sublimation");
  return (
    <TeamsSheetClient
      orderId={order.id}
      orderNo={Number(order.order_no)}
      customerName={order.customer_name}
    />
  );
}
