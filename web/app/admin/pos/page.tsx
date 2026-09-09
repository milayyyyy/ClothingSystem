import { createClient, getSessionUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PosClient } from "./pos-client";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const supabase = createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const role = user.profile.role as string;
  if (role !== "admin" && role !== "manager") redirect("/employee");

  // Load inventory products + ready-made boards/rows + finance accounts
  const [{ data: inventoryItems }, { data: readyMadeBoards }, { data: readyMadeRows }, { data: financeAccounts }] = await Promise.all([
    supabase
      .from("inventory")
      .select("id, name, category, item_type, quantity, unit, unit_cost")
      .order("name"),
    supabase
      .from("ready_made_boards")
      .select("id, name")
      .order("name"),
    supabase
      .from("ready_made_rows")
      .select("id, board_id, row_label")
      .order("sort_order"),
    supabase
      .from("finance_accounts")
      .select("id, name, kind, balance")
      .order("name"),
  ]);

  return (
    <PosClient
      inventoryItems={inventoryItems ?? []}
      readyMadeBoards={readyMadeBoards ?? []}
      readyMadeRows={readyMadeRows ?? []}
      financeAccounts={financeAccounts ?? []}
      viewerRole={role}
    />
  );
}
