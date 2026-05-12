import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { MyOrdersClient } from "./my-orders-client";

export const dynamic = "force-dynamic";

export default async function MyOrdersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = createClient();
  // RLS (orders_select) already limits rows to assigned_to = auth.uid(); no .eq() so we never drift from session.
  const { data, error } = await supabase.from("orders").select("*").order("due_date", { ascending: true });
  if (error) {
    console.error("employee orders:", error.message);
  }
  return (
    <div>
      <PageHeader title="My Orders" description="Update status as you progress" />
      <MyOrdersClient initial={data || []} />
    </div>
  );
}
