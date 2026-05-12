import { NextRequest, NextResponse } from "next/server";
import { createClient as createSrv } from "@supabase/supabase-js";
import { getSessionUser } from "@/lib/supabase/server";
import { isEmployeePositionValue } from "@/lib/employee-positions";

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me || me.profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    return NextResponse.json(
      {
        error: "Missing NEXT_PUBLIC_SUPABASE_URL",
        hint: "Set it in web/.env.local (see .env.local.example) and restart the dev server.",
      },
      { status: 500 },
    );
  }
  if (!serviceKey) {
    return NextResponse.json(
      {
        error: "Missing SUPABASE_SERVICE_ROLE_KEY",
        hint: "Copy the service_role secret from Supabase → Project Settings → API into web/.env.local, then restart Next.js. Never expose this key in the browser (do not prefix with NEXT_PUBLIC_).",
      },
      { status: 500 },
    );
  }

  const body = await req.json();
  const { email, password, full_name, role, position, phone } = body || {};
  if (!email || !password) return NextResponse.json({ error: "email and password required" }, { status: 400 });

  const pos = typeof position === "string" ? position.trim().toLowerCase() : "";
  if (pos && !isEmployeePositionValue(pos)) {
    return NextResponse.json({ error: "Position must be sales, artist, staff, or sewer" }, { status: 400 });
  }

  const admin = createSrv(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: created, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name },
  });
  if (error || !created.user) return NextResponse.json({ error: error?.message || "Could not create" }, { status: 400 });

  const { error: pErr } = await admin.from("profiles").update({
    full_name,
    role: role || "employee",
    position: pos || null,
    phone,
    active: true,
    salary_type: "daily",
    salary_rate: 0,
    allowance_basis: "none",
    allowance_amount: 0,
    allowance_weeks_n: null,
    break_minutes: 0,
    overtime_hourly_rate: 0,
  }).eq("id", created.user.id);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, id: created.user.id });
}
