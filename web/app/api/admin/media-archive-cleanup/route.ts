import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getSessionUser, isStaff } from "@/lib/supabase/server";
import { cleanupMediaArchiveForRange, type MediaArchiveRange } from "@/lib/media-archive-export";

export const runtime = "nodejs";
export const maxDuration = 60;

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me || !isStaff(me.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = serviceSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "Server cleanup is not configured.", hint: "Set SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { from?: unknown; to?: unknown };
  const from = typeof body.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.from) ? body.from : null;
  const to = typeof body.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.to) ? body.to : null;
  const range: MediaArchiveRange = { from, to };

  try {
    const result = await cleanupMediaArchiveForRange(admin, range);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Cleanup failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
