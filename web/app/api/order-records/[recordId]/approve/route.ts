import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getSessionUser, isStaff } from "@/lib/supabase/server";

export const runtime = "nodejs";

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Approve record for admin review — stock is deducted manually by admin, not here. */
export async function POST(
  _req: NextRequest,
  { params }: { params: { recordId: string } },
) {
  const me = await getSessionUser();
  if (!me || !isStaff(me.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = serviceSupabase();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const recordId = params.recordId;
  const { data: record, error: fetchErr } = await admin
    .from("order_records")
    .select("id, status")
    .eq("id", recordId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  if (record.status !== "submitted") {
    return NextResponse.json({ error: "Only submitted records can be approved." }, { status: 400 });
  }

  const { error: upErr } = await admin
    .from("order_records")
    .update({
      status: "approved",
      reviewed_by: me.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recordId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
