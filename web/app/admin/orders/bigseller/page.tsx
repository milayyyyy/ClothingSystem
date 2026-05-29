import { redirect } from "next/navigation";

export default function AdminBigSellerOrdersLegacyRedirect() {
  redirect("/admin/orders?type=walkin_online");
}
