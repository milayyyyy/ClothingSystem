import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SuppliersClient } from "./suppliers-client";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const supabase = createClient();
  const { data } = await supabase.from("suppliers").select("*").order("name");
  return (
    <div>
      <PageHeader title="Suppliers" description="Vendor contacts and notes" />
      <SuppliersClient initial={data || []} />
    </div>
  );
}
