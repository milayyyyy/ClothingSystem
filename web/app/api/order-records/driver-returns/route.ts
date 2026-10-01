import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  orderRecordReturnTab,
  parseStoredReturnImport,
  returnImportPrimary,
  type ReturnListTab,
} from "@/lib/bigseller-return-excel";
import { markOrdersReturnedToSeller } from "@/lib/order-record-returns";
import { getSessionUser, isStaff } from "@/lib/supabase/server";
import type { DriverReturnPick } from "@/lib/order-records";

export const runtime = "nodejs";

const ORDER_SELECT =
  "id,order_no,customer_name,waybill_no,external_order_no,sku_code,return_import,return_status";

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

type DriverReturnOrder = {
  id: string;
  order_no: string | null;
  customer_name: string | null;
  waybill_no: string | null;
  external_order_no: string | null;
  sku_code: string | null;
  return_status: string | null;
  return_import?: unknown;
};

function canUse(role: string | undefined) {
  return isStaff(role) || role === "employee";
}

function toPick(order: {
  id: string;
  order_no?: string | null;
  customer_name?: string | null;
  waybill_no?: string | null;
  external_order_no?: string | null;
  sku_code?: string | null;
  return_status?: string | null;
  return_import?: unknown;
}): DriverReturnPick {
  const stored = parseStoredReturnImport(order.return_import);
  const row = returnImportPrimary(order.return_import);
  const change = stored?.statusChange ?? null;
  const tracking =
    (change?.trackingNo || "").trim() ||
    (row?.returnTrackingNo || "").trim() ||
    (row?.trackingNo || "").trim() ||
    (order.waybill_no || "").trim();
  const tab: ReturnListTab = orderRecordReturnTab(order.return_status, order.return_import);
  return {
    orderId: order.id,
    orderNo: (order.order_no || row?.orderNo || "").trim(),
    trackingNo: tracking,
    productName: (row?.productName || "").trim(),
    customerName: (order.customer_name || row?.buyer || "").trim(),
    from: (change?.from || "").trim(),
    to: (change?.to || "").trim(),
    tab,
    packageNo: (row?.packageNo || order.sku_code || "").trim(),
    externalOrderNo: (order.external_order_no || "").trim(),
  };
}

/** All returns (returning / to be checked / returned) for daily order records. */
export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!canUse(me.profile.role)) {
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

  let { data: rows, error } = await admin
    .from("orders")
    .select(ORDER_SELECT)
    .in("return_status", ["returning", "returned"]);
  let orders: DriverReturnOrder[] = (rows ?? []) as DriverReturnOrder[];
  if (error && /return_import/i.test(error.message)) {
    const fallback = await admin
      .from("orders")
      .select("id,order_no,customer_name,waybill_no,external_order_no,sku_code,return_status")
      .in("return_status", ["returning", "returned"]);
    error = fallback.error;
    orders = (fallback.data ?? []) as DriverReturnOrder[];
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byId = new Map<string, DriverReturnOrder>();
  for (const row of orders) byId.set(row.id, row);

  const missing = includeIds.filter((id) => !byId.has(id));
  if (missing.length) {
    const { data: extra, error: extraErr } = await admin
      .from("orders")
      .select(ORDER_SELECT)
      .in("id", missing);
    if (extraErr) return NextResponse.json({ error: extraErr.message }, { status: 500 });
    for (const row of extra || []) byId.set(row.id, row);
  }

  const items = [...byId.values()]
    .map(toPick)
    .sort((a, b) => a.trackingNo.localeCompare(b.trackingNo) || a.orderNo.localeCompare(b.orderNo));

  return NextResponse.json({ items });
}

/** Mark matched returns as Returned to seller. */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!canUse(me.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = serviceSupabase();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const orderIds = Array.isArray(body.orderIds)
    ? body.orderIds.filter((id: unknown) => typeof id === "string" && id)
    : typeof body.orderId === "string" && body.orderId
      ? [body.orderId]
      : [];
  if (!orderIds.length) {
    return NextResponse.json({ error: "Select a return first." }, { status: 400 });
  }

  const { error } = await markOrdersReturnedToSeller(admin, orderIds);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
