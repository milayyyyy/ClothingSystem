import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { canManageOrderSheet } from "@/lib/can-manage-order-sheet";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { persistSublimationTeams, saveTeamDesignGallery, type TeamDraft } from "@/lib/sublimation-teams";

export const runtime = "nodejs";

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { orderId: string } },
) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const orderId = params.orderId;
  const supabase = createClient();
  const allowed = await canManageOrderSheet(supabase, me.id, me.profile.role, orderId);
  if (!allowed) {
    return NextResponse.json({ error: "You do not have permission to save this order sheet." }, { status: 403 });
  }

  const admin = serviceSupabase();
  if (!admin) {
    return NextResponse.json(
      {
        error: "Server save is not configured.",
        hint: "Add SUPABASE_SERVICE_ROLE_KEY to the deployment environment (Vercel → Settings → Environment Variables).",
      },
      { status: 500 },
    );
  }

  const body = await req.json();
  const teamKey = String(body?.teamKey ?? "").trim();
  const urls = Array.isArray(body?.urls) ? (body.urls as unknown[]).filter((u): u is string => typeof u === "string") : [];
  const teams = Array.isArray(body?.teams) ? (body.teams as TeamDraft[]) : [];

  if (!teamKey) {
    return NextResponse.json({ error: "teamKey is required" }, { status: 400 });
  }

  try {
    const result = await saveTeamDesignGallery(admin, orderId, teamKey, urls, teams);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
