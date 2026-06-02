import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import {
  ORDER_RECORD_BUCKET,
  attachmentKind,
  safeAttachmentName,
} from "@/lib/order-records";
import { createClient, getSessionUser, isStaff } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024;

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function canAccessRecord(recordId: string, userId: string, role: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("order_records")
    .select("id, submitted_by, status")
    .eq("id", recordId)
    .maybeSingle();
  if (!data) return { ok: false as const, status: 404, error: "Record not found" };
  if (isStaff(role) || data.submitted_by === userId) {
    return { ok: true as const, record: data };
  }
  return { ok: false as const, status: 403, error: "Forbidden" };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { recordId: string } },
) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const recordId = params.recordId;
  const access = await canAccessRecord(recordId, me.id, me.profile.role);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const isAdmin = isStaff(me.profile.role);
  if (!isAdmin) {
    if (access.record.submitted_by !== me.id) {
      return NextResponse.json({ error: "Only the submitter can upload files." }, { status: 403 });
    }
    if (!["draft", "rejected"].includes(access.record.status)) {
      return NextResponse.json({ error: "Cannot add files after submission." }, { status: 400 });
    }
  }

  const admin = serviceSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "Server upload is not configured.", hint: "Set SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const kind = attachmentKind(file);
  if (!kind) {
    return NextResponse.json({ error: "Upload a PDF or image (JPG, PNG, etc.)." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File must be 20 MB or smaller." }, { status: 400 });
  }

  const path = `${me.id}/${recordId}/${Date.now()}-${safeAttachmentName(file.name)}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from(ORDER_RECORD_BUCKET).upload(path, bytes, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const { data: row, error: insErr } = await admin
    .from("order_record_attachments")
    .insert({
      record_id: recordId,
      path,
      file_name: file.name,
      mime_type: file.type || null,
      kind,
    })
    .select("id, record_id, path, file_name, mime_type, kind, created_at")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });

  return NextResponse.json({ attachment: row });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { recordId: string } },
) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const recordId = params.recordId;
  const attachmentId = req.nextUrl.searchParams.get("attachmentId");
  if (!attachmentId) {
    return NextResponse.json({ error: "attachmentId is required" }, { status: 400 });
  }

  const access = await canAccessRecord(recordId, me.id, me.profile.role);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const isAdmin = isStaff(me.profile.role);
  if (!isAdmin && access.record.submitted_by !== me.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isAdmin && !["draft", "rejected"].includes(access.record.status)) {
    return NextResponse.json({ error: "Cannot remove files after submission." }, { status: 400 });
  }

  const admin = serviceSupabase();
  if (!admin) {
    return NextResponse.json(
      { error: "Server upload is not configured.", hint: "Set SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 },
    );
  }

  const { data: att, error: fetchErr } = await admin
    .from("order_record_attachments")
    .select("id, path, record_id")
    .eq("id", attachmentId)
    .eq("record_id", recordId)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!att) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  await admin.storage.from(ORDER_RECORD_BUCKET).remove([att.path]);
  const { error: delErr } = await admin.from("order_record_attachments").delete().eq("id", attachmentId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
