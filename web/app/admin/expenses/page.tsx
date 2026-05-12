import { redirect } from "next/navigation";

export default function AdminExpensesLegacyRedirect() {
  redirect("/admin/sales-expenses/expenses");
}
