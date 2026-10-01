import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ResellerNav } from "../reseller-nav";
import { ResellerOrdersClient } from "./reseller-orders-client";
import { asResellerProductList, resellerTableMissing } from "@/lib/reseller-products";
import {
  parseResellerOrder,
  resellerOrdersTableMissing,
  RESELLER_ORDER_SELECT,
  RESELLER_ORDER_SELECT_BASE,
  type ResellerDeskAccount,
} from "@/lib/reseller-orders";
import { isResellerRole, isStaffRole } from "@/lib/roles";
import { formatSupabaseError } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ResellerOrderPage() {
  const supabase = createClient();
  const user = await getSessionUser();
  const staffView = isStaffRole(user?.profile.role);
  const [ordersRes, { data: productRows, error: productErr }, staffRes] = await Promise.all([
    supabase.from("reseller_orders").select(RESELLER_ORDER_SELECT).order("created_at", { ascending: false }),
    supabase.from("reseller_products").select("*").order("name"),
    staffView
      ? supabase
          .from("profiles")
          .select("id, full_name, email, role")
          .in("role", ["admin", "manager", "employee"])
          .eq("active", true)
          .order("full_name")
      : Promise.resolve({ data: [] as ResellerDeskAccount[], error: null }),
  ]);
  let orderRows = ordersRes.data;
  let orderErr = ordersRes.error;
  let processMissing = false;
  if (orderErr) {
    const fallback = await supabase
      .from("reseller_orders")
      .select(RESELLER_ORDER_SELECT_BASE)
      .order("created_at", { ascending: false });
    if (!fallback.error) {
      orderRows = fallback.data;
      orderErr = null;
      processMissing = true;
    }
  }
  const missing =
    processMissing ||
    (orderErr && resellerOrdersTableMissing(formatSupabaseError(orderErr))) ||
    (productErr && resellerTableMissing(formatSupabaseError(productErr)));
  const catalog = asResellerProductList(productRows).filter((p) => !isResellerRole(user?.profile.role) || p.status === "listed");
  const accounts: ResellerDeskAccount[] = (staffRes.data || []).map((row) => ({
    id: String((row as ResellerDeskAccount).id || ""),
    full_name: String((row as ResellerDeskAccount).full_name || ""),
    email: String((row as ResellerDeskAccount).email || ""),
    role: String((row as ResellerDeskAccount).role || ""),
  })).filter((row) => row.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reseller Order"
        description={
          isResellerRole(user?.profile.role)
            ? "Place an order and track the list."
            : staffView
              ? "Review downpayment, send orders to an account, and update process."
              : "Orders sent to your account and orders still in pending/checking."
        }
      />
      <ResellerNav />
      <ResellerOrdersClient
        initial={(orderRows || []).map((row) => parseResellerOrder(row as Record<string, unknown>))}
        products={catalog}
        accounts={accounts}
        tableMissing={Boolean(missing)}
      />
    </div>
  );
}
