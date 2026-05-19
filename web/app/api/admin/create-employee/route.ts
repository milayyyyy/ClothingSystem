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
  if (!url) return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL", hint: "Set it in web/.env.local and restart." }, { status: 500 });
  if (!serviceKey) return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY", hint: "Copy the service_role secret from Supabase → Project Settings → API into web/.env.local." }, { status: 500 });

  const body = await req.json();
  const { email, password, full_name, role, position, phone, date_of_birth, employment_start } = body || {};
  if (!email || !password) return NextResponse.json({ error: "email and password required" }, { status: 400 });

  const admin = createSrv(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name },
  });
  if (error || !created.user) return NextResponse.json({ error: error?.message || "Could not create" }, { status: 400 });

  const { error: pErr } = await admin.from("profiles").update({
    full_name,
    role: role || "employee",
    position: position?.trim() || null,
    phone: phone || null,
    active: true,
    salary_type: "daily",
    salary_rate: 0,
    allowance_basis: "none",
    allowance_amount: 0,
    allowance_weeks_n: null,
    break_minutes: 0,
    overtime_hourly_rate: 0,
    date_of_birth: date_of_birth || null,
    employment_start: employment_start || null,
    employment_category: "permanent",
  }).eq("id", created.user.id);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, id: created.user.id, profileId: created.user.id });
}
