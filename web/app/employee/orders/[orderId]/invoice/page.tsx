import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { fetchOrderInvoiceData } from "@/lib/order-invoice";
import { OrderInvoiceDocument } from "@/components/order-invoice-document";
import { OrderInvoiceToolbar } from "@/components/order-invoice-toolbar";

export const dynamic = "force-dynamic";

export default async function EmployeeOrderInvoicePage({
  params,
}: {
  params: { orderId: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const supabase = createClient();
  const invoice = await fetchOrderInvoiceData(supabase, params.orderId);
  if (!invoice) notFound();

  const backHref = `/employee/orders/${params.orderId}/teams`;

  return (
    <div className="invoice-page min-h-screen bg-muted/30 p-6 print:bg-white print:p-8">
      <OrderInvoiceToolbar backHref={backHref} />
      <p className="no-print mb-4 text-sm text-muted-foreground">
        <Link href="/employee/orders" className="text-primary underline-offset-4 hover:underline">
          My orders
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
