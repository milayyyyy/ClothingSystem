"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Trash2,
  Upload,
  ChevronDown,
  ChevronUp,
  FileDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Shirt,
  Settings2,
  PackageSearch,
  ArrowRight,
} from "lucide-react";
import type { JerseyTemplate, JerseyTemplateSize } from "./page";

// ─── constants ────────────────────────────────────────────────────────────────

const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;
type SizeKey = (typeof SIZES)[number];

const SIZE_ALIASES: Record<string, SizeKey> = {
  XSMALL: "XS", "X-SMALL": "XS", "EXTRA SMALL": "XS",
  SMALL: "S",
  MEDIUM: "M",
  LARGE: "L",
  XLARGE: "XL", "X-LARGE": "XL", "EXTRA LARGE": "XL",
  "2XLARGE": "2XL", "2X-LARGE": "2XL", "XXL": "2XL", "DOUBLE XL": "2XL",
  "3XLARGE": "3XL", "3X-LARGE": "3XL", "XXXL": "3XL", "TRIPLE XL": "3XL",
};

function normaliseSize(raw: string): SizeKey | null {
  const u = raw.trim().toUpperCase();
  if (SIZES.includes(u as SizeKey)) return u as SizeKey;
  return SIZE_ALIASES[u] ?? null;
}

// ─── types ────────────────────────────────────────────────────────────────────

type Player = { size: SizeKey; number: string; name: string };

type ParseResult =
  | { ok: true; players: Player[] }
  | { ok: false; error: string };

// ─── roster parser ────────────────────────────────────────────────────────────

function parseRoster(text: string): ParseResult {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { ok: false, error: "Roster is empty." };
  const players: Player[] = [];
  const errors: string[] = [];
  lines.forEach((line, i) => {
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 3) {
      errors.push(`Line ${i + 1}: expected SIZE, NUMBER, SURNAME — got "${line}"`);
      return;
    }
    const size = normaliseSize(parts[0]);
    if (!size) {
      errors.push(`Line ${i + 1}: unknown size "${parts[0]}"`);
      return;
    }
    const num = parts[1].trim();
    const name = parts.slice(2).join(", ").trim().toUpperCase();
    if (!num) { errors.push(`Line ${i + 1}: number is empty`); return; }
    if (!name) { errors.push(`Line ${i + 1}: surname is empty`); return; }
    players.push({ size, number: num, name });
  });
  if (errors.length) return { ok: false, error: errors.join("\n") };
  return { ok: true, players };
}

// ─── cmyk input helper ────────────────────────────────────────────────────────

function CmykInput({
  label,
  c, m, y, k,
  onC, onM, onY, onK,
}: {
  label: string;
  c: number; m: number; y: number; k: number;
  onC(v: number): void; onM(v: number): void; onY(v: number): void; onK(v: number): void;
}) {
  const preview = `cmyk(${c}%,${m}%,${y}%,${k}%)`;
  // approximate RGB for swatch
  const r = Math.round(255 * (1 - c / 100) * (1 - k / 100));
  const g = Math.round(255 * (1 - m / 100) * (1 - k / 100));
  const b = Math.round(255 * (1 - y / 100) * (1 - k / 100));
  const swatch = `rgb(${r},${g},${b})`;
  const num = (val: number, onChange: (v: number) => void, lbl: string) => (
    <div className="grid gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground">{lbl}</span>
      <Input
        type="number" min={0} max={100} step={1}
        value={val}
        onChange={(e) => onChange(Math.max(0, Math.min(100, Number(e.target.value))))}
        className="h-7 w-16 px-2 text-xs"
      />
    </div>
  );
  return (
    <div className="flex flex-wrap items-end gap-2">
      <span className="text-xs font-medium w-20 shrink-0">{label}</span>
      {num(c, onC, "C")}
      {num(m, onM, "M")}
      {num(y, onY, "Y")}
      {num(k, onK, "K")}
      <div
        className="h-7 w-7 shrink-0 rounded border border-border"
        style={{ backgroundColor: swatch }}
        title={preview}
      />
    </div>
  );
}

// ─── default size config ──────────────────────────────────────────────────────

function defaultSizeConfig(templateId: string, size: string): Omit<JerseyTemplateSize, "id"> {
  return {
    template_id: templateId,
    size,
    pdf_path: null,
    name_x: 100, name_y: 120, name_font_size: 28,
    name_cmyk_c: 0, name_cmyk_m: 0, name_cmyk_y: 0, name_cmyk_k: 100,
    number_x: 100, number_y: 220, number_font_size: 60,
    number_cmyk_c: 0, number_cmyk_m: 0, number_cmyk_y: 0, number_cmyk_k: 100,
  };
}

// ─── SizeConfigPanel ─────────────────────────────────────────────────────────

function SizeConfigPanel({
  templateId,
  size,
  config,
  onSave,
  onDelete,
}: {
  templateId: string;
  size: SizeKey;
  config: JerseyTemplateSize | null;
  onSave(updated: JerseyTemplateSize): void;
  onDelete(): void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const base = config ?? ({ ...defaultSizeConfig(templateId, size), id: "" } as JerseyTemplateSize);
  const [draft, setDraft] = useState<JerseyTemplateSize>(base);

  async function handleUpload(file: File) {
    if (!file.name.endsWith(".pdf")) return alert("Only PDF files are accepted.");
    setUploading(true);
    const path = `${templateId}/${size}.pdf`;
    const { error } = await supabase.storage
      .from("jersey-templates")
      .upload(path, file, { upsert: true, contentType: "application/pdf" });
    setUploading(false);
    if (error) { alert(error.message); return; }
    setDraft((d) => ({ ...d, pdf_path: path }));
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      template_id: draft.template_id,
      size: draft.size,
      pdf_path: draft.pdf_path,
      name_x: draft.name_x, name_y: draft.name_y, name_font_size: draft.name_font_size,
      name_cmyk_c: draft.name_cmyk_c, name_cmyk_m: draft.name_cmyk_m,
      name_cmyk_y: draft.name_cmyk_y, name_cmyk_k: draft.name_cmyk_k,
      number_x: draft.number_x, number_y: draft.number_y, number_font_size: draft.number_font_size,
      number_cmyk_c: draft.number_cmyk_c, number_cmyk_m: draft.number_cmyk_m,
      number_cmyk_y: draft.number_cmyk_y, number_cmyk_k: draft.number_cmyk_k,
    };
    let saved: JerseyTemplateSize;
    if (draft.id) {
      const { data, error } = await supabase
        .from("jersey_template_sizes").update(payload).eq("id", draft.id)
        .select("*").single();
      if (error) { setSaving(false); alert(error.message); return; }
      saved = data as JerseyTemplateSize;
    } else {
      const { data, error } = await supabase
        .from("jersey_template_sizes").insert(payload)
        .select("*").single();
      if (error) { setSaving(false); alert(error.message); return; }
      saved = data as JerseyTemplateSize;
    }
    setSaving(false);
    setDraft(saved);
    onSave(saved);
    setOpen(false);
  }

  const hasPdf = !!draft.pdf_path;
  const coord = (label: string, val: number, onChange: (v: number) => void) => (
    <div className="grid gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      <Input
        type="number" step={1} value={val}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-7 w-20 px-2 text-xs"
      />
    </div>
  );

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/40"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-bold">{size}</Badge>
          {hasPdf
            ? <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3 w-3" />PDF uploaded</span>
            : <span className="flex items-center gap-1 text-xs text-muted-foreground"><AlertCircle className="h-3 w-3" />No PDF yet</span>
          }
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t px-3 py-3 space-y-4">
          {/* PDF Upload */}
          <div className="space-y-1">
            <Label className="text-xs">Master CMYK PDF template ({size})</Label>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <span className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-muted">
                  {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {uploading ? "Uploading…" : hasPdf ? "Replace PDF" : "Upload PDF"}
                </span>
                <input
                  type="file" accept=".pdf" className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
                />
              </label>
              {hasPdf && <span className="text-xs text-muted-foreground">{size}.pdf</span>}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Upload the pre-designed CMYK SWOP PDF for size {size}. The system overlays text on this template.
            </p>
          </div>

          {/* Coordinates guide */}
          <p className="text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1.5 leading-relaxed">
            <strong>Coordinates:</strong> PDF uses points (1 pt = 1/72 in), origin at bottom-left corner.
            Measure X from the left edge and Y from the bottom edge of the page.
          </p>

          {/* SURNAME config */}
          <div className="space-y-2 rounded-md bg-muted/30 p-3">
            <p className="text-xs font-semibold">SURNAME text</p>
            <div className="flex flex-wrap gap-2">
              {coord("X (pts)", draft.name_x, (v) => setDraft((d) => ({ ...d, name_x: v })))}
              {coord("Y (pts)", draft.name_y, (v) => setDraft((d) => ({ ...d, name_y: v })))}
              {coord("Font size", draft.name_font_size, (v) => setDraft((d) => ({ ...d, name_font_size: v })))}
            </div>
            <CmykInput
              label="CMYK color"
              c={draft.name_cmyk_c} m={draft.name_cmyk_m} y={draft.name_cmyk_y} k={draft.name_cmyk_k}
              onC={(v) => setDraft((d) => ({ ...d, name_cmyk_c: v }))}
              onM={(v) => setDraft((d) => ({ ...d, name_cmyk_m: v }))}
              onY={(v) => setDraft((d) => ({ ...d, name_cmyk_y: v }))}
              onK={(v) => setDraft((d) => ({ ...d, name_cmyk_k: v }))}
            />
          </div>

          {/* NUMBER config */}
          <div className="space-y-2 rounded-md bg-muted/30 p-3">
            <p className="text-xs font-semibold">JERSEY NUMBER text</p>
            <div className="flex flex-wrap gap-2">
              {coord("X (pts)", draft.number_x, (v) => setDraft((d) => ({ ...d, number_x: v })))}
              {coord("Y (pts)", draft.number_y, (v) => setDraft((d) => ({ ...d, number_y: v })))}
              {coord("Font size", draft.number_font_size, (v) => setDraft((d) => ({ ...d, number_font_size: v })))}
            </div>
            <CmykInput
              label="CMYK color"
              c={draft.number_cmyk_c} m={draft.number_cmyk_m} y={draft.number_cmyk_y} k={draft.number_cmyk_k}
              onC={(v) => setDraft((d) => ({ ...d, number_cmyk_c: v }))}
              onM={(v) => setDraft((d) => ({ ...d, number_cmyk_m: v }))}
              onY={(v) => setDraft((d) => ({ ...d, number_cmyk_y: v }))}
              onK={(v) => setDraft((d) => ({ ...d, number_cmyk_k: v }))}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            {config && (
              <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5 mr-1" />Remove
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save {size} config
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TemplateCard ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onUpdate,
  onDelete,
}: {
  template: JerseyTemplate;
  onUpdate(updated: JerseyTemplate): void;
  onDelete(): void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(template.name);
  const [desc, setDesc] = useState(template.description ?? "");
  const [savingMeta, setSavingMeta] = useState(false);

  const sizeMap = useMemo(() => {
    const m = new Map<string, JerseyTemplateSize>();
    for (const s of template.sizes) m.set(s.size, s);
    return m;
  }, [template.sizes]);

  const uploadedCount = template.sizes.filter((s) => s.pdf_path).length;

  async function saveMeta() {
    if (!name.trim()) return;
    setSavingMeta(true);
    const { error } = await supabase
      .from("jersey_templates")
      .update({ name: name.trim(), description: desc.trim() || null })
      .eq("id", template.id);
    setSavingMeta(false);
    if (error) { alert(error.message); return; }
    onUpdate({ ...template, name: name.trim(), description: desc.trim() || null });
    setEditingName(false);
  }

  async function handleDelete() {
    const ok = window.confirm(`Delete template "${template.name}" and all its size configs? This cannot be undone.`);
    if (!ok) return;
    const { error } = await supabase.from("jersey_templates").delete().eq("id", template.id);
    if (error) { alert(error.message); return; }
    onDelete();
  }

  function handleSizeUpdate(updated: JerseyTemplateSize) {
    const sizes = template.sizes.filter((s) => s.size !== updated.size).concat(updated);
    onUpdate({ ...template, sizes });
  }

  function handleSizeDelete(size: string) {
    onUpdate({ ...template, sizes: template.sizes.filter((s) => s.size !== size) });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          {editingName ? (
            <div className="flex flex-1 flex-col gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm font-medium" placeholder="Template name" />
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="h-7 text-xs" placeholder="Description (optional)" />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void saveMeta()} disabled={savingMeta}>
                  {savingMeta ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{template.name}</CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {uploadedCount}/{SIZES.length} PDFs
                </Badge>
              </div>
              {template.description && (
                <p className="text-xs text-muted-foreground">{template.description}</p>
              )}
            </div>
          )}
          <div className="flex shrink-0 gap-1">
            {!editingName && (
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingName(true)}>
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive" onClick={handleDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setExpanded((o) => !o)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-2 pt-0">
          <p className="text-xs text-muted-foreground pb-1">
            Configure each size — upload a master CMYK PDF and set where the surname and number should be placed.
          </p>
          {SIZES.map((size) => (
            <SizeConfigPanel
              key={size}
              templateId={template.id}
              size={size}
              config={sizeMap.get(size) ?? null}
              onSave={handleSizeUpdate}
              onDelete={() => handleSizeDelete(size)}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// ─── import-from-order panel ──────────────────────────────────────────────────

type OrderBrief = { id: string; order_no: string | null; customer_name: string | null };
type SheetRow   = {
  id: string;
  team_group_key: string;
  name: string;        // team group name
  sheet_name: string;  // jersey type label
  players: { surname: string; jersey_number: string; jersey_checklist: { name: string; size: string }[] }[];
};

function uiSelect(extra?: string) {
  return `h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${extra ?? ""}`;
}

function ImportFromOrder({ onImport }: { onImport(text: string): void }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen]             = useState(false);
  const [orders, setOrders]         = useState<OrderBrief[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [sheets, setSheets]         = useState<SheetRow[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [selectedGroupKey, setSelectedGroupKey] = useState("");
  const [selectedSheetId, setSelectedSheetId]   = useState("");

  // Lazily load orders the first time the panel is opened
  const loadOrders = useCallback(async () => {
    if (orders.length > 0) return;
    setLoadingOrders(true);
    const { data } = await supabase
      .from("orders")
      .select("id, order_no, customer_name")
      .eq("kind", "sublimation")
      .order("created_at", { ascending: false })
      .limit(200);
    setLoadingOrders(false);
    setOrders((data || []) as OrderBrief[]);
  }, [supabase, orders.length]);

  async function loadSheets(orderId: string) {
    setSelectedOrderId(orderId);
    setSheets([]);
    setSelectedGroupKey("");
    setSelectedSheetId("");
    if (!orderId) return;
    setLoadingSheets(true);
    const { data } = await supabase
      .from("sublimation_teams")
      .select(`
        id, team_group_key, name, sheet_name,
        sublimation_team_players ( surname, jersey_number, jersey_checklist, sort_order )
      `)
      .eq("order_id", orderId)
      .order("sort_order");
    setLoadingSheets(false);
    setSheets(
      (data || []).map((t: any) => ({
        id: t.id,
        team_group_key: t.team_group_key || t.id,
        name: t.name || "Team",
        sheet_name: t.sheet_name || t.name || "Jersey",
        players: [...(t.sublimation_team_players || [])]
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((p: any) => ({
            surname: p.surname || "",
            jersey_number: p.jersey_number || "",
            jersey_checklist: Array.isArray(p.jersey_checklist) ? p.jersey_checklist : [],
          })),
      })) as SheetRow[],
    );
  }

  // Group sheets by team_group_key
  const teamGroups = useMemo(() => {
    const map = new Map<string, { groupKey: string; name: string; sheets: SheetRow[] }>();
    for (const s of sheets) {
      if (!map.has(s.team_group_key)) {
        map.set(s.team_group_key, { groupKey: s.team_group_key, name: s.name, sheets: [] });
      }
      map.get(s.team_group_key)!.sheets.push(s);
    }
    return Array.from(map.values());
  }, [sheets]);

  const sheetsForGroup = useMemo(
    () => teamGroups.find((g) => g.groupKey === selectedGroupKey)?.sheets ?? [],
    [teamGroups, selectedGroupKey],
  );

  const selectedSheet = useMemo(
    () => sheetsForGroup.find((s) => s.id === selectedSheetId) ?? null,
    [sheetsForGroup, selectedSheetId],
  );

  function doImport() {
    if (!selectedSheet) return;
    const lines = playersForImport
      .map((p) => {
        const size = p.jersey_checklist.find((c) => c.size?.trim())?.size?.trim() || "";
        const num  = p.jersey_number.trim() || "0";
        const name = p.surname.trim().toUpperCase();
        return `${size}, ${num}, ${name}`;
      });
    onImport(lines.join("\n"));
    setOpen(false);
  }

  const previewPlayers = selectedSheet?.players.filter((p) => p.surname.trim()) ?? [];

  // All unique sizes present in the selected sheet
  const availableSizes = useMemo(() => {
    const s = new Set<string>();
    for (const p of previewPlayers) {
      const sz = p.jersey_checklist.find((c) => c.size?.trim())?.size?.trim();
      if (sz) s.add(sz);
    }
    return Array.from(s).sort();
  }, [previewPlayers]);

  // Selected sizes for filtering ("all" = empty set means include everyone)
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());

  // Reset size filter when sheet changes
  const prevSheetId = useMemo(() => selectedSheetId, [selectedSheetId]);
  useMemo(() => { setSelectedSizes(new Set()); }, [selectedSheetId]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSize(sz: string) {
    setSelectedSizes((prev) => {
      const next = new Set(prev);
      if (next.has(sz)) next.delete(sz); else next.add(sz);
      return next;
    });
  }

  // Players that will actually be imported (respects size filter)
  const playersForImport = useMemo(() => {
    if (selectedSizes.size === 0) return previewPlayers; // no filter = all sizes
    return previewPlayers.filter((p) => {
      const sz = p.jersey_checklist.find((c) => c.size?.trim())?.size?.trim() ?? "";
      return selectedSizes.has(sz);
    });
  }, [previewPlayers, selectedSizes]);

  const missingSize = previewPlayers.filter(
    (p) => !p.jersey_checklist.find((c) => c.size?.trim()),
  );

  return (
    <Card className="border-dashed">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-muted/40 rounded-lg"
        onClick={async () => {
          if (!open) await loadOrders();
          setOpen((o) => !o);
        }}
      >
        <span className="flex items-center gap-2 font-medium">
          <PackageSearch className="h-4 w-4 text-muted-foreground" />
          Import roster from an existing order
        </span>
        {loadingOrders
          ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          : open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
        }
      </button>

      {open && (
        <CardContent className="space-y-3 pt-0 pb-4">
          {/* Order */}
          <div className="grid gap-1">
            <Label className="text-xs">Sublimation order</Label>
            <select
              className={uiSelect()}
              value={selectedOrderId}
              onChange={(e) => void loadSheets(e.target.value)}
              disabled={loadingOrders}
            >
              <option value="">— Pick an order —</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_no ? `#${o.order_no}` : "No #"}{o.customer_name ? ` · ${o.customer_name}` : ""}
                </option>
              ))}
            </select>
          </div>

          {loadingSheets && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading teams…
            </p>
          )}

          {/* Team group */}
          {teamGroups.length > 0 && (
            <div className="grid gap-1">
              <Label className="text-xs">Team</Label>
              <select
                className={uiSelect()}
                value={selectedGroupKey}
                onChange={(e) => { setSelectedGroupKey(e.target.value); setSelectedSheetId(""); setSelectedSizes(new Set()); }}
              >
                <option value="">— Pick a team —</option>
                {teamGroups.map((g) => (
                  <option key={g.groupKey} value={g.groupKey}>{g.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Jersey type / sheet */}
          {sheetsForGroup.length > 0 && (
            <div className="grid gap-1">
              <Label className="text-xs">Jersey type</Label>
              <select
                className={uiSelect()}
                value={selectedSheetId}
                onChange={(e) => { setSelectedSheetId(e.target.value); setSelectedSizes(new Set()); }}
              >
                <option value="">— Pick a jersey type —</option>
                {sheetsForGroup.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sheet_name} ({s.players.filter((p) => p.surname.trim()).length} players)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Size filter — shown once a sheet is selected and sizes are available */}
          {selectedSheet && availableSizes.length > 0 && (
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Filter by size</Label>
                {selectedSizes.size > 0 && (
                  <button
                    type="button"
                    className="text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setSelectedSizes(new Set())}
                  >
                    Clear (all sizes)
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {availableSizes.map((sz) => {
                  const active = selectedSizes.has(sz);
                  const cnt = previewPlayers.filter(
                    (p) => p.jersey_checklist.find((c) => c.size?.trim())?.size?.trim() === sz,
                  ).length;
                  return (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => toggleSize(sz)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors
                        ${active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border bg-background text-foreground hover:bg-muted"
                        }`}
                    >
                      {sz}
                      <span className={`text-[10px] ${active ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {cnt}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {selectedSizes.size === 0
                  ? `All ${previewPlayers.length} player(s) will be imported.`
                  : `${playersForImport.length} of ${previewPlayers.length} player(s) selected.`
                }
              </p>
            </div>
          )}

          {/* Preview */}
          {selectedSheet && playersForImport.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-2 space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">
                {playersForImport.length} player(s)
                {selectedSizes.size > 0 && ` · size${selectedSizes.size > 1 ? "s" : ""}: ${Array.from(selectedSizes).sort().join(", ")}`}
              </p>
              <div className="max-h-36 overflow-y-auto space-y-0.5">
                {playersForImport.slice(0, 30).map((p, i) => {
                  const size = p.jersey_checklist.find((c) => c.size?.trim())?.size?.trim();
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="text-[10px] min-w-[32px] justify-center">
                        {size || <span className="text-amber-500">?</span>}
                      </Badge>
                      <span className="font-mono font-bold w-8 text-right">{p.jersey_number}</span>
                      <span>{p.surname}</span>
                    </div>
                  );
                })}
                {playersForImport.length > 30 && (
                  <p className="text-[10px] text-muted-foreground">…and {playersForImport.length - 30} more</p>
                )}
              </div>
              {missingSize.length > 0 && (
                <p className="text-[11px] text-amber-600">
                  <AlertCircle className="inline h-3 w-3 mr-0.5" />
                  {missingSize.length} player(s) have no jersey size recorded — they&apos;ll import with an empty size.
                </p>
              )}
            </div>
          )}

          {selectedSheet && playersForImport.length === 0 && selectedSizes.size > 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              No players match the selected size{selectedSizes.size > 1 ? "s" : ""}. Adjust the filter above.
            </p>
          )}

          <Button
            type="button"
            size="sm"
            disabled={!selectedSheet || playersForImport.length === 0}
            onClick={doImport}
            className="w-full"
          >
            <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
            Use this roster
            {selectedSizes.size > 0 && (
              <span className="ml-1 text-primary-foreground/70 text-xs">
                ({playersForImport.length} player{playersForImport.length !== 1 ? "s" : ""})
              </span>
            )}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function JerseyAutomationClient({
  initialTemplates,
}: {
  initialTemplates: JerseyTemplate[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<"templates" | "generate">("templates");
  const [templates, setTemplates] = useState<JerseyTemplate[]>(initialTemplates);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Generate tab
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [rosterText, setRosterText] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  async function createTemplate() {
    if (!newName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from("jersey_templates")
      .insert({ name: newName.trim(), description: newDesc.trim() || null })
      .select("id, name, description, created_at")
      .single();
    setCreating(false);
    if (error) { alert(error.message); return; }
    setTemplates((prev) => [{ ...(data as any), sizes: [] }, ...prev]);
    setNewName("");
    setNewDesc("");
  }

  function handleRosterChange(text: string) {
    setRosterText(text);
    if (text.trim()) {
      setParseResult(parseRoster(text));
    } else {
      setParseResult(null);
    }
    setGenError(null);
  }

  async function generate() {
    if (!selectedTemplateId) return alert("Select a template first.");
    if (!parseResult?.ok) return;
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/jersey-automation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: selectedTemplateId, players: parseResult.players }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as any).error || `Server error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const tplName = selectedTemplate?.name.replace(/\s+/g, "_") ?? "jerseys";
      a.download = `${tplName}_CMYK_batch.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setGenError(err?.message ?? "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  const players = parseResult?.ok ? parseResult.players : [];
  const sizeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of players) m.set(p.size, (m.get(p.size) ?? 0) + 1);
    return m;
  }, [players]);

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border p-0.5 w-fit">
        {(["templates", "generate"] as const).map((t) => (
          <Button
            key={t}
            size="sm"
            variant={activeTab === t ? "secondary" : "ghost"}
            className="h-8 capitalize"
            onClick={() => setActiveTab(t)}
          >
            {t === "templates" ? <><Settings2 className="mr-1.5 h-3.5 w-3.5" />Templates</> : <><FileDown className="mr-1.5 h-3.5 w-3.5" />Generate</>}
          </Button>
        ))}
      </div>

      {/* ── Templates tab ── */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          {/* New template form */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Plus className="h-4 w-4" />New template set
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid gap-1">
                <Label htmlFor="tpl-name" className="text-xs">Template name <span className="text-destructive">*</span></Label>
                <Input
                  id="tpl-name" value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Team A Black Jersey 2024"
                  className="max-w-md"
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="tpl-desc" className="text-xs">Description (optional)</Label>
                <Input
                  id="tpl-desc" value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Short note about this template set"
                  className="max-w-md"
                />
              </div>
              <Button size="sm" onClick={() => void createTemplate()} disabled={creating || !newName.trim()}>
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Create template
              </Button>
            </CardContent>
          </Card>

          {templates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <Shirt className="h-10 w-10 opacity-30" />
                <p className="text-sm">No templates yet. Create one above to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {templates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onUpdate={(updated) => setTemplates((prev) => prev.map((x) => x.id === updated.id ? updated : x))}
                  onDelete={() => { setTemplates((prev) => prev.filter((x) => x.id !== t.id)); router.refresh(); }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Generate tab ── */}
      {activeTab === "generate" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: inputs */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">1. Select template</CardTitle>
              </CardHeader>
              <CardContent>
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No templates yet. Go to the Templates tab to create one.</p>
                ) : (
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                  >
                    <option value="">— Choose a template —</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.sizes.filter((s) => s.pdf_path).length}/{SIZES.length} PDFs)
                      </option>
                    ))}
                  </select>
                )}
                {selectedTemplate && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {SIZES.map((sz) => {
                      const has = selectedTemplate.sizes.find((s) => s.size === sz && s.pdf_path);
                      return (
                        <Badge key={sz} variant={has ? "default" : "outline"} className="text-[10px]">
                          {sz} {has ? "✓" : "–"}
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Import from order */}
            <ImportFromOrder onImport={(text) => handleRosterChange(text)} />

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">2. Paste roster</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  One player per line. Format: <code className="rounded bg-muted px-1 text-[11px]">SIZE, NUMBER, SURNAME</code>
                  <br />
                  Accepted sizes: XS, S, M, L, XL, 2XL, 3XL (or full names like SMALL, MEDIUM…)
                </p>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[160px] font-mono resize-y"
                  placeholder={"S, 10, SMITH\nM, 7, JONES\nL, 23, GARCIA\nXL, 5, REYES"}
                  value={rosterText}
                  onChange={(e) => handleRosterChange(e.target.value)}
                />
                {parseResult && !parseResult.ok && (
                  <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive whitespace-pre-wrap">
                    <AlertCircle className="inline h-3.5 w-3.5 mr-1" />
                    {parseResult.error}
                  </div>
                )}
                {parseResult?.ok && (
                  <p className="text-xs text-green-600">
                    <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
                    {parseResult.players.length} player(s) parsed successfully.
                  </p>
                )}
              </CardContent>
            </Card>

            {genError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="inline h-4 w-4 mr-1" />
                {genError}
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={!selectedTemplateId || !parseResult?.ok || generating}
              onClick={() => void generate()}
            >
              {generating
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating CMYK PDFs…</>
                : <><FileDown className="mr-2 h-4 w-4" />Generate &amp; Download CMYK ZIP</>
              }
            </Button>
            <p className="text-xs text-muted-foreground">
              The backend overlays each player's surname and number on the corresponding size's CMYK template,
              preserving the original SWOP color profile. A ZIP archive of individual PDFs is downloaded.
            </p>
          </div>

          {/* Right: roster preview */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Roster preview</CardTitle>
              </CardHeader>
              <CardContent>
                {players.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Paste a roster on the left to preview it here.</p>
                ) : (
                  <>
                    {/* Size summary */}
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {Array.from(sizeCounts.entries()).sort().map(([sz, cnt]) => (
                        <Badge key={sz} variant="muted" className="text-xs">
                          {sz}: {cnt}
                        </Badge>
                      ))}
                      <Badge variant="outline" className="text-xs">Total: {players.length}</Badge>
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">#</th>
                            <th className="px-3 py-2 text-left font-medium">Size</th>
                            <th className="px-3 py-2 text-left font-medium">Number</th>
                            <th className="px-3 py-2 text-left font-medium">Surname</th>
                          </tr>
                        </thead>
                        <tbody>
                          {players.map((p, i) => {
                            const hasTemplate = selectedTemplate?.sizes.find((s) => s.size === p.size && s.pdf_path);
                            return (
                              <tr key={i} className={`border-t ${!hasTemplate ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                                <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                                <td className="px-3 py-1.5">
                                  <Badge variant="outline" className="text-[10px]">{p.size}</Badge>
                                  {!hasTemplate && selectedTemplateId && (
                                    <span className="ml-1 text-[10px] text-amber-600" title="No PDF uploaded for this size">⚠</span>
                                  )}
                                </td>
                                <td className="px-3 py-1.5 font-mono font-bold">{p.number}</td>
                                <td className="px-3 py-1.5 font-medium tracking-wide">{p.name}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {selectedTemplateId && players.some((p) => !selectedTemplate?.sizes.find((s) => s.size === p.size && s.pdf_path)) && (
                      <p className="mt-2 text-xs text-amber-600">
                        ⚠ Highlighted rows have sizes without a PDF template — those players will be skipped during generation.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
