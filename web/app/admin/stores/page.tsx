import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { StoresClient } from "./stores-client";

export const dynamic = "force-dynamic";

export default async function AdminStoresPage() {
  const supabase = createClient();
  const { data } = await supabase.from("stores").select("id,name,shop_type,notes,pdf_label").order("name");
  return (
    <div>
      <PageHeader
        title="Stores"
        description="Sales channels for product inventory (Shopee, TikTok Shop, physical shop, etc.)."
      />
      <StoresClient initial={data || []} />
    </div>
  );
}
