import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { findBestFaceMatch, type FaceProfileCandidate } from "@/lib/face-match";

/**
 * POST /api/attendance/face-clock
 *
 * Called by the attendance kiosk. Receives a face descriptor, finds the
 * matching employee, and either clocks them in or out.
 *
 * The caller must be signed in as an `attendance` role account.
 * The route does NOT create a session for the matched employee — it only
 * touches the `attendance` table.
 */
export async function POST(req: NextRequest) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !anon) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const cookieStore = cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      get(name: string) { return cookieStore.get(name)?.value; },
      set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }); },
      remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: "", ...options }); },
    },
  });

  // Verify caller is an attendance account
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (callerProfile?.role !== "attendance") {
    return NextResponse.json({ error: "This endpoint is for attendance accounts only." }, { status: 403 });
  }

  // Parse body
  let body: { descriptor?: unknown };
  try { body = await req.json(); } catch {
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

  // Load all enrolled faces (employees, managers, media — anyone with a descriptor)
  const { data: rows, error: loadErr } = await supabase
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
    return NextResponse.json({ error: match.error }, { status: 404 });
  }

  const employee = match.profile;

  // Check if they have an open attendance (no time_out)
  const { data: openRecord } = await supabase
    .from("attendance")
    .select("id, time_in")
    .eq("user_id", employee.id)
    .is("time_out", null)
    .order("time_in", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = new Date().toISOString();
  let action: "time_in" | "time_out";
  let attendanceId: string | undefined;

  if (openRecord) {
    // Clock out
    const { error: outErr } = await supabase
      .from("attendance")
      .update({ time_out: now })
      .eq("id", openRecord.id);
    if (outErr) {
      return NextResponse.json({ error: "Failed to clock out: " + outErr.message }, { status: 500 });
    }
    action = "time_out";
    attendanceId = openRecord.id;
  } else {
    // Clock in
    const { data: newRow, error: inErr } = await supabase
      .from("attendance")
      .insert({ user_id: employee.id, time_in: now })
      .select("id")
      .single();
    if (inErr) {
      return NextResponse.json({ error: "Failed to clock in: " + inErr.message }, { status: 500 });
    }
    action = "time_in";
    attendanceId = newRow?.id;
  }

  return NextResponse.json({
    ok: true,
    action,
    attendanceId,
    employeeId: employee.id,
    employeeName: employee.full_name || employee.email,
    distance: match.distance,
    time: now,
  });
}
