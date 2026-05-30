export const ORDER_RECORD_BUCKET = "order-record-attachments";

export type OrderRecordStatus = "draft" | "submitted" | "approved" | "rejected";

export type ManualSheetColumn = { id: string; label: string };
export type ManualSheetRow = { id: string; cells: Record<string, string> };

/** Free-text usage sheet — not linked to inventory; admin deducts stock manually. */
export type ManualUsageSheet = {
  id: string;
  name: string;
  columns: ManualSheetColumn[];
  rows: ManualSheetRow[];
};

export type OrderRecordRow = {
  id: string;
  submitted_by: string;
  record_date: string;
  title: string | null;
  notes: string | null;
  status: OrderRecordStatus;
  stock_lines: ManualUsageSheet[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  submitter?: { full_name: string | null; email: string } | null;
};

export type OrderRecordAttachment = {
  id: string;
  record_id: string;
  path: string;
  file_name: string;
  mime_type: string | null;
  kind: "pdf" | "photo";
  created_at: string;
};

export function newSheetId() {
  return crypto.randomUUID();
}

export function emptyUsageSheet(name = "Sheet 1"): ManualUsageSheet {
  const colA = newSheetId();
  const colB = newSheetId();
  return {
    id: newSheetId(),
    name,
    columns: [
      { id: colA, label: "Item / description" },
      { id: colB, label: "Qty / notes" },
    ],
    rows: [],
  };
}

export function parseUsageSheets(raw: unknown): ManualUsageSheet[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    if (raw.length === 0) return [];
    const first = raw[0] as Record<string, unknown>;
    if (first?.kind === "inventory" || first?.kind === "ready_made") return [];
    return raw
      .filter((s) => s && typeof s === "object" && typeof (s as ManualUsageSheet).name === "string")
      .map(normalizeSheet);
  }
  if (typeof raw === "object" && raw !== null && "sheets" in raw) {
    const sheets = (raw as { sheets: unknown }).sheets;
    return Array.isArray(sheets) ? sheets.map(normalizeSheet) : [];
  }
  return [];
}

function normalizeSheet(s: ManualUsageSheet): ManualUsageSheet {
  const columns =
    s.columns?.length > 0
      ? s.columns.map((c) => ({ id: c.id || newSheetId(), label: c.label || "Column" }))
      : emptyUsageSheet(s.name).columns;
  const colIds = new Set(columns.map((c) => c.id));
  const rows = (s.rows || []).map((r) => {
    const cells: Record<string, string> = {};
    for (const col of columns) {
      cells[col.id] = r.cells?.[col.id] ?? "";
    }
    for (const [k, v] of Object.entries(r.cells || {})) {
      if (colIds.has(k)) cells[k] = v;
    }
    return { id: r.id || newSheetId(), cells };
  });
  return {
    id: s.id || newSheetId(),
    name: s.name || "Sheet",
    columns,
    rows,
  };
}

export function usageSheetsSummary(sheets: ManualUsageSheet[]): string {
  if (!sheets.length) return "0 sheets";
  const rows = sheets.reduce((n, s) => n + s.rows.length, 0);
  return `${sheets.length} sheet(s), ${rows} row(s)`;
}

export function attachmentKind(file: File): "pdf" | "photo" | null {
  const t = (file.type || "").toLowerCase();
  const n = file.name.toLowerCase();
  if (t === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (t.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic)$/i.test(n)) return "photo";
  return null;
}

export function safeAttachmentName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}
