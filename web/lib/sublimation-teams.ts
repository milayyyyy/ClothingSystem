import type { SupabaseClient } from "@supabase/supabase-js";

export type JerseyChecklistItem = { id: string; name: string; size: string; checked: boolean };

export type PlayerDraft = {
  id?: string;
  clientKey: string;
  surname: string;
  jersey_number: string;
  jersey_checklist: JerseyChecklistItem[];
  design_approved: boolean;
  design_image_url: string;
};

export type TeamDraft = {
  id?: string;
  clientKey: string;
  name: string;
  /** Public URLs (e.g. Supabase storage) for this team’s design references. */
  design_image_urls: string[];
  players: PlayerDraft[];
};

export function newClientKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const IMAGE_UPLOAD_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "avif",
]);

export function extensionFromFileName(name: string): string {
  const m = /\.([a-zA-Z0-9]{1,8})$/.exec(name);
  return m ? m[1]!.toLowerCase() : "jpg";
}

/** Accept standard image MIME types and phone formats (HEIC) even when MIME is empty. */
export function isImageUploadFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  if (!file.type && file.size > 0) return true;
  return IMAGE_UPLOAD_EXTENSIONS.has(extensionFromFileName(file.name));
}

export function jerseyDesignUploadErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "Upload failed");
  if (/bucket not found/i.test(msg)) {
    return "Design photo storage is not set up. Apply Supabase migration 016 (jersey-designs bucket).";
  }
  if (/row-level security|policy|permission|403|401|jwt/i.test(msg)) {
    return "You do not have permission to upload design photos. Ask an admin to apply migration 087, or sign in as admin/sub-admin.";
  }
  return msg || "Upload failed";
}

export function jerseyDesignSaveErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "Save failed");
  if (/design_image_urls|column.*does not exist/i.test(msg)) {
    return "Database is missing design_image_urls. Apply Supabase migration 018.";
  }
  if (/row-level security|policy|permission|403/i.test(msg)) {
    return "Photos uploaded but could not save to the sheet. Apply migration 087 or sign in as admin/sub-admin.";
  }
  return `Photos uploaded but could not save to the sheet: ${msg || "unknown error"}`;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseJerseyChecklist(p: Record<string, unknown>): JerseyChecklistItem[] {
  const jc = p.jersey_checklist;
  if (jc == null || !Array.isArray(jc) || jc.length === 0) return [];
  return jc.map((x: unknown) => {
    const o = x as Record<string, unknown>;
    return {
      id: typeof o?.id === "string" && o.id ? (o.id as string) : newClientKey(),
      name: String(o?.name ?? ""),
      size: String(o?.size ?? ""),
      checked: Boolean(o?.checked),
    };
  });
}

export function emptyPlayer(): PlayerDraft {
  return {
    clientKey: newClientKey(),
    surname: "",
    jersey_number: "",
    jersey_checklist: [],
    design_approved: false,
    design_image_url: "",
  };
}

export function emptyTeam(): TeamDraft {
  return { clientKey: newClientKey(), name: "Team", design_image_urls: [], players: [emptyPlayer()] };
}

function parseTeamDesignUrls(t: Record<string, unknown>): string[] {
  const raw = t.design_image_urls;
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.filter((u): u is string => typeof u === "string" && u.trim().length > 0).map((u) => u.trim());
  }
  return [];
}

export function mapTeamsFromSupabase(data: any[] | null): TeamDraft[] {
  return (data || []).map((t: any) => ({
    id: t.id,
    clientKey: t.id,
    name: t.name || "Team",
    design_image_urls: parseTeamDesignUrls(t as Record<string, unknown>),
    players: [...(t.players || [])]
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((p: any) => ({
        id: p.id,
        clientKey: p.id,
        surname: p.surname || "",
        jersey_number: p.jersey_number || "",
        jersey_checklist: parseJerseyChecklist(p),
        design_approved: !!p.design_approved,
        design_image_url: p.design_image_url || "",
      })),
  }));
}

function normalizeChecklist(items: JerseyChecklistItem[]): JerseyChecklistItem[] {
  return items.map((x) => ({
    id: x.id || newClientKey(),
    name: String(x.name || "").trim(),
    size: String(x.size || "").trim(),
    checked: !!x.checked,
  }));
}

/** Update one team's gallery when the row already exists; otherwise persist the full sheet. */
export async function saveTeamDesignGallery(
  supabase: SupabaseClient,
  orderId: string,
  teamKey: string,
  urls: string[],
  allTeams: TeamDraft[],
): Promise<{ updatedInPlace: boolean }> {
  const gallery = urls.map((u) => u.trim()).filter(Boolean);

  if (UUID_RE.test(teamKey)) {
    const { data: row, error: selErr } = await supabase
      .from("sublimation_teams")
      .select("id")
      .eq("order_id", orderId)
      .eq("id", teamKey)
      .maybeSingle();
    if (selErr) throw selErr;
    if (row) {
      const { error } = await supabase
        .from("sublimation_teams")
        .update({ design_image_urls: gallery })
        .eq("id", teamKey);
      if (error) throw error;
      return { updatedInPlace: true };
    }
  }

  await persistSublimationTeams(supabase, orderId, allTeams);
  return { updatedInPlace: false };
}

export async function persistSublimationTeams(supabase: SupabaseClient, orderId: string, teams: TeamDraft[]) {
  const { error: delErr } = await supabase.from("sublimation_teams").delete().eq("order_id", orderId);
  if (delErr) throw delErr;
  for (let ti = 0; ti < teams.length; ti++) {
    const t = teams[ti];
    const gallery = (t.design_image_urls || []).map((u) => u.trim()).filter(Boolean);
    const { data: teamRow, error: terr } = await supabase
      .from("sublimation_teams")
      .insert({
        order_id: orderId,
        name: t.name?.trim() || "Team",
        sort_order: ti,
        design_image_urls: gallery,
      })
      .select("id")
      .single();
    if (terr) throw terr;
    if (!teamRow) continue;
    const rows = (t.players || []).map((p, pi) => {
      const checklist = normalizeChecklist(p.jersey_checklist || []).filter(
        (x) => x.name.length > 0 || x.size.length > 0 || x.checked,
      );
      return {
        team_id: teamRow.id,
        surname: (p.surname || "").trim() || "—",
        jersey_number: String(p.jersey_number ?? "").trim(),
        jersey_types: [] as string[],
        jersey_checklist: checklist,
        design_approved: false,
        design_image_url: null,
        sort_order: pi,
      };
    });
    if (rows.length) {
      const { error: perr } = await supabase.from("sublimation_team_players").insert(rows);
      if (perr) throw perr;
    }
  }
}
