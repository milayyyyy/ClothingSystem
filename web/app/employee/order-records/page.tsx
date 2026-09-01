import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { OrderRecordsClient } from "@/components/order-records-client";
import { parseUsageSheets, type OrderRecordRow } from "@/lib/order-records";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EmployeeOrderRecordsPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");

  const supabase = createClient();
  const [{ data: records }, { data: attachments }] = await Promise.all([
    supabase
      .from("order_records")
      .select("*")
      .eq("submitted_by", me.id)
      .order("record_date", { ascending: false }),
    supabase.from("order_record_attachments").select("*"),
  ]);

  const recordIds = new Set((records || []).map((r) => r.id));
  const myAttachments = (attachments || []).filter((a) => recordIds.has(a.record_id));

  const initialRecords: OrderRecordRow[] = (records || []).map((r) => ({
    id: r.id,
    submitted_by: r.submitted_by,
    record_date: r.record_date,
    title: r.title,
    notes: r.notes,
    status: r.status,
    stock_lines: parseUsageSheets(r.stock_lines),
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
    rejection_reason: r.rejection_reason,
    created_at: r.created_at,
    updated_at: r.updated_at,
    submitter: { full_name: me.profile.full_name, email: me.email ?? "" },
  }));

  return (
    <div>
      <PageHeader
        title="Daily Order Records"
        description="Upload order PDFs or photos and fill in usage sheets with your own row/column labels. Admin deducts stock manually after review."
      />
      <OrderRecordsClient
        mode="employee"
        userId={me.id}
        initialRecords={initialRecords}
        initialAttachments={myAttachments}
        submitters={[{ id: me.id, full_name: me.profile.full_name, email: me.email ?? "" }]}
      />
    </div>
  );
}
