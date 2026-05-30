import { createClient, getSessionUser } from "@/lib/supabase/server";
import { OrderRecordEditor } from "@/components/order-record-editor";
import { parseUsageSheets, type OrderRecordRow } from "@/lib/order-records";
import { redirect, notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EmployeeOrderRecordPage({
  params,
}: {
  params: { recordId: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");

  const supabase = createClient();
  const { data: row } = await supabase
    .from("order_records")
    .select("*")
    .eq("id", params.recordId)
    .eq("submitted_by", me.id)
    .maybeSingle();

  if (!row) notFound();

  const { data: attachments } = await supabase
    .from("order_record_attachments")
    .select("*")
    .eq("record_id", row.id);

  const record: OrderRecordRow = {
    id: row.id,
    submitted_by: row.submitted_by,
    record_date: row.record_date,
    title: row.title,
    notes: row.notes,
    status: row.status,
    stock_lines: parseUsageSheets(row.stock_lines),
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    rejection_reason: row.rejection_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
    submitter: { full_name: me.profile.full_name, email: me.email ?? "" },
  };

  const readOnly = record.status !== "draft" && record.status !== "rejected";

  return (
    <OrderRecordEditor
      mode="employee"
      userId={me.id}
      record={record}
      initialAttachments={attachments || []}
      layout="page"
      readOnly={readOnly}
    />
  );
}
