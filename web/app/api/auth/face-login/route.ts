import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { findBestFaceMatch, type FaceProfileCandidate } from "@/lib/face-match";
import { isStaff } from "@/lib/supabase/server";

function envUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
}

function envAnon() {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
}

function envService() {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
}

export async function POST(req: NextRequest) {
  const url = envUrl();
  const anon = envAnon();
  const serviceKey = envService();
  if (!url || !anon) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  if (!serviceKey) {
    return NextResponse.json(
      { error: "Face login is not configured (missing service role key)." },
      { status: 500 },
    );
  }

  let body: { descriptor?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const raw = body.descriptor;
  if (!Array.isArray(raw) || raw.length < 128) {
    return NextResponse.json({ error: "A valid face scan is required." }, { status: 400 });
  }
  const descriptor = raw.map((v) => Number(v));
  if (descriptor.some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: "Invalid face data." }, { status: 400 });
  }

  const admin = createAdminClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: rows, error: loadErr } = await admin
    .from("profiles")
    .select("id, email, full_name, role, face_descriptor")
    .not("face_descriptor", "is", null);

  if (loadErr) {
    return NextResponse.json({ error: loadErr.message }, { status: 500 });
  }

  const candidates: FaceProfileCandidate[] = (rows ?? [])
    .filter(
      (r): r is typeof r & { face_descriptor: number[]; email: string } =>
        Array.isArray(r.face_descriptor) &&
        r.face_descriptor.length >= 128 &&
        typeof r.email === "string" &&
        r.email.length > 0,
    )
    .map((r) => ({
      id: r.id,
      email: r.email,
      full_name: r.full_name,
      role: r.role,
      face_descriptor: r.face_descriptor,
    }));

  const match = findBestFaceMatch(descriptor, candidates);
  if ("error" in match) {
    return NextResponse.json({ error: match.error }, { status: 401 });
  }

  const { profile } = match;

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: profile.email,
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    return NextResponse.json(
      { error: linkErr?.message ?? "Could not sign you in. Contact an admin." },
      { status: 500 },
    );
  }

  const cookieStore = cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set({ name, value: "", ...options });
      },
    },
  });

  const { error: sessionErr } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: linkData.properties.hashed_token,
  });
  if (sessionErr) {
    return NextResponse.json({ error: sessionErr.message }, { status: 500 });
  }

  let clockedIn = false;
  if (profile.role === "employee") {
    const { data: open } = await admin
      .from("attendance")
      .select("id")
      .eq("user_id", profile.id)
      .is("time_out", null)
      .order("time_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!open) {
      const { error: clockErr } = await admin.from("attendance").insert({
        user_id: profile.id,
        time_in: new Date().toISOString(),
      });
      if (!clockErr) clockedIn = true;
    } else {
      clockedIn = true;
    }
  }

  return NextResponse.json({
    ok: true,
    role: profile.role,
    fullName: profile.full_name,
    redirect: isStaff(profile.role) ? "/admin" : "/employee",
    clockedIn,
  });
}
