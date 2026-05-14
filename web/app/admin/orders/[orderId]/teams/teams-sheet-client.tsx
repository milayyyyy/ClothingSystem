"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  emptyPlayer,
  emptyTeam,
  mapTeamsFromSupabase,
  newClientKey,
  persistSublimationTeams,
  type JerseyChecklistItem,
  type PlayerDraft,
  type TeamDraft,
} from "@/lib/sublimation-teams";

type FlatRow = {
  rowId: string;
  teamKey: string;
  playerKey: string;
  teamName: string;
  /** Duplicated on each row of the team; kept in sync when editing. */
  teamDesignUrls: string[];
  surname: string;
  jersey_number: string;
  jerseyChecklist: JerseyChecklistItem[];
};

const TEAM_DESIGN_MAX = 24;
const DESIGN_BUCKET = "jersey-designs";

function peso(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function extFromFileName(name: string) {
  const m = /\.([a-zA-Z0-9]{1,8})$/.exec(name);
  return m ? m[1]!.toLowerCase() : "jpg";
}

/** Key used to identify a unique jersey line type in the price map. */
function jerseyLineKey(name: string, size: string): string {
  return `${name.trim()}|||${size.trim()}`;
}

// ---------------------------------------------------------------------------
// Team design photo strip
// ---------------------------------------------------------------------------
function TeamDesignStrip({
  urls,
  orderId,
  teamKey,
  disabled,
  uploading,
  onUrlsChange,
  onUploadError,
  onBusyChange,
}: {
  urls: string[];
  orderId: string;
  teamKey: string;
  disabled: boolean;
  uploading: boolean;
  onUrlsChange: (next: string[]) => void;
  onUploadError: (msg: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const list = input.files;
    input.value = "";
    if (!list?.length || disabled || uploading) return;
    const remaining = TEAM_DESIGN_MAX - urls.length;
    if (remaining <= 0) {
      onUploadError(`At most ${TEAM_DESIGN_MAX} design photos per team.`);
      return;
    }
    const files = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, remaining);
    if (!files.length) {
      onUploadError("Choose image files only.");
      return;
    }
    const added: string[] = [];
    onBusyChange(true);
    try {
      for (const file of files) {
        const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const path = `${orderId}/teams/${teamKey}/${id}.${extFromFileName(file.name)}`;
        const { error: upErr } = await supabase.storage.from(DESIGN_BUCKET).upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(DESIGN_BUCKET).getPublicUrl(path);
        if (pub?.publicUrl) added.push(pub.publicUrl);
      }
      onUrlsChange([...urls, ...added]);
    } catch (err) {
      console.error(err);
      onUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Design photos
        </label>
        <span className="text-[10px] text-muted-foreground/90">
          {urls.length}/{TEAM_DESIGN_MAX} · multi-select in the file picker (Ctrl/Cmd+click)
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {urls.map((url) => (
          <div
            key={url}
            className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40"
          >
            <img src={url} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100"
              disabled={disabled || uploading}
              onClick={() => onUrlsChange(urls.filter((u) => u !== url))}
            >
              Remove
            </button>
          </div>
        ))}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-label="Add design photos (choose multiple files at once)"
          onChange={onPickFiles}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 text-xs"
          disabled={disabled || uploading || urls.length >= TEAM_DESIGN_MAX}
          title="Opens file picker—you can select several images in one go"
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "Uploading…" : urls.length ? "Add more photos" : "Upload photos (multiple)"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Jersey order cell (name + size checklist per player)
// ---------------------------------------------------------------------------
function JerseyOrderCell({
  items,
  onChange,
  addLineLabel = "+ Add line",
}: {
  items: JerseyChecklistItem[];
  onChange: (next: JerseyChecklistItem[]) => void;
  addLineLabel?: string;
}) {
  return (
    <div className="flex min-w-[13rem] max-w-[24rem] flex-col gap-1.5 py-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-1 rounded border border-border/60 bg-muted/15 px-1 py-0.5"
        >
          <input
            type="checkbox"
            className="h-3.5 w-3.5 shrink-0"
            checked={item.checked}
            onChange={(e) =>
              onChange(items.map((x) => (x.id === item.id ? { ...x, checked: e.target.checked } : x)))
            }
            aria-label="Include on order"
          />
          <input
            className="min-w-0 flex-1 border-0 bg-transparent px-0.5 text-[11px] outline-none placeholder:text-muted-foreground/70 focus:ring-0"
            value={item.name}
            placeholder="Jersey line name…"
            onChange={(e) =>
              onChange(items.map((x) => (x.id === item.id ? { ...x, name: e.target.value } : x)))
            }
          />
          <input
            className="w-12 shrink-0 rounded border border-border/50 bg-background/80 px-1 py-px text-center text-[11px] font-mono outline-none placeholder:text-muted-foreground/60 focus:border-primary/40"
            value={item.size}
            placeholder="Sz"
            title="Size (e.g. S, M, L, XL, or numeric)"
            onChange={(e) =>
              onChange(items.map((x) => (x.id === item.id ? { ...x, size: e.target.value } : x)))
            }
            aria-label="Size"
          />
          <button
            type="button"
            className="shrink-0 rounded px-1 text-[12px] leading-none text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={() => onChange(items.filter((x) => x.id !== item.id))}
            aria-label="Remove line"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-left text-[10px] font-medium text-primary hover:underline"
        onClick={() => onChange([...items, { id: newClientKey(), name: "", size: "", checked: false }])}
      >
        {addLineLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers: flat row ↔ TeamDraft conversions
// ---------------------------------------------------------------------------
function teamsToFlatRows(teams: TeamDraft[]): FlatRow[] {
  const out: FlatRow[] = [];
  const gallery = (t: TeamDraft) => [...(t.design_image_urls || [])];
  for (const t of teams) {
    const urls = gallery(t);
    for (const p of t.players) {
      out.push({
        rowId: `${t.clientKey}__${p.clientKey}`,
        teamKey: t.clientKey,
        playerKey: p.clientKey,
        teamName: t.name,
        teamDesignUrls: urls,
        surname: p.surname,
        jersey_number: p.jersey_number,
        jerseyChecklist: (p.jersey_checklist || []).map((x) => ({ ...x })),
      });
    }
  }
  return out;
}

function flatRowsToTeams(rows: FlatRow[]): TeamDraft[] {
  const orderKeys: string[] = [];
  const byTeam = new Map<string, { name: string; designImageUrls: string[]; players: PlayerDraft[] }>();

  for (const r of rows) {
    if (!byTeam.has(r.teamKey)) {
      orderKeys.push(r.teamKey);
      byTeam.set(r.teamKey, {
        name: r.teamName.trim() || "Team",
        designImageUrls: [...r.teamDesignUrls],
        players: [],
      });
    } else {
      const g = byTeam.get(r.teamKey)!;
      g.name = r.teamName.trim() || "Team";
      g.designImageUrls = [...r.teamDesignUrls];
    }
    byTeam.get(r.teamKey)!.players.push({
      clientKey: r.playerKey,
      surname: r.surname,
      jersey_number: r.jersey_number,
      jersey_checklist: r.jerseyChecklist.map((x) => ({ ...x })),
      design_approved: false,
      design_image_url: "",
    });
  }

  return orderKeys.map((k) => {
    const g = byTeam.get(k)!;
    return {
      clientKey: k,
      name: g.name,
      design_image_urls: g.designImageUrls.map((u) => u.trim()).filter(Boolean),
      players:
        g.players.length > 0
          ? g.players
          : [emptyPlayer()].map((p) => ({ ...p, clientKey: newClientKey() })),
    };
  });
}

function defaultFlatRow(): FlatRow {
  const tk = newClientKey();
  const pk = newClientKey();
  return {
    rowId: `${tk}__${pk}`,
    teamKey: tk,
    playerKey: pk,
    teamName: "Team",
    teamDesignUrls: [],
    surname: "",
    jersey_number: "",
    jerseyChecklist: [],
  };
}

/** Preserve team order as first-seen in `rows` (matches save order). */
function groupRowsByTeam(rows: FlatRow[]): { teamKey: string; teamName: string; rows: FlatRow[] }[] {
  const keys: string[] = [];
  const map = new Map<string, FlatRow[]>();
  for (const r of rows) {
    if (!map.has(r.teamKey)) {
      keys.push(r.teamKey);
      map.set(r.teamKey, []);
    }
    map.get(r.teamKey)!.push(r);
  }
  return keys.map((teamKey) => {
    const list = map.get(teamKey)!;
    return { teamKey, teamName: list[0]?.teamName ?? "Team", rows: list };
  });
}

/** First non-empty size on the player's jersey lines (definition order). */
function primaryJerseyLineSize(row: FlatRow): string {
  for (const item of row.jerseyChecklist || []) {
    const s = item.size?.trim();
    if (s) return s;
  }
  return "";
}

const LETTER_SIZE_ORDER: readonly string[] = [
  "XXXS", "XXS", "YXS", "XS", "YS", "S", "YM", "M", "YL", "L",
  "YXL", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL",
];

function letterSizeIndex(raw: string): number {
  const u = raw.trim().toUpperCase();
  return LETTER_SIZE_ORDER.indexOf(u);
}

function compareJerseySizes(a: string, b: string): number {
  const ta = a.trim();
  const tb = b.trim();
  if (!ta && !tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  const ia = letterSizeIndex(ta);
  const ib = letterSizeIndex(tb);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  const na = Number(ta.replace(",", "."));
  const nb = Number(tb.replace(",", "."));
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return ta.localeCompare(tb, undefined, { numeric: true, sensitivity: "base" });
}

function compareJerseyNumbers(a: string, b: string): number {
  const ta = String(a ?? "").trim();
  const tb = String(b ?? "").trim();
  if (!ta && !tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  const na = Number.parseInt(ta.replace(/\D/g, "") || "NaN", 10);
  const nb = Number.parseInt(tb.replace(/\D/g, "") || "NaN", 10);
  const pureA = /^\d+$/.test(ta);
  const pureB = /^\d+$/.test(tb);
  if (pureA && pureB && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return ta.localeCompare(tb, undefined, { numeric: true, sensitivity: "base" });
}

type TeamRowSortMode = "surname" | "jersey_number" | "size";

function sortTeamPlayerRows(rows: FlatRow[], mode: TeamRowSortMode): FlatRow[] {
  const copy = [...rows];
  copy.sort((ra, rb) => {
    let c = 0;
    if (mode === "surname") {
      c = ra.surname.trim().localeCompare(rb.surname.trim(), undefined, { sensitivity: "base" });
      if (c !== 0) return c;
      c = compareJerseyNumbers(ra.jersey_number, rb.jersey_number);
      if (c !== 0) return c;
      return compareJerseySizes(primaryJerseyLineSize(ra), primaryJerseyLineSize(rb));
    }
    if (mode === "jersey_number") {
      c = compareJerseyNumbers(ra.jersey_number, rb.jersey_number);
      if (c !== 0) return c;
      c = ra.surname.trim().localeCompare(rb.surname.trim(), undefined, { sensitivity: "base" });
      if (c !== 0) return c;
      return compareJerseySizes(primaryJerseyLineSize(ra), primaryJerseyLineSize(rb));
    }
    c = compareJerseySizes(primaryJerseyLineSize(ra), primaryJerseyLineSize(rb));
    if (c !== 0) return c;
    c = ra.surname.trim().localeCompare(rb.surname.trim(), undefined, { sensitivity: "base" });
    if (c !== 0) return c;
    return compareJerseyNumbers(ra.jersey_number, rb.jersey_number);
  });
  return copy;
}

// ---------------------------------------------------------------------------
// Price chart – derived from jerseyChecklist across all flat rows
// ---------------------------------------------------------------------------
type JerseyLineType = {
  key: string;    // jerseyLineKey(name, size)
  name: string;
  size: string;
  count: number;  // total across all players (all items, not just checked)
};

function buildUniqueLines(rows: FlatRow[]): JerseyLineType[] {
  const map = new Map<string, JerseyLineType>();
  for (const row of rows) {
    for (const item of row.jerseyChecklist) {
      const n = item.name.trim();
      if (!n) continue;
      const key = jerseyLineKey(n, item.size);
      if (map.has(key)) {
        map.get(key)!.count++;
      } else {
        map.set(key, { key, name: n, size: item.size.trim(), count: 1 });
      }
    }
  }
  // Sort by name then size for stable display order
  return Array.from(map.values()).sort((a, b) => {
    const nc = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    if (nc !== 0) return nc;
    return compareJerseySizes(a.size, b.size);
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
function backHrefForKind(kind: string): string {
  if (kind === "sublimation") return "/admin/orders?type=sublimation";
  if (kind === "services") return "/admin/orders?type=services";
  return "/admin/orders?type=walkin_online";
}

type FinanceAccount = { id: string; name: string; kind: string; balance?: number | null };

// ---------------------------------------------------------------------------
// Finance account dialog for down payment
// ---------------------------------------------------------------------------
function FinanceAccountDialog({
  open,
  dpAmount,
  accounts,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  dpAmount: number;
  accounts: FinanceAccount[];
  onConfirm: (accountId: string) => void;
  onCancel: () => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  useEffect(() => { if (open && accounts.length) setAccountId(accounts[0]!.id); }, [open, accounts]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-background/80" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border bg-card p-6 shadow-2xl">
        <h2 className="text-base font-semibold">Record down payment</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A down payment of <span className="font-semibold text-foreground">{peso(dpAmount)}</span> will be recorded. Choose which finance account received this payment.
        </p>
        <div className="mt-4">
          <label className="text-xs font-medium">Finance account</label>
          <select
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.length === 0 && <option value="">— no accounts found —</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.kind}){a.balance != null ? ` — ₱${Number(a.balance).toLocaleString()}` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            onClick={onCancel}
          >
            Skip
          </button>
          <button
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={!accountId}
            onClick={() => onConfirm(accountId)}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

export function TeamsSheetClient({
  orderId,
  orderNo,
  customerName,
  orderKind = "local",
  initialDownPayment = 0,
  initialLinePrices = {},
}: {
  orderId: string;
  orderNo: number;
  customerName: string | null;
  orderKind?: string;
  initialDownPayment?: number;
  initialUnitPrice?: number;
  initialQuantity?: number;
  initialLinePrices?: Record<string, number>;
}) {
  const supabase = createClient();
  const [flatRows, setFlatRows] = useState<FlatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadingTeamKey, setUploadingTeamKey] = useState<string | null>(null);

  // ── Pricing state ──────────────────────────────────────────────────────────
  const [linePrices, setLinePrices] = useState<Record<string, number>>(initialLinePrices);
  const [downPaymentStr, setDownPaymentStr] = useState<string>(
    initialDownPayment > 0 ? String(initialDownPayment) : "",
  );
  // Tracks the last saved down payment so we only record the new portion
  const [savedDownPayment, setSavedDownPayment] = useState(initialDownPayment);

  // ── Finance account dialog ─────────────────────────────────────────────────
  const [financeAccounts, setFinanceAccounts] = useState<FinanceAccount[]>([]);
  const [dpDialogOpen, setDpDialogOpen] = useState(false);
  // Pending save payload — held until the dialog resolves
  const pendingSave = useRef<{ computedTotal: number; dp: number } | null>(null);

  const teamGroups = useMemo(() => groupRowsByTeam(flatRows), [flatRows]);

  /** All unique jersey line types across the whole order, with counts. */
  const uniqueLines = useMemo(() => buildUniqueLines(flatRows), [flatRows]);

  const orderTotal = useMemo(
    () => uniqueLines.reduce((sum, l) => sum + l.count * (linePrices[l.key] ?? 0), 0),
    [uniqueLines, linePrices],
  );
  const downPayment = Math.max(0, Number(downPaymentStr) || 0);
  const balance = orderTotal - downPayment;

  // ── Data loading ───────────────────────────────────────────────────────────
  const reload = useCallback(() => {
    setLoading(true);
    void supabase
      .from("sublimation_teams")
      .select("id, name, sort_order, design_image_urls, players:sublimation_team_players(*)")
      .eq("order_id", orderId)
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setFlatRows([defaultFlatRow()]);
          setLoading(false);
          return;
        }
        const teams = mapTeamsFromSupabase(data);
        const rows = teamsToFlatRows(teams.length ? teams : [emptyTeam()]);
        setFlatRows(rows.length ? rows : [defaultFlatRow()]);
        setLoading(false);
      });
  }, [orderId, supabase]);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Row mutation helpers ───────────────────────────────────────────────────
  function patchRow(rowId: string, patch: Partial<FlatRow>) {
    setFlatRows((prev) => {
      const i = prev.findIndex((r) => r.rowId === rowId);
      if (i < 0) return prev;
      const cur = prev[i]!;
      const next = { ...cur, ...patch };
      if (patch.teamName !== undefined && patch.teamName !== cur.teamName) {
        return prev.map((r) => (r.teamKey === cur.teamKey ? { ...r, teamName: patch.teamName! } : r));
      }
      const copy = [...prev];
      copy[i] = next;
      return copy;
    });
  }

  function patchTeamName(teamKey: string, name: string) {
    setFlatRows((prev) => prev.map((r) => (r.teamKey === teamKey ? { ...r, teamName: name } : r)));
  }

  function patchTeamDesignUrls(teamKey: string, urls: string[]) {
    setFlatRows((prev) => prev.map((r) => (r.teamKey === teamKey ? { ...r, teamDesignUrls: urls } : r)));
  }

  function sortTeamPlayers(teamKey: string, mode: TeamRowSortMode) {
    setFlatRows((prev) => {
      const groups = groupRowsByTeam(prev);
      const next: FlatRow[] = [];
      for (const g of groups) {
        next.push(...(g.teamKey === teamKey ? sortTeamPlayerRows(g.rows, mode) : g.rows));
      }
      return next;
    });
  }

  function addPlayerToTeam(teamKey: string) {
    setFlatRows((prev) => {
      const sample = prev.find((r) => r.teamKey === teamKey);
      const teamName = sample?.teamName ?? "Team";
      const teamDesignUrls = sample?.teamDesignUrls ?? [];
      const pk = newClientKey();
      const rowId = `${teamKey}__${pk}`;
      const newRow: FlatRow = {
        rowId, teamKey, playerKey: pk, teamName, teamDesignUrls,
        surname: "", jersey_number: "", jerseyChecklist: [],
      };
      let insertAt = prev.length;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i]!.teamKey === teamKey) { insertAt = i + 1; break; }
      }
      return [...prev.slice(0, insertAt), newRow, ...prev.slice(insertAt)];
    });
  }

  function addTeam() {
    setFlatRows((prev) => [...prev, defaultFlatRow()]);
  }

  function removeTeam(teamKey: string) {
    setFlatRows((prev) => {
      const next = prev.filter((r) => r.teamKey !== teamKey);
      return next.length ? next : [defaultFlatRow()];
    });
  }

  function removeRow(rowId: string) {
    setFlatRows((prev) => {
      const next = prev.filter((r) => r.rowId !== rowId);
      return next.length ? next : [defaultFlatRow()];
    });
  }

  // ── Save (teams + pricing) ─────────────────────────────────────────────────
  async function commitSave(computedTotal: number, dp: number, financeAccountId?: string) {
    setSaving(true);
    setMessage(null);
    try {
      // 1. Save teams/players
      const teams = flatRowsToTeams(flatRows);
      await persistSublimationTeams(supabase, orderId, teams);

      // 2. Save pricing back to the order
      const { error: orderErr } = await supabase
        .from("orders")
        .update({ jersey_line_prices: linePrices, unit_price: computedTotal, quantity: 1, down_payment: dp })
        .eq("id", orderId);

      if (orderErr) {
        const { error: fallbackErr } = await supabase
          .from("orders")
          .update({ unit_price: computedTotal, quantity: 1, down_payment: dp })
          .eq("id", orderId);
        if (fallbackErr) throw fallbackErr;
      }

      // 3. Record finance transaction for the new down payment portion
      if (financeAccountId && dp > savedDownPayment) {
        const newPortion = dp - savedDownPayment;
        const today = new Date().toISOString().slice(0, 10);
        await supabase.from("finance_transactions").insert({
          occurred_at: today,
          account_id: financeAccountId,
          direction: "in",
          amount: newPortion,
          description: `Down payment — Order #${orderNo}${customerName ? ` (${customerName})` : ""}`,
          notes: `teams_sheet_order:${orderId}`,
        });
      }

      setSavedDownPayment(dp);
      setMessage("Saved.");
      reload();
    } catch (e) {
      console.error(e);
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    const computedTotal = uniqueLines.reduce((sum, l) => sum + l.count * (linePrices[l.key] ?? 0), 0);
    const dp = Math.max(0, Number(downPaymentStr) || 0);

    // If there's a new/increased down payment, ask for a finance account first
    if (dp > savedDownPayment) {
      // Lazy-load finance accounts
      if (financeAccounts.length === 0) {
        const { data } = await supabase.from("finance_accounts").select("id,name,kind,balance").order("name");
        setFinanceAccounts((data as FinanceAccount[]) || []);
      }
      pendingSave.current = { computedTotal, dp };
      setDpDialogOpen(true);
      return;
    }

    // No new down payment — save directly
    await commitSave(computedTotal, dp);
  }

  function handleDpDialogConfirm(accountId: string) {
    setDpDialogOpen(false);
    if (!pendingSave.current) return;
    const { computedTotal, dp } = pendingSave.current;
    pendingSave.current = null;
    void commitSave(computedTotal, dp, accountId);
  }

  function handleDpDialogSkip() {
    setDpDialogOpen(false);
    if (!pendingSave.current) return;
    const { computedTotal, dp } = pendingSave.current;
    pendingSave.current = null;
    void commitSave(computedTotal, dp); // save without recording transaction
  }

  // ── Labels (change based on order kind) ──────────────────────────────────
  const isSvc = orderKind === "services";
  const L = {
    pageTitle:     isSvc ? "Services Order — sheet"   : "Teams & jerseys — sheet",
    addGroup:      isSvc ? "+ Services Order"          : "+ Team",
    groupNameLabel:isSvc ? "Customer name"             : "Team name",
    groupNamePlch: isSvc ? "Customer name"             : "Team name",
    sortLabel:     isSvc ? "Sort services"             : "Sort players",
    sortByName:    isSvc ? "Service name (A–Z)"        : "Surname (A–Z)",
    addRow:        isSvc ? "+ Service"                 : "+ Player",
    removeGroup:   isSvc ? "Remove services"           : "Remove team",
    colName:       isSvc ? "Services"                  : "Surname",
    colLines:      isSvc ? "Service Lines"             : "Jersey lines",
    noLines:       isSvc ? "No service lines yet. Add service lines above and they will appear here." : "No jersey lines yet. Add jersey lines to players above and they will appear here.",
    priceLineHdr:  isSvc ? "Service line"              : "Jersey line",
    footerHint:    isSvc ? "Each block is one customer/service order. Add design photos; set size beside each service line. Use + Services Order for another customer, then Save sheet." : "Each block is one team. Add design photos by the team name; set size beside each jersey line. Use + Team for another team, then Save sheet.",
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <FinanceAccountDialog
        open={dpDialogOpen}
        dpAmount={Math.max(0, (Number(downPaymentStr) || 0) - savedDownPayment)}
        accounts={financeAccounts}
        onConfirm={handleDpDialogConfirm}
        onCancel={handleDpDialogSkip}
      />
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={backHrefForKind(orderKind)}
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            ← Back to orders
          </Link>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">{L.pageTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Order <span className="font-mono">#{orderNo}</span>
            {customerName ? <> · {customerName}</> : null}. Tab between cells like a spreadsheet; use Save when done.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addTeam} disabled={loading}>
            {L.addGroup}
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={loading || saving}>
            {saving ? "Saving…" : "Save sheet"}
          </Button>
        </div>
      </div>

      {message && (
        <p className={`text-sm ${message === "Saved." ? "text-green-600" : "text-destructive"}`}>
          {message}
        </p>
      )}

      {/* Sheet */}
      <Card>
        <CardContent className="p-4">
          <div className="max-h-[calc(100dvh-14rem)] space-y-6 overflow-auto pr-1">
            {teamGroups.map((group) => (
              <div
                key={group.teamKey}
                className="rounded-lg border border-border bg-card/30 p-4 shadow-sm"
              >
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-3">
                  <div className="flex min-w-0 flex-1 flex-wrap items-end gap-4">
                    <div className="min-w-[10rem] max-w-md flex-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {L.groupNameLabel}
                      </label>
                      <Input
                        className="mt-1 h-9 font-medium"
                        value={group.teamName}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => patchTeamName(group.teamKey, e.target.value)}
                        placeholder={L.groupNamePlch}
                      />
                    </div>
                    <TeamDesignStrip
                      urls={group.rows[0]?.teamDesignUrls ?? []}
                      orderId={orderId}
                      teamKey={group.teamKey}
                      disabled={loading}
                      uploading={uploadingTeamKey === group.teamKey}
                      onUrlsChange={(next) => patchTeamDesignUrls(group.teamKey, next)}
                      onUploadError={(msg) => setMessage(msg)}
                      onBusyChange={(busy) => setUploadingTeamKey(busy ? group.teamKey : null)}
                    />
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {L.sortLabel}
                      </span>
                      <select
                        className="h-9 min-w-[11rem] rounded-md border border-input bg-background px-2 text-xs shadow-sm"
                        aria-label={L.sortLabel}
                        defaultValue=""
                        onChange={(e) => {
                          const v = e.target.value as TeamRowSortMode | "";
                          if (v) sortTeamPlayers(group.teamKey, v);
                          e.target.value = "";
                        }}
                        disabled={loading}
                      >
                        <option value="" disabled>Sort by…</option>
                        <option value="surname">{L.sortByName}</option>
                        {!isSvc && <option value="jersey_number">Jersey number</option>}
                        <option value="size">Size (first line)</option>
                      </select>
                    </div>
                    <Button type="button" size="sm" variant="secondary" onClick={() => addPlayerToTeam(group.teamKey)} disabled={loading}>
                      {L.addRow}
                    </Button>
                    <Button
                      type="button" size="sm" variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeTeam(group.teamKey)}
                      disabled={loading || teamGroups.length <= 1}
                    >
                      {L.removeGroup}
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-md border border-border/80">
                  <table className="w-max min-w-full border-collapse text-left text-xs">
                    <thead className="bg-muted/80">
                      <tr className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <th className="sticky left-0 z-[1] w-10 border-b border-r bg-muted/95 px-2 py-2 text-center">#</th>
                        <th className="min-w-[6rem] border-b border-r px-2 py-2">{L.colName}</th>
                        {!isSvc && <th className="w-14 border-b border-r px-2 py-2">Jersey #</th>}
                        <th className="min-w-[14rem] border-b border-r px-2 py-2">
                          {L.colLines} <span className="font-normal normal-case text-muted-foreground">(size)</span>
                        </th>
                        <th className="w-16 border-b px-2 py-2 text-center"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((r, idx) => (
                        <tr key={r.rowId} className="border-b border-border/60 hover:bg-muted/15">
                          <td className="sticky left-0 z-[1] border-r bg-card px-2 py-0.5 text-center font-mono text-muted-foreground">
                            {idx + 1}
                          </td>
                          <td className="border-r p-0">
                            <input
                              className="h-9 w-full border-0 bg-transparent px-2 outline-none focus:bg-primary/5"
                              value={r.surname}
                              onChange={(e) => patchRow(r.rowId, { surname: e.target.value })}
                              aria-label={L.colName}
                            />
                          </td>
                          {!isSvc && (
                            <td className="border-r p-0">
                              <input
                                className="h-9 w-full border-0 bg-transparent px-2 text-center font-mono outline-none focus:bg-primary/5"
                                value={r.jersey_number}
                                onChange={(e) => patchRow(r.rowId, { jersey_number: e.target.value })}
                                aria-label="Jersey number"
                              />
                            </td>
                          )}
                          <td className="border-r p-1 align-top">
                            <JerseyOrderCell
                              items={r.jerseyChecklist}
                              onChange={(next) => patchRow(r.rowId, { jerseyChecklist: next })}
                              addLineLabel={isSvc ? "+ Add service line" : undefined}
                            />
                          </td>
                          <td className="p-0 text-center">
                            <button
                              type="button"
                              className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => removeRow(r.rowId)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">{L.footerHint}</p>
        </CardContent>
      </Card>

      {/* Price chart */}
      <Card>
        <CardContent className="p-4">
          <h2 className="mb-1 text-sm font-semibold">Price chart</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            {isSvc
              ? "Service lines with the same name & size are grouped. Set a unit price per type — the total updates automatically."
              : "Jersey lines with the same name & size are grouped. Set a unit price per type — the total updates automatically."
            } Save sheet saves both the data and the pricing.
          </p>

          {uniqueLines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{L.noLines}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-muted/60 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="border-b border-r px-3 py-2 text-left">{L.priceLineHdr}</th>
                    <th className="border-b border-r px-3 py-2 text-center">Size</th>
                    <th className="border-b border-r px-3 py-2 text-center">Qty</th>
                    <th className="border-b border-r px-3 py-2 text-right">Unit price (₱)</th>
                    <th className="border-b px-3 py-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {uniqueLines.map((line) => {
                    const unitPrice = linePrices[line.key] ?? 0;
                    const subtotal = line.count * unitPrice;
                    return (
                      <tr key={line.key} className="border-b border-border/60 hover:bg-muted/10">
                        <td className="border-r px-3 py-2 font-medium">{line.name}</td>
                        <td className="border-r px-3 py-2 text-center font-mono text-muted-foreground">
                          {line.size || <span className="italic text-muted-foreground/60">—</span>}
                        </td>
                        <td className="border-r px-3 py-2 text-center font-mono">{line.count}</td>
                        <td className="border-r p-1">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-8 w-full rounded border border-border/60 bg-transparent px-2 text-right font-mono text-sm outline-none focus:border-primary/60 focus:bg-primary/5"
                            value={unitPrice === 0 ? "" : unitPrice}
                            placeholder="0.00"
                            onChange={(e) => {
                              const v = e.target.value === "" ? 0 : Number(e.target.value);
                              setLinePrices((prev) => ({ ...prev, [line.key]: isNaN(v) ? 0 : v }));
                            }}
                            aria-label={`Price for ${line.name} ${line.size}`}
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {subtotal > 0 ? peso(subtotal) : <span className="text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-muted/30 text-sm font-semibold">
                  <tr className="border-t-2 border-border">
                    <td colSpan={4} className="border-r px-3 py-2 text-right text-muted-foreground">
                      Grand Total
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-base">
                      {peso(orderTotal)}
                    </td>
                  </tr>
                  <tr className="border-t border-border/60">
                    <td colSpan={4} className="border-r px-3 py-1.5 text-right text-muted-foreground">
                      Down payment
                    </td>
                    <td className="p-1">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-8 w-full rounded border border-border/60 bg-transparent px-2 text-right font-mono text-sm outline-none focus:border-primary/60 focus:bg-primary/5"
                        value={downPaymentStr}
                        placeholder="0.00"
                        onChange={(e) => setDownPaymentStr(e.target.value)}
                        aria-label="Down payment"
                      />
                    </td>
                  </tr>
                  <tr className="border-t border-border/60">
                    <td colSpan={4} className="border-r px-3 py-2 text-right text-muted-foreground">
                      Balance
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono text-base ${balance < 0 ? "text-destructive" : balance === 0 && orderTotal > 0 ? "text-green-600" : ""}`}
                    >
                      {peso(balance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p className="mt-3 text-[11px] text-muted-foreground">
            Clicking <strong>Save sheet</strong> above saves both the jersey sheet and this pricing. The order total and
            down payment will be updated in the orders list.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
