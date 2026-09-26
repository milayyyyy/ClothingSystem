import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { isResellerRole } from "@/lib/roles";
import { ResellerProductForm } from "../reseller-product-form";

export const dynamic = "force-dynamic";

export default async function NewResellerProductPage() {
  const user = await getSessionUser();
  if (user?.profile.role === "employee") redirect("/admin/reseller/orders");
  if (isResellerRole(user?.profile.role)) redirect("/admin/reseller/products");
  return <ResellerProductForm />;
}
