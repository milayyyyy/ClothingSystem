import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { OrderingClient, type RestockOrder } from "./ordering-client";

export const dynamic = "force-dynamic";

const SELECT =
  "id, status, kind, inventory_id, ready_made_row_id, ready_made_column_id, item_label, qty, notes, created_by, completed_at, created_at, updated_at";

export default async function OrderingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.profile.role === "employee") redirect("/employee");
  if (user.profile.role !== "admin" && user.profile.role !== "manager") redirect("/admin");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("restock_orders")
    .select(SELECT)
    .order("created_at", { ascending: false });

  const missingTable = Boolean(error && /restock_orders|does not exist|schema cache/i.test(error.message));

  return (
    <div>
      <PageHeader
        title="Ordering / Restocking"
        description="Track items currently on order. Completing a row adds the pending quantity to inventory or the ready-made cell."
      />
      <OrderingClient
        initial={missingTable ? [] : ((data as RestockOrder[]) || [])}
        userId={user.id}
        missingTable={missingTable}
      />
    </div>
  );
}
