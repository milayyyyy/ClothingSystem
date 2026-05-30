import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { canManageOrderSheet } from "@/lib/can-manage-order-sheet";
import { extensionFromFileName, isImageUploadFile } from "@/lib/sublimation-teams";
import { createClient, getSessionUser } from "@/lib/supabase/server";

const BUCKET = "jersey-designs";
const MAX_BYTES = 15 * 1024 * 1024;

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { orderId: string } },
) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const orderId = params.orderId;
  const supabase = createClient();
  const allowed = await canManageOrderSheet(supabase, me.id, me.profile.role, orderId);
  if (!allowed) {
    return NextResponse.json({ error: "You do not have permission to upload design photos for this order." }, { status: 403 });
  }

  const admin = serviceSupabase();
  if (!admin) {
    return NextResponse.json(
      {
        error: "Server upload is not configured.",
        hint: "Add SUPABASE_SERVICE_ROLE_KEY to the deployment environment (Vercel → Settings → Environment Variables).",
      },
      { status: 500 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  const teamKey = String(form.get("teamKey") ?? "").trim();
  if (!(file instanceof File) || !teamKey) {
    return NextResponse.json({ error: "file and teamKey are required" }, { status: 400 });
  }
  if (!isImageUploadFile(file)) {
    return NextResponse.json({ error: "Choose an image file (JPG, PNG, HEIC, etc.)" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 15 MB or smaller" }, { status: 400 });
  }

  const id = crypto.randomUUID();
  const ext = extensionFromFileName(file.name);
  const path = `${orderId}/teams/${teamKey}/${id}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || undefined,
  });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ publicUrl: pub.publicUrl, path });
}
