import { redirect } from "next/navigation";

export default function BigSellerSalesLegacyRedirect() {
  redirect("/admin/sales-expenses/sales");
}
