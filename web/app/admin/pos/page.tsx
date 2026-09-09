import { createClient, getSessionUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PosClient } from "./pos-client";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const supabase = createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const role = user.profile.role as string;
  if (role === "employee") redirect("/admin");

  // Load inventory products for the product picker
  const [{ data: inventoryItems }, { data: financeAccounts }] = await Promise.all([
    supabase
      .from("inventory")
      .select("id, name, category, item_type, quantity, unit, unit_cost")
      .order("name"),
    supabase
      .from("finance_accounts")
      .select("id, name, kind, balance")
      .order("name"),
  ]);

  return (
    <PosClient
      inventoryItems={inventoryItems ?? []}
      financeAccounts={financeAccounts ?? []}
      viewerRole={role}
    />
  );
}
