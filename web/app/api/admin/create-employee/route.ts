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
  if (!serviceKey || !url) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY on server" }, { status: 500 });
  }

  const body = await req.json();
  const { email, password, full_name, role, position, salary_type, salary_rate, phone } = body || {};
  if (!email || !password) return NextResponse.json({ error: "email and password required" }, { status: 400 });

  const admin = createSrv(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name },
  });
  if (error || !created.user) return NextResponse.json({ error: error?.message || "Could not create" }, { status: 400 });

  const { error: pErr } = await admin.from("profiles").update({
    full_name, role: role || "employee", position, salary_type: salary_type || "daily",
    salary_rate: Number(salary_rate || 0), phone, active: true,
  }).eq("id", created.user.id);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, id: created.user.id });
}
