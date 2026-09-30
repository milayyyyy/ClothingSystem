import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { markReturnStatusChecked } from "@/lib/bigseller-return-excel";
import { parseDriverReturns } from "@/lib/order-records";
import { getSessionUser, isStaff } from "@/lib/supabase/server";

export const runtime = "nodejs";

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Approve record — selected driver returns move to Returned to seller. Stock is deducted manually. */
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
    .select("id, status, driver_returns")
    .eq("id", recordId)
    .maybeSingle();
  if (fetchErr) {
    if (/driver_returns/i.test(fetchErr.message)) {
      const { data: fallback, error: fallbackErr } = await admin
        .from("order_records")
        .select("id, status")
        .eq("id", recordId)
        .maybeSingle();
      if (fallbackErr) return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
      if (!fallback) return NextResponse.json({ error: "Record not found" }, { status: 404 });
      if (fallback.status !== "submitted") {
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
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }
  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });
  if (record.status !== "submitted") {
    return NextResponse.json({ error: "Only submitted records can be approved." }, { status: 400 });
  }

  const picks = parseDriverReturns(record.driver_returns);
  const now = new Date().toISOString();
  for (const pick of picks) {
    const { data: order, error: orderErr } = await admin
      .from("orders")
      .select("id, return_import")
      .eq("id", pick.orderId)
      .maybeSingle();
    if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 });
    if (!order) continue;
    const checkedImport = markReturnStatusChecked(order.return_import);
    const { error: moveErr } = await admin
      .from("orders")
      .update({
        return_status: "returned",
        updated_at: now,
        ...(checkedImport ? { return_import: checkedImport } : {}),
      })
      .eq("id", order.id);
    if (moveErr) return NextResponse.json({ error: moveErr.message }, { status: 500 });
  }

  const { error: upErr } = await admin
    .from("order_records")
    .update({
      status: "approved",
      reviewed_by: me.id,
      reviewed_at: now,
      rejection_reason: null,
      updated_at: now,
    })
    .eq("id", recordId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
