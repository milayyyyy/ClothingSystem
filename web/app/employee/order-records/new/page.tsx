import { getSessionUser } from "@/lib/supabase/server";
import { OrderRecordEditor } from "@/components/order-record-editor";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EmployeeOrderRecordNewPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");

  return (
    <OrderRecordEditor
      mode="employee"
      userId={me.id}
      record={null}
      initialAttachments={[]}
      layout="page"
    />
  );
}
