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
