import { NextRequest, NextResponse } from "next/server";
import { createClient, getSessionUser, isStaff } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { recordId: string } },
) {
  const me = await getSessionUser();
  if (!me || !isStaff(me.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const supabase = createClient();
  const { data: record } = await supabase
    .from("order_records")
    .select("id, status")
    .eq("id", params.recordId)
    .maybeSingle();
  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  if (record.status !== "submitted") {
    return NextResponse.json({ error: "Only submitted records can be rejected." }, { status: 400 });
  }

  const { error } = await supabase
    .from("order_records")
    .update({
      status: "rejected",
      reviewed_by: me.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.recordId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
