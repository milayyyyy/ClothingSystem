import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrderInvoiceData } from "@/lib/order-invoice";
import { OrderInvoiceDocument } from "@/components/order-invoice-document";
import { OrderInvoiceToolbar } from "@/components/order-invoice-toolbar";

export const dynamic = "force-dynamic";

function backHrefForKind(kind: string) {
  if (kind === "sublimation") return "/admin/orders?type=sublimation";
  if (kind === "services") return "/admin/orders?type=services";
  return "/admin/orders?type=walkin_online";
}

export default async function AdminOrderInvoicePage({
  params,
}: {
  params: { orderId: string };
}) {
  const supabase = createClient();
  const invoice = await fetchOrderInvoiceData(supabase, params.orderId);
  if (!invoice) notFound();

  const { data: order } = await supabase
    .from("orders")
    .select("kind, order_type")
    .eq("id", params.orderId)
    .single();

  const rawKind = String(order?.kind ?? order?.order_type ?? "local").toLowerCase();
  const orderKind =
    rawKind === "sublimation"
      ? "sublimation"
      : rawKind === "services"
        ? "services"
        : rawKind === "online"
          ? "online"
          : "local";

  const backHref = `/admin/orders/${params.orderId}/teams`;
  const ordersHref = backHrefForKind(orderKind);

  return (
    <div className="invoice-page min-h-screen bg-muted/30 p-6 print:bg-white print:p-8">
      <OrderInvoiceToolbar backHref={backHref} />
      <p className="no-print mb-4 text-sm text-muted-foreground">
        <Link href={ordersHref} className="text-primary underline-offset-4 hover:underline">
          Orders list
        </Link>
        {" · "}
        <Link href={backHref} className="text-primary underline-offset-4 hover:underline">
          Order sheet
        </Link>
      </p>
      <OrderInvoiceDocument invoice={invoice} />
    </div>
  );
}
