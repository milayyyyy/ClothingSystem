import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { MyOrdersClient } from "./my-orders-client";

export const dynamic = "force-dynamic";

export default async function MyOrdersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = createClient();
  const { data } = await supabase.from("orders").select("*").eq("assigned_to", user.id).order("due_date", { ascending: true });
  return (
    <div>
      <PageHeader title="My Orders" description="Update status as you progress" />
      <MyOrdersClient initial={data || []} />
    </div>
  );
}
