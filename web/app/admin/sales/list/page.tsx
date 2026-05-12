import { redirect } from "next/navigation";

export default function AdminSalesListRedirectPage() {
  redirect("/admin/sales-expenses/sales/list");
}
