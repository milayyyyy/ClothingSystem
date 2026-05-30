import { createClient, requireStaff } from "@/lib/supabase/server";
import { AdminOrderRecordReview } from "@/components/admin-order-record-review";
import { parseUsageSheets, type OrderRecordRow } from "@/lib/order-records";
import { redirect, notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminOrderRecordReviewPage({
  params,
}: {
  params: { recordId: string };
}) {
  const me = await requireStaff();
  if (!me) redirect("/login");

  const supabase = createClient();
  const { data: row } = await supabase
    .from("order_records")
    .select("*")
    .eq("id", params.recordId)
    .maybeSingle();

  if (!row) notFound();

  const [{ data: attachments }, { data: submitter }] = await Promise.all([
    supabase.from("order_record_attachments").select("*").eq("record_id", row.id),
    supabase.from("profiles").select("id, full_name, email").eq("id", row.submitted_by).maybeSingle(),
  ]);

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
    submitter: submitter ?? null,
  };

  return (
    <AdminOrderRecordReview
      userId={me.id}
      record={record}
      attachments={attachments || []}
    />
  );
}
