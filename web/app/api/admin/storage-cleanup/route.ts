import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/supabase/server";
import { cleanupOrphanMedia } from "@/lib/storage-orphans";

export const runtime = "nodejs";
export const maxDuration = 60;

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST() {
  const me = await getSessionUser();
  if (!me || me.profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = serviceSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "Server cleanup is not configured.", hint: "Set SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  try {
    const result = await cleanupOrphanMedia(admin);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Cleanup failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
