import { NextRequest, NextResponse } from "next/server";
import { createClient as createSrv } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me || me.profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const { userId, password } = await req.json();
  if (!userId || !password || password.length < 6) {
    return NextResponse.json({ error: "userId and a password of at least 6 characters are required" }, { status: 400 });
  }

  const admin = createSrv(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
