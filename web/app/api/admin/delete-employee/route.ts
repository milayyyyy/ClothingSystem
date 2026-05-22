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

  const body = await req.json();
  const userId = String(body?.userId || "").trim();
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  if (userId === me.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const admin = createSrv(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: target, error: loadErr } = await admin
    .from("profiles")
    .select("id, role, full_name, email")
    .eq("id", userId)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 400 });
  if (!target) return NextResponse.json({ error: "Employee not found." }, { status: 404 });

  if (target.role === "admin") {
    return NextResponse.json(
      { error: "Cannot delete an admin account. Change their role first, then try again." },
      { status: 400 },
    );
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
