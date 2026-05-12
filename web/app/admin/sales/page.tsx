import { redirect } from "next/navigation";

export default function AdminSalesRedirectPage() {
  redirect("/admin/sales-expenses/sales");
}
