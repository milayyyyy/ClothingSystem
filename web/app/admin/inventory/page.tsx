import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { InventoryClient } from "./inventory-client";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  const supabase = createClient();
  const { data } = await supabase.from("inventory").select("*").order("name");
  return (
    <div>
      <PageHeader title="Inventory" description="Stock levels and replenishment" />
      <InventoryClient initial={data || []} canEdit />
    </div>
  );
}
