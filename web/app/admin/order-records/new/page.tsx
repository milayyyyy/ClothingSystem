import { requireStaff } from "@/lib/supabase/server";
import { OrderRecordEditor } from "@/components/order-record-editor";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminOrderRecordNewPage() {
  const me = await requireStaff();
  if (!me) redirect("/login");

  return (
    <OrderRecordEditor
      mode="admin"
      userId={me.id}
      record={null}
      initialAttachments={[]}
      layout="page"
    />
  );
}
