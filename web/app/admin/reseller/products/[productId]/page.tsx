import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { isResellerRole } from "@/lib/roles";
import { parseResellerProduct } from "@/lib/reseller-products";
import { ResellerProductForm } from "../reseller-product-form";
import { ResellerProductView } from "../reseller-product-view";

export const dynamic = "force-dynamic";

export default async function EditResellerProductPage({ params }: { params: { productId: string } }) {
  const user = await getSessionUser();
  if (user?.profile.role === "employee") redirect("/admin/reseller/orders");
  if (!isResellerRole(user?.profile.role)) {
    return <ResellerProductForm productId={params.productId} />;
  }

  const supabase = createClient();
  const { data } = await supabase.from("reseller_products").select("*").eq("id", params.productId).maybeSingle();
  if (!data || (data as { status?: string }).status !== "listed") {
    redirect("/admin/reseller/products");
  }
  return <ResellerProductView product={parseResellerProduct(data as Record<string, unknown>)} />;
}
