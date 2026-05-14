import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ReturnsClient } from "./returns-client";

export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  const supabase = createClient();

  const [
    { data: returnOrders },
    { data: completedOrders },
    { data: invItems },
    { data: rmGroups },
    { data: rmBoards },
  ] = await Promise.all([
    // Orders already in a return state
    supabase
      .from("orders")
      .select("id,order_no,customer_name,kind,order_type,source,stage,status,total,down_payment,return_status,return_reason,return_inventory_type,return_inventory_ref,updated_at,created_at")
      .not("return_status", "is", null)
      .order("updated_at", { ascending: false }),

    // Completed orders not yet in return flow
    supabase
      .from("orders")
      .select("id,order_no,customer_name,kind,order_type,source,stage,status,total,down_payment,return_status,notes,updated_at,created_at")
      .or("stage.eq.completed,stage.eq.for_pickup,status.eq.completed,status.eq.delivered")
      .is("return_status", null)
      .order("updated_at", { ascending: false })
      .limit(200),

    // Regular inventory items
    supabase
      .from("inventory")
      .select("id,name,category,quantity,unit")
      .order("name"),

    // Ready-made groups
    supabase
      .from("ready_made_sheet_groups")
      .select("id,name,sort_order")
      .order("sort_order"),

    // Ready-made boards/sheets
    supabase
      .from("ready_made_boards")
      .select("id,name,group_id,sort_order")
      .order("sort_order"),
  ]);

  return (
    <div>
      <PageHeader
        title="Returns"
        description="Track orders returned by buyers and restock them into inventory."
      />
      <ReturnsClient
        returnOrders={returnOrders || []}
        completedOrders={completedOrders || []}
        invItems={invItems || []}
        rmGroups={rmGroups || []}
        rmBoards={rmBoards || []}
      />
    </div>
  );
}
