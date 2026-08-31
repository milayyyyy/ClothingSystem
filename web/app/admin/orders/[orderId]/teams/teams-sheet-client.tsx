"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  buildTeamsSheetPdf,
  downloadTeamsSheetPdf,
} from "@/lib/order-teams-sheet-pdf";
import { FileDown } from "lucide-react";
import { uploadJerseyDesignPhoto } from "@/lib/jersey-design-upload";
import {
  emptyPlayer,
  emptyTeam,
  isImageUploadFile,
  jerseyDesignSaveErrorMessage,
  jerseyDesignUploadErrorMessage,
  mapTeamsFromSupabase,
  newClientKey,
  persistSublimationTeams,
  saveTeamDesignGallery,
  type JerseyChecklistItem,
  type PlayerDraft,
  type TeamDraft,
} from "@/lib/sublimation-teams";

type FlatRow = {
  rowId: string;
  teamKey: string;      // team group key — groups sheets belonging to the same team
  sheetKey: string;     // jersey-type sheet key (= sublimation_teams.id)
  playerKey: string;
  teamName: string;
  sheetName: string;    // jersey-type label, e.g. "Jersey", "Hoodie"
  /** Duplicated on each row of the sheet; kept in sync when editing. */
  teamDesignUrls: string[];
  surname: string;
  jersey_number: string;
  jerseyChecklist: JerseyChecklistItem[];
};

const TEAM_DESIGN_MAX = 24;

function peso(n: number) {
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  viewOnly = false,
  uploading,
  onUrlsChange,
  onUploadError,
  onBusyChange,
}: {
  urls: string[];
  orderId: string;
  teamKey: string;
  disabled: boolean;
  viewOnly?: boolean;
  uploading: boolean;
  onUrlsChange: (next: string[]) => void | Promise<void>;
  onUploadError: (msg: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const fileInputId = useId();
  const [stripError, setStripError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  async function uploadFiles(fileList: FileList | File[]) {
    setStripError(null);
    if (disabled || uploading) return;
    const remaining = TEAM_DESIGN_MAX - urls.length;
    if (remaining <= 0) {
      const msg = `At most ${TEAM_DESIGN_MAX} design photos per team.`;
      setStripError(msg);
      onUploadError(msg);
      return;
    }
    const files = Array.from(fileList).filter(isImageUploadFile).slice(0, remaining);
    if (!files.length) {
      const msg = "Drop image files only (JPG, PNG, HEIC, etc.).";
      setStripError(msg);
      onUploadError(msg);
      return;
    }
    const blobPreviews = files.map((f) => URL.createObjectURL(f));
    setPreviews(blobPreviews);
    const added: string[] = [];
    onBusyChange(true);
    try {
      for (const file of files) {
        const publicUrl = await uploadJerseyDesignPhoto(orderId, teamKey, file);
        added.push(publicUrl);
      }
      await onUrlsChange([...urls, ...added]);
      setStripError(null);
    } catch (err) {
      console.error(err);
      const msg = jerseyDesignUploadErrorMessage(err);
      setStripError(msg);
      onUploadError(msg);
    } finally {
      for (const u of blobPreviews) URL.revokeObjectURL(u);
      setPreviews([]);
      onBusyChange(false);
    }
  }

  async function onPickFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    e.target.value = "";
    if (!list?.length) return;
    await uploadFiles(list);
  }

  function onDragOver(e: DragEvent) {
    if (viewOnly || disabled || uploading || urls.length >= TEAM_DESIGN_MAX) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function onDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  async function onDrop(e: DragEvent) {
    if (viewOnly || disabled || uploading || urls.length >= TEAM_DESIGN_MAX) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const dropped = e.dataTransfer.files;
    if (!dropped?.length) return;
    await uploadFiles(dropped);
  }

  const dropDisabled = viewOnly || disabled || uploading || urls.length >= TEAM_DESIGN_MAX;

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Design photos
        </label>
        {!viewOnly && (
          <span className="text-[10px] text-muted-foreground/90">
            {urls.length}/{TEAM_DESIGN_MAX} · drag images here or choose files
          </span>
        )}
      </div>
      <div
        className={cn(
          "mt-1 rounded-md border border-dashed p-2 transition-colors",
          dragOver && !dropDisabled && "border-primary bg-primary/5",
          !dragOver && "border-transparent",
          dropDisabled && "opacity-60",
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
      <div className="flex flex-wrap items-center gap-2">
        {urls.map((url) => (
          <div
            key={url}
            className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            {!viewOnly && (
              <button
                type="button"
                className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100"
                disabled={disabled || uploading}
                onClick={() => onUrlsChange(urls.filter((u) => u !== url))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {previews.map((url) => (
          <div
            key={url}
            className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-dashed border-primary/40 bg-muted/40 opacity-80"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-primary/80 py-px text-center text-[8px] text-primary-foreground">
              Uploading…
            </span>
          </div>
        ))}
        {!viewOnly && (
          <div
            className="flex min-w-[10rem] flex-col gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              id={fileInputId}
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              disabled={dropDisabled}
              className="sr-only"
              aria-label="Choose design photos"
              onChange={onPickFiles}
            />
            <Label
              htmlFor={fileInputId}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "h-9 w-fit cursor-pointer text-xs font-normal",
                dropDisabled && "pointer-events-none opacity-50",
              )}
            >
              {uploading ? "Uploading…" : "Choose photos"}
            </Label>
            <span className="text-[10px] text-muted-foreground">
              {dragOver ? "Drop images to upload" : "Drag here or click Choose photos"}
            </span>
          </div>
        )}
        {stripError && (
          <p className="w-full basis-full text-[11px] font-medium text-destructive" role="alert">
            {stripError}
          </p>
        )}
        {viewOnly && urls.length === 0 && (
          <span className="text-[11px] text-muted-foreground">No design photos</span>
        )}
      </div>
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
  readOnly = false,
  addLineLabel = "+ Add line",
}: {
  items: JerseyChecklistItem[];
  onChange: (next: JerseyChecklistItem[]) => void;
  readOnly?: boolean;
  addLineLabel?: string;
}) {
  if (readOnly) {
    const lines = items.filter((x) => x.checked || x.name.trim() || x.size.trim());
    if (!lines.length) return <span className="text-[11px] text-muted-foreground italic">—</span>;
    return (
      <ul className="flex min-w-[13rem] max-w-[24rem] flex-col gap-1 py-1 text-[11px]">
        {lines.map((item) => (
          <li key={item.id} className="rounded border border-border/60 bg-muted/15 px-2 py-0.5">
            <span className={item.checked ? "font-medium" : "text-muted-foreground line-through"}>
              {item.name.trim() || "—"}
            </span>
            {item.size.trim() ? (
              <span className="ml-1 font-mono text-muted-foreground">({item.size.trim()})</span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }
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
  for (const t of teams) {
    const teamKey  = t.teamGroupKey || t.clientKey;
    const sheetKey = t.clientKey;
    const sheetName = t.sheetName || t.name || "Jersey";
    const urls = [...(t.design_image_urls || [])];
    for (const p of t.players) {
      out.push({
        rowId: `${sheetKey}__${p.clientKey}`,
        teamKey,
        sheetKey,
        playerKey: p.clientKey,
        teamName: t.name,
        sheetName,
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
  const bySheet = new Map<string, {
    teamKey: string; teamName: string;
    sheetKey: string; sheetName: string;
    designImageUrls: string[]; players: PlayerDraft[];
  }>();

  for (const r of rows) {
    const key = `${r.teamKey}||${r.sheetKey}`;
    if (!bySheet.has(key)) {
      orderKeys.push(key);
      bySheet.set(key, {
        teamKey: r.teamKey, teamName: r.teamName.trim() || "Team",
        sheetKey: r.sheetKey, sheetName: r.sheetName || "Jersey",
        designImageUrls: [...r.teamDesignUrls], players: [],
      });
    } else {
      const g = bySheet.get(key)!;
      g.teamName = r.teamName.trim() || "Team";
      g.sheetName = r.sheetName || "Jersey";
      g.designImageUrls = [...r.teamDesignUrls];
    }
    bySheet.get(key)!.players.push({
      clientKey: r.playerKey,
      surname: r.surname,
      jersey_number: r.jersey_number,
      jersey_checklist: r.jerseyChecklist.map((x) => ({ ...x })),
      design_approved: false,
      design_image_url: "",
    });
  }

  return orderKeys.map((key) => {
    const g = bySheet.get(key)!;
    return {
      clientKey: g.sheetKey,
      teamGroupKey: g.teamKey,
      name: g.teamName,
      sheetName: g.sheetName,
      design_image_urls: g.designImageUrls.map((u) => u.trim()).filter(Boolean),
      players: g.players.length > 0
        ? g.players
        : [emptyPlayer()].map((p) => ({ ...p, clientKey: newClientKey() })),
    };
  });
}

function defaultFlatRow(): FlatRow {
  const teamKey  = newClientKey();
  const sheetKey = newClientKey();
  const pk       = newClientKey();
  return {
    rowId: `${sheetKey}__${pk}`,
    teamKey,
    sheetKey,
    playerKey: pk,
    teamName: "Team",
    sheetName: "Jersey",
    teamDesignUrls: [],
    surname: "",
    jersey_number: "",
    jerseyChecklist: [],
  };
}

type SheetGroup = { sheetKey: string; sheetName: string; rows: FlatRow[] };
type TeamGroup  = { teamKey: string; teamName: string; sheets: SheetGroup[] };

/** Preserve team and sheet order as first-seen in `rows` (matches save order). */
function groupRowsByTeamAndSheet(rows: FlatRow[]): TeamGroup[] {
  const teamOrder: string[] = [];
  const teamMap = new Map<string, { teamName: string; sheetOrder: string[]; sheetMap: Map<string, SheetGroup> }>();
  for (const r of rows) {
    if (!teamMap.has(r.teamKey)) {
      teamOrder.push(r.teamKey);
      teamMap.set(r.teamKey, { teamName: r.teamName, sheetOrder: [], sheetMap: new Map() });
    }
    const team = teamMap.get(r.teamKey)!;
    team.teamName = r.teamName;
    if (!team.sheetMap.has(r.sheetKey)) {
      team.sheetOrder.push(r.sheetKey);
      team.sheetMap.set(r.sheetKey, { sheetKey: r.sheetKey, sheetName: r.sheetName, rows: [] });
    }
    const sheet = team.sheetMap.get(r.sheetKey)!;
    sheet.sheetName = r.sheetName;
    sheet.rows.push(r);
  }
  return teamOrder.map((teamKey) => {
    const team = teamMap.get(teamKey)!;
    return {
      teamKey,
      teamName: team.teamName,
      sheets: team.sheetOrder.map((sk) => team.sheetMap.get(sk)!),
    };
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
  initialSheetFormat = "teams",
  readOnly = false,
  backHref,
}: {
  orderId: string;
  orderNo: number;
  customerName: string | null;
  orderKind?: string;
  initialDownPayment?: number;
  initialUnitPrice?: number;
  initialQuantity?: number;
  initialLinePrices?: Record<string, number>;
  initialSheetFormat?: "teams" | "services";
  readOnly?: boolean;
  backHref?: string;
}) {
  const supabase = createClient();
  const viewOnly = readOnly;
  const [flatRows, setFlatRows] = useState<FlatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [uploadingTeamKey, setUploadingTeamKey] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Walk-in & Online can switch between "teams" and "services" sheet format
  const canSwitchFormat = orderKind === "local" || orderKind === "online";
  const [sheetFormat, setSheetFormat] = useState<"teams" | "services">(() => {
    if (orderKind === "services") return "services";
    if (initialSheetFormat === "services" || initialSheetFormat === "teams") return initialSheetFormat;
    return "teams";
  });

  async function persistSheetFormat(fmt: "teams" | "services") {
    if (!canSwitchFormat || viewOnly) return;
    const { error } = await supabase
      .from("orders")
      .update({ teams_sheet_format: fmt })
      .eq("id", orderId);
    if (error) console.error("teams_sheet_format save:", error.message);
  }

  function chooseSheetFormat(fmt: "teams" | "services") {
    setSheetFormat(fmt);
    void persistSheetFormat(fmt);
  }

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

  const teamGroups = useMemo(() => groupRowsByTeamAndSheet(flatRows), [flatRows]);

  // Active team tab: defaults to first team key
  const [activeTeamKey, setActiveTeamKey] = useState<string>("");
  // Active sheet per team: maps teamKey → active sheetKey
  const [activeSheetKeyByTeam, setActiveSheetKeyByTeam] = useState<Map<string, string>>(new Map());

  // Keep activeTeamKey valid when teams change (e.g. after reload or removal)
  useEffect(() => {
    if (teamGroups.length === 0) return;
    const keys = teamGroups.map((g) => g.teamKey);
    if (!activeTeamKey || !keys.includes(activeTeamKey)) {
      setActiveTeamKey(keys[0]!);
    }
  }, [teamGroups, activeTeamKey]);

  /** Returns the currently active sheetKey for a given team. */
  function getActiveSheetKeyForTeam(teamKey: string): string {
    const stored = activeSheetKeyByTeam.get(teamKey);
    if (stored) {
      const group = teamGroups.find((g) => g.teamKey === teamKey);
      if (group?.sheets.some((s) => s.sheetKey === stored)) return stored;
    }
    return teamGroups.find((g) => g.teamKey === teamKey)?.sheets[0]?.sheetKey ?? "";
  }

  function setActiveSheetForTeam(teamKey: string, sheetKey: string) {
    setActiveSheetKeyByTeam((prev) => new Map(prev).set(teamKey, sheetKey));
  }

  /** All unique jersey line types across the whole order, with counts. */
  const uniqueLines = useMemo(() => buildUniqueLines(flatRows), [flatRows]);

  /** Active sheet key for the currently active team (used for the price chart). */
  const activeSheetKey = useMemo(() => {
    const stored = activeSheetKeyByTeam.get(activeTeamKey);
    if (stored) {
      const group = teamGroups.find((g) => g.teamKey === activeTeamKey);
      if (group?.sheets.some((s) => s.sheetKey === stored)) return stored;
    }
    return teamGroups.find((g) => g.teamKey === activeTeamKey)?.sheets[0]?.sheetKey ?? "";
  }, [activeTeamKey, activeSheetKeyByTeam, teamGroups]);

  /** Jersey lines for only the active sheet — used for the per-tab price chart. */
  const activeTeamRows = useMemo(() => {
    const group = teamGroups.find((g) => g.teamKey === activeTeamKey);
    if (!group) return [];
    const sheet = group.sheets.find((s) => s.sheetKey === activeSheetKey);
    return sheet?.rows ?? [];
  }, [teamGroups, activeTeamKey, activeSheetKey]);
  const activeUniqueLines = useMemo(() => buildUniqueLines(activeTeamRows), [activeTeamRows]);

  const orderTotal = useMemo(
    () => uniqueLines.reduce((sum, l) => sum + l.count * (linePrices[l.key] ?? 0), 0),
    [uniqueLines, linePrices],
  );
  const activeTeamTotal = useMemo(
    () => activeUniqueLines.reduce((sum, l) => sum + l.count * (linePrices[l.key] ?? 0), 0),
    [activeUniqueLines, linePrices],
  );
  const downPayment = Math.max(0, Number(downPaymentStr) || 0);
  const balance = orderTotal - downPayment;

  // ── Data loading ───────────────────────────────────────────────────────────
  const reload = useCallback(() => {
    setLoading(true);
    void supabase
      .from("sublimation_teams")
      .select("id, name, team_group_key, sheet_name, sort_order, design_image_urls, players:sublimation_team_players(*)")
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

  function patchSheetName(teamKey: string, sheetKey: string, name: string) {
    setFlatRows((prev) =>
      prev.map((r) =>
        r.teamKey === teamKey && r.sheetKey === sheetKey ? { ...r, sheetName: name } : r,
      ),
    );
  }

  async function handleDesignUrlsChange(sheetKey: string, nextUrls: string[]) {
    const updatedRows = flatRows.map((r) =>
      r.sheetKey === sheetKey ? { ...r, teamDesignUrls: nextUrls } : r,
    );
    setFlatRows(updatedRows);
    if (viewOnly) return;
    try {
      const { updatedInPlace } = await saveTeamDesignGallery(
        supabase,
        orderId,
        sheetKey,
        nextUrls,
        flatRowsToTeams(updatedRows),
      );
      if (!updatedInPlace) reload();
      setMessage("Design photos saved.");
    } catch (err) {
      console.error(err);
      setMessage(jerseyDesignSaveErrorMessage(err));
    }
  }

  function sortTeamPlayers(teamKey: string, sheetKey: string, mode: TeamRowSortMode) {
    setFlatRows((prev) => {
      const groups = groupRowsByTeamAndSheet(prev);
      const next: FlatRow[] = [];
      for (const g of groups) {
        for (const s of g.sheets) {
          const sorted =
            g.teamKey === teamKey && s.sheetKey === sheetKey
              ? sortTeamPlayerRows(s.rows, mode)
              : s.rows;
          next.push(...sorted);
        }
      }
      return next;
    });
  }

  function addPlayerToTeam(teamKey: string, sheetKey: string) {
    setFlatRows((prev) => {
      const sample = prev.find((r) => r.teamKey === teamKey && r.sheetKey === sheetKey);
      const teamName = sample?.teamName ?? "Team";
      const sheetName = sample?.sheetName ?? "Jersey";
      const teamDesignUrls = sample?.teamDesignUrls ?? [];
      const pk = newClientKey();
      const rowId = `${sheetKey}__${pk}`;
      const newRow: FlatRow = {
        rowId, teamKey, sheetKey, playerKey: pk, teamName, sheetName, teamDesignUrls,
        surname: "", jersey_number: "", jerseyChecklist: [],
      };
      let insertAt = prev.length;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i]!.teamKey === teamKey && prev[i]!.sheetKey === sheetKey) {
          insertAt = i + 1;
          break;
        }
      }
      return [...prev.slice(0, insertAt), newRow, ...prev.slice(insertAt)];
    });
  }

  function addTeam() {
    const newRow = defaultFlatRow();
    setFlatRows((prev) => [...prev, newRow]);
    setActiveTeamKey(newRow.teamKey);
    setActiveSheetKeyByTeam((prev) => new Map(prev).set(newRow.teamKey, newRow.sheetKey));
  }

  function addJerseyTypeToTeam(teamKey: string, teamName: string) {
    const sheetKey  = newClientKey();
    const playerKey = newClientKey();
    const newRow: FlatRow = {
      rowId: `${sheetKey}__${playerKey}`,
      teamKey,
      sheetKey,
      playerKey,
      teamName,
      sheetName: "Jersey Type",
      teamDesignUrls: [],
      surname: "",
      jersey_number: "",
      jerseyChecklist: [],
    };
    setFlatRows((prev) => {
      let insertAt = prev.length;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i]!.teamKey === teamKey) { insertAt = i + 1; break; }
      }
      return [...prev.slice(0, insertAt), newRow, ...prev.slice(insertAt)];
    });
    setActiveSheetKeyByTeam((prev) => new Map(prev).set(teamKey, sheetKey));
  }

  function removeTeam(teamKey: string) {
    setFlatRows((prev) => {
      const next = prev.filter((r) => r.teamKey !== teamKey);
      return next.length ? next : [defaultFlatRow()];
    });
    setActiveSheetKeyByTeam((prev) => { const m = new Map(prev); m.delete(teamKey); return m; });
    // Switch to an adjacent team when the active tab is removed
    if (activeTeamKey === teamKey) {
      const keys = teamGroups.map((g) => g.teamKey);
      const idx = keys.indexOf(teamKey);
      const fallback = keys[idx + 1] ?? keys[idx - 1] ?? "";
      setActiveTeamKey(fallback);
    }
  }

  function removeSheet(teamKey: string, sheetKey: string) {
    setFlatRows((prev) => {
      const next = prev.filter((r) => !(r.teamKey === teamKey && r.sheetKey === sheetKey));
      return next.length ? next : [defaultFlatRow()];
    });
    setActiveSheetKeyByTeam((prev) => {
      if (prev.get(teamKey) !== sheetKey) return prev;
      // Switch to another sheet in the same team
      const other = flatRows.find((r) => r.teamKey === teamKey && r.sheetKey !== sheetKey);
      const m = new Map(prev);
      if (other) m.set(teamKey, other.sheetKey);
      else m.delete(teamKey);
      return m;
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
        .update({
          jersey_line_prices: linePrices,
          unit_price: computedTotal,
          quantity: 1,
          down_payment: dp,
          ...(canSwitchFormat ? { teams_sheet_format: sheetFormat } : {}),
        })
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

  const isSvc = orderKind === "services" || (canSwitchFormat && sheetFormat === "services");

  function sheetPdfPayload(includePriceChart: boolean) {
    return {
      orderNo,
      customerName,
      sheetKind: (isSvc ? "services" : "teams") as "teams" | "services",
      includePriceChart,
      groups: teamGroups.flatMap((group) =>
        group.sheets.map((sheet) => ({
          teamName: group.sheets.length > 1
            ? `${group.teamName} — ${sheet.sheetName}`
            : group.teamName,
          designImageUrls: [...(sheet.rows[0]?.teamDesignUrls ?? [])],
          rows: sheet.rows.map((r, idx) => ({
            index: idx + 1,
            surname: r.surname,
            jerseyNumber: r.jersey_number,
            lines: r.jerseyChecklist.map((item) => ({
              name: item.name,
              size: item.size,
              checked: item.checked,
            })),
          })),
        })),
      ),
      priceLines: uniqueLines.map((line) => ({
        name: line.name,
        size: line.size,
        count: line.count,
        unitPrice: linePrices[line.key] ?? 0,
      })),
      orderTotal,
      downPayment,
      balance,
    };
  }

  async function exportSheetPdf(mode: "full" | "roster" | "price_chart") {
    setExportingPdf(true);
    setMessage(null);
    try {
      const base = sheetPdfPayload(true);
      const payload = {
        ...base,
        includePriceChart: mode !== "roster",
        priceChartOnly:    mode === "price_chart",
      };
      const blob = await buildTeamsSheetPdf(payload);
      const slug = isSvc ? "services" : "teams";
      const suffix = mode === "roster" ? "teams_list" : mode === "price_chart" ? "price_chart" : "full";
      downloadTeamsSheetPdf(blob, `order_${orderNo}_${slug}_${suffix}.pdf`);
    } catch (err) {
      console.error(err);
      setMessage(err instanceof Error ? err.message : "PDF export failed.");
    } finally {
      setExportingPdf(false);
    }
  }

  // ── Labels (change based on order kind or chosen format) ─────────────────
  const invoiceHref = backHref?.includes("/employee")
    ? `/employee/orders/${orderId}/invoice`
    : `/admin/orders/${orderId}/invoice`;
  const L = {
    pageTitle:     isSvc ? "Services Order — sheet"    : "Teams & Jerseys — sheet",
    addGroup:      isSvc ? "+ Services Order"           : "+ Team",
    groupNameLabel:isSvc ? "Customer name"              : "Team name",
    groupNamePlch: isSvc ? "Customer name"              : "Team name",
    sortLabel:     isSvc ? "Sort services"              : "Sort players",
    sortByName:    isSvc ? "Service name (A–Z)"         : "Surname (A–Z)",
    addRow:        isSvc ? "+ Service"                  : "+ Player",
    removeGroup:   isSvc ? "Remove services"            : "Remove team",
    colName:       isSvc ? "Services"                   : "Surname",
    colLines:      isSvc ? "Service Lines"              : "Jersey lines",
    noLines:       isSvc ? "No service lines yet. Add service lines above and they will appear here." : "No jersey lines yet. Add jersey lines to players above and they will appear here.",
    priceLineHdr:  isSvc ? "Service line"               : "Jersey line",
    footerHint:    isSvc ? "Each block is one customer/service order. Add design photos; set size beside each service line. Use + Services Order for another customer, then Save sheet." : "Each top tab is a team. Within a team, each jersey type (Jersey, Hoodie, etc.) is a separate sheet with its own player list and price chart. Use + Jersey Type to add a sheet, + Team to add a new team, then Save sheet.",
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {!viewOnly && (
        <FinanceAccountDialog
        open={dpDialogOpen}
        dpAmount={Math.max(0, (Number(downPaymentStr) || 0) - savedDownPayment)}
        accounts={financeAccounts}
        onConfirm={handleDpDialogConfirm}
        onCancel={handleDpDialogSkip}
        />
      )}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={backHref ?? backHrefForKind(orderKind)}
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            ← Back to orders
          </Link>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">{L.pageTitle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Order <span className="font-mono">#{orderNo}</span>
            {customerName ? <> · {customerName}</> : null}{viewOnly ? ". View only." : ". Tab between cells like a spreadsheet; use Save when done."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={invoiceHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Invoice
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || exportingPdf}
            onClick={() => void exportSheetPdf("roster")}
            title="Player/surname lists with design photos — no pricing"
          >
            <FileDown className="mr-1 h-4 w-4" />
            {exportingPdf ? "Exporting…" : "Teams list"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || exportingPdf}
            onClick={() => void exportSheetPdf("price_chart")}
            title="Price chart only — no player lists"
          >
            <FileDown className="mr-1 h-4 w-4" />
            {exportingPdf ? "Exporting…" : "Price chart"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || exportingPdf}
            onClick={() => void exportSheetPdf("full")}
            title="Full PDF — teams list + price chart"
          >
            <FileDown className="mr-1 h-4 w-4" />
            {exportingPdf ? "Exporting…" : "Full PDF"}
          </Button>
        {!viewOnly && (
          <>
          {/* Format toggle — only for Walk-in & Online */}
          {canSwitchFormat && (
            <div className="flex rounded-md border overflow-hidden text-xs">
              <button
                type="button"
                className={`px-3 py-1.5 font-medium transition-colors ${sheetFormat === "teams" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                onClick={() => chooseSheetFormat("teams")}
              >
                Teams & Jerseys
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 font-medium transition-colors border-l ${sheetFormat === "services" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
                onClick={() => chooseSheetFormat("services")}
              >
                Services
              </button>
            </div>
          )}
          <Button type="button" size="sm" onClick={save} disabled={loading || saving}>
            {saving ? "Saving…" : "Save sheet"}
          </Button>
          </>
        )}
        </div>
      </div>

      {message && (
        <p
          className={`text-sm ${
            message === "Saved." || message === "Design photos saved."
              ? "text-green-600"
              : "text-destructive"
          }`}
        >
          {message}
        </p>
      )}

      {/* Jersey Type tabs */}
      {!isSvc && (
        <div className="flex flex-wrap items-end gap-0 border-b">
          {teamGroups.map((group) => {
            const isActive = activeTeamKey === group.teamKey;
            return (
              <button
                key={group.teamKey}
                type="button"
                onClick={() => setActiveTeamKey(group.teamKey)}
                className={cn(
                  "relative -mb-px px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-md",
                  isActive
                    ? "border border-b-background bg-card text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {group.teamName?.trim() || "Team"}
                {isActive && teamGroups.length > 1 && !viewOnly && (
                  <span
                    role="button"
                    aria-label="Remove this Jersey Type"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); removeTeam(group.teamKey); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); removeTeam(group.teamKey); } }}
                    className="ml-2 inline-flex h-4 w-4 items-center justify-center rounded-full text-xs text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                  >
                    ×
                  </span>
                )}
              </button>
            );
          })}
          {!viewOnly && (
            <button
              type="button"
              onClick={addTeam}
              disabled={loading}
              className="mb-0.5 ml-1 flex items-center gap-1 rounded-md px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
            >
              <span className="text-base leading-none">+</span> Team
            </button>
          )}
        </div>
      )}

      {/* Sheet */}
      <Card>
        <CardContent className="p-4">
          <div className="max-h-[calc(100dvh-14rem)] space-y-6 overflow-auto pr-1">
            {teamGroups.filter((g) => isSvc || g.teamKey === activeTeamKey).map((group) => (
              <div
                key={group.teamKey}
                className="rounded-lg border border-border bg-card/30 p-4 shadow-sm"
              >
                {/* Team name header */}
                <div className="mb-3 flex flex-wrap items-end gap-4 border-b border-border/60 pb-3">
                  <div className="min-w-[10rem] max-w-md flex-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {L.groupNameLabel}
                    </label>
                    {viewOnly ? (
                      <p className="mt-1 h-9 font-medium leading-9">{group.teamName || "—"}</p>
                    ) : (
                      <Input
                        className="mt-1 h-9 font-medium"
                        value={group.teamName}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => patchTeamName(group.teamKey, e.target.value)}
                        placeholder={L.groupNamePlch}
                      />
                    )}
                  </div>
                  {isSvc && !viewOnly && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => removeTeam(group.teamKey)}
                      disabled={loading || teamGroups.length <= 1}
                    >
                      {L.removeGroup}
                    </Button>
                  )}
                </div>

                {/* Jersey type sheet sub-tabs */}
                {!isSvc && (
                  <div className="mb-3 flex flex-wrap items-end gap-0 border-b">
                    {group.sheets.map((sheet) => {
                      const isSheetActive = getActiveSheetKeyForTeam(group.teamKey) === sheet.sheetKey;
                      return (
                        <button
                          key={sheet.sheetKey}
                          type="button"
                          onClick={() => setActiveSheetForTeam(group.teamKey, sheet.sheetKey)}
                          className={cn(
                            "relative -mb-px px-4 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-md",
                            isSheetActive
                              ? "border border-b-card bg-card text-foreground shadow-sm"
                              : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                          )}
                        >
                          {sheet.sheetName?.trim() || "Jersey Type"}
                          {isSheetActive && group.sheets.length > 1 && !viewOnly && (
                            <span
                              role="button"
                              aria-label="Remove this jersey type"
                              tabIndex={0}
                              onClick={(e) => { e.stopPropagation(); removeSheet(group.teamKey, sheet.sheetKey); }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); removeSheet(group.teamKey, sheet.sheetKey); } }}
                              className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-xs text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                            >
                              ×
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {!viewOnly && (
                      <button
                        type="button"
                        onClick={() => addJerseyTypeToTeam(group.teamKey, group.teamName)}
                        disabled={loading}
                        className="mb-0.5 ml-1 flex items-center gap-1 rounded-md px-3 py-2 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                      >
                        <span className="text-base leading-none">+</span> Jersey Type
                      </button>
                    )}
                  </div>
                )}

                {/* Active sheet content */}
                {group.sheets
                  .filter((s) => isSvc || s.sheetKey === getActiveSheetKeyForTeam(group.teamKey))
                  .map((sheet) => (
                  <div key={sheet.sheetKey} className="space-y-3">
                    {/* Sheet name + design strip + sort/add controls */}
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-4">
                        {!isSvc && group.sheets.length > 1 && (
                          <div className="min-w-[9rem] max-w-xs flex-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Jersey type name
                            </label>
                            {viewOnly ? (
                              <p className="mt-1 h-9 font-medium leading-9">{sheet.sheetName || "—"}</p>
                            ) : (
                              <Input
                                className="mt-1 h-9"
                                value={sheet.sheetName}
                                placeholder="e.g. Jersey, Hoodie…"
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                  patchSheetName(group.teamKey, sheet.sheetKey, e.target.value)
                                }
                              />
                            )}
                          </div>
                        )}
                        <TeamDesignStrip
                          urls={sheet.rows[0]?.teamDesignUrls ?? []}
                          orderId={orderId}
                          teamKey={sheet.sheetKey}
                          disabled={viewOnly}
                          viewOnly={viewOnly}
                          uploading={uploadingTeamKey === sheet.sheetKey}
                          onUrlsChange={(next) => handleDesignUrlsChange(sheet.sheetKey, next)}
                          onUploadError={(msg) => setMessage(msg)}
                          onBusyChange={(busy) => setUploadingTeamKey(busy ? sheet.sheetKey : null)}
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
                              if (v) sortTeamPlayers(group.teamKey, sheet.sheetKey, v);
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
                        {!viewOnly && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => addPlayerToTeam(group.teamKey, sheet.sheetKey)}
                            disabled={loading}
                          >
                            {L.addRow}
                          </Button>
                        )}
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
                            {!viewOnly && <th className="w-16 border-b px-2 py-2 text-center"> </th>}
                          </tr>
                        </thead>
                        <tbody>
                          {sheet.rows.map((r, idx) => (
                            <tr key={r.rowId} className="border-b border-border/60 hover:bg-muted/15">
                              <td className="sticky left-0 z-[1] border-r bg-card px-2 py-0.5 text-center font-mono text-muted-foreground">
                                {idx + 1}
                              </td>
                              <td className="border-r p-0">
                                {viewOnly ? (
                                  <span className="block h-9 px-2 leading-9">{r.surname || "—"}</span>
                                ) : (
                                  <input
                                    className="h-9 w-full border-0 bg-transparent px-2 outline-none focus:bg-primary/5"
                                    value={r.surname}
                                    onChange={(e) => patchRow(r.rowId, { surname: e.target.value })}
                                    aria-label={L.colName}
                                  />
                                )}
                              </td>
                              {!isSvc && (
                                <td className="border-r p-0">
                                  {viewOnly ? (
                                    <span className="block h-9 px-2 text-center font-mono leading-9">{r.jersey_number || "—"}</span>
                                  ) : (
                                    <input
                                      className="h-9 w-full border-0 bg-transparent px-2 text-center font-mono outline-none focus:bg-primary/5"
                                      value={r.jersey_number}
                                      onChange={(e) => patchRow(r.rowId, { jersey_number: e.target.value })}
                                      aria-label="Jersey number"
                                    />
                                  )}
                                </td>
                              )}
                              <td className="border-r p-1 align-top">
                                <JerseyOrderCell
                                  items={r.jerseyChecklist}
                                  onChange={(next) => patchRow(r.rowId, { jerseyChecklist: next })}
                                  readOnly={viewOnly}
                                  addLineLabel={isSvc ? "+ Add service line" : undefined}
                                />
                              </td>
                              <td className="p-0 text-center">
                                {!viewOnly && (
                                  <button
                                    type="button"
                                    className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => removeRow(r.rowId)}
                                  >
                                    Delete
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {!viewOnly && <p className="mt-4 border-t pt-3 text-[11px] text-muted-foreground">{L.footerHint}</p>}
        </CardContent>
      </Card>

      {/* Price chart */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              Price chart
              {!isSvc && (() => {
                const activeGroup = teamGroups.find((g) => g.teamKey === activeTeamKey);
                const activeSheet = activeGroup?.sheets.find((s) => s.sheetKey === activeSheetKey);
                if (!activeGroup) return null;
                const label = activeGroup.sheets.length > 1
                  ? `${activeGroup.teamName} — ${activeSheet?.sheetName || "Jersey Type"}`
                  : activeGroup.teamName;
                return (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    — {label}
                  </span>
                );
              })()}
            </h2>
            {!isSvc && (
              <span className="text-xs text-muted-foreground">
                Order total:{" "}
                <span className="font-semibold text-foreground">{peso(orderTotal)}</span>
              </span>
            )}
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            {viewOnly
              ? "Grouped line items and pricing for this jersey type sheet."
              : isSvc
                ? "Service lines with the same name & size are grouped. Set a unit price per type — the total updates automatically. Save sheet saves both the data and the pricing."
                : "Jersey lines for the active sheet are grouped here. Set a unit price per type — the total updates automatically. Switch jersey type tabs to see each sheet's chart."}
          </p>

          {activeUniqueLines.length === 0 ? (
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
                  {activeUniqueLines.map((line) => {
                    const unitPrice = linePrices[line.key] ?? 0;
                    const subtotal = line.count * unitPrice;
                    return (
                      <tr key={line.key} className="border-b border-border/60 hover:bg-muted/10">
                        <td className="border-r px-3 py-2 font-medium">{line.name}</td>
                        <td className="border-r px-3 py-2 text-center font-mono text-muted-foreground">
                          {line.size || <span className="italic text-muted-foreground/60">—</span>}
                        </td>
                        <td className="border-r px-3 py-2 text-center font-mono">{line.count}</td>
                        <td className="border-r px-3 py-2 text-right font-mono">
                          {viewOnly ? (
                            unitPrice > 0 ? peso(unitPrice) : <span className="text-muted-foreground">—</span>
                          ) : (
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
                          )}
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
                      {(() => {
                        const g = teamGroups.find((t) => t.teamKey === activeTeamKey);
                        if (g && g.sheets.length > 1) return "Sheet Total";
                        if (teamGroups.length > 1) return "Team Total";
                        return "Grand Total";
                      })()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-base">
                      {peso(activeTeamTotal)}
                    </td>
                  </tr>
                  <tr className="border-t border-border/60">
                    <td colSpan={4} className="border-r px-3 py-1.5 text-right text-muted-foreground">
                      Down payment
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {viewOnly ? (
                        downPayment > 0 ? peso(downPayment) : <span className="text-muted-foreground">—</span>
                      ) : (
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
                      )}
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

          {!viewOnly && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Clicking <strong>Save sheet</strong> above saves both the jersey sheet and this pricing. The order total and
              down payment will be updated in the orders list.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
