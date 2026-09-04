import { createClient, requireStaff } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { OrderRecordsClient } from "@/components/order-records-client";
import { parseUsageSheets, type OrderRecordRow } from "@/lib/order-records";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminOrderRecordsPage() {
  const me = await requireStaff();
  if (!me) redirect("/login");

  const supabase = createClient();
  const [{ data: records }, { data: attachments }, { data: profiles }, { data: profile }] = await Promise.all([
    supabase.from("order_records").select("*").order("record_date", { ascending: false }),
    supabase.from("order_record_attachments").select("*"),
    supabase.from("profiles").select("id, full_name, email"),
    supabase.from("profiles").select("role").eq("id", me.id).single(),
  ]);

  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

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
    submitter: profileMap.get(r.submitted_by) ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="Daily Order Records"
        description="Review employee submissions daily. Use their sheets as a guide and deduct inventory manually in Inventory / Ready-made."
      />
      <OrderRecordsClient
        mode="admin"
        userId={me.id}
        viewerRole={(profile?.role as string) ?? "manager"}
        initialRecords={initialRecords}
        initialAttachments={attachments || []}
        submitters={profiles || []}
      />
    </div>
  );
}
