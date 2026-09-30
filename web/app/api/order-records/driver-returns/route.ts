import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  driverMarkedReturnedChange,
  parseStoredReturnImport,
  returnImportPrimary,
} from "@/lib/bigseller-return-excel";
import { getSessionUser, isStaff } from "@/lib/supabase/server";
import type { DriverReturnPick } from "@/lib/order-records";

export const runtime = "nodejs";

const ORDER_SELECT = "id,order_no,customer_name,waybill_no,return_import,return_status";

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function canList(role: string | undefined) {
  return isStaff(role) || role === "employee";
}

function toPick(order: {
  id: string;
  order_no?: string | null;
  customer_name?: string | null;
  waybill_no?: string | null;
  return_import?: unknown;
}): DriverReturnPick {
  const stored = parseStoredReturnImport(order.return_import);
  const row = returnImportPrimary(order.return_import);
  const change = driverMarkedReturnedChange(order.return_import) ?? stored?.statusChange ?? null;
  const tracking =
    (change?.trackingNo || "").trim() ||
    (row?.returnTrackingNo || "").trim() ||
    (row?.trackingNo || "").trim() ||
    (order.waybill_no || "").trim();
  return {
    orderId: order.id,
    orderNo: (order.order_no || row?.orderNo || "").trim(),
    trackingNo: tracking,
    productName: (row?.productName || "").trim(),
    customerName: (order.customer_name || row?.buyer || "").trim(),
    from: (change?.from || "").trim(),
    to: (change?.to || "").trim(),
  };
}

/** Returns the driver marked Returned (To be checked), for daily order records. */
export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!canList(me.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = serviceSupabase();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const includeIds = (req.nextUrl.searchParams.get("include") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const { data: rows, error } = await admin
    .from("orders")
    .select(ORDER_SELECT)
    .in("return_status", ["returning", "returned"])
    .not("return_import", "is", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const available: DriverReturnPick[] = [];
  const byId = new Map<string, (typeof rows)[number]>();
  for (const row of rows || []) {
    byId.set(row.id, row);
    if (driverMarkedReturnedChange(row.return_import)) {
      available.push(toPick(row));
    }
  }

  const missing = includeIds.filter((id) => !byId.has(id));
  if (missing.length) {
    const { data: extra, error: extraErr } = await admin
      .from("orders")
      .select(ORDER_SELECT)
      .in("id", missing);
    if (extraErr) return NextResponse.json({ error: extraErr.message }, { status: 500 });
    for (const row of extra || []) byId.set(row.id, row);
  }

  const selected: DriverReturnPick[] = [];
  for (const id of includeIds) {
    const row = byId.get(id);
    if (row) selected.push(toPick(row));
  }

  available.sort((a, b) => a.trackingNo.localeCompare(b.trackingNo) || a.orderNo.localeCompare(b.orderNo));

  return NextResponse.json({ available, selected });
}
