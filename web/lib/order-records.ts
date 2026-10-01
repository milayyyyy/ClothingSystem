import type { ReturnListTab } from "@/lib/bigseller-return-excel";

export const ORDER_RECORD_BUCKET = "order-record-attachments";

export type OrderRecordStatus = "draft" | "submitted" | "approved" | "rejected";

export type { ReturnListTab } from "@/lib/bigseller-return-excel";

export type ManualSheetColumn = { id: string; label: string };
export type ManualSheetRow = { id: string; cells: Record<string, string> };

/** Free-text usage sheet — not linked to inventory; admin deducts stock manually. */
export type ManualUsageSheet = {
  id: string;
  name: string;
  columns: ManualSheetColumn[];
  rows: ManualSheetRow[];
};

export type DriverReturnPick = {
  orderId: string;
  orderNo: string;
  trackingNo: string;
  productName: string;
  customerName: string;
  from: string;
  to: string;
  tab?: ReturnListTab;
  packageNo?: string;
  externalOrderNo?: string;
};

export type OrderRecordRow = {
  id: string;
  submitted_by: string;
  record_date: string;
  title: string | null;
  notes: string | null;
  status: OrderRecordStatus;
  source?: "manual" | "pos" | null;
  stock_lines: ManualUsageSheet[];
  driver_returns?: DriverReturnPick[];
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

const RETURN_TABS: ReturnListTab[] = ["returning", "to_check", "returned"];

function asReturnTab(v: unknown): ReturnListTab | undefined {
  return typeof v === "string" && (RETURN_TABS as string[]).includes(v) ? (v as ReturnListTab) : undefined;
}

export function parseDriverReturns(raw: unknown): DriverReturnPick[] {
  if (!Array.isArray(raw)) return [];
  const out: DriverReturnPick[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const orderId = typeof o.orderId === "string" ? o.orderId : "";
    if (!orderId) continue;
    out.push({
      orderId,
      orderNo: typeof o.orderNo === "string" ? o.orderNo : "",
      trackingNo: typeof o.trackingNo === "string" ? o.trackingNo : "",
      productName: typeof o.productName === "string" ? o.productName : "",
      customerName: typeof o.customerName === "string" ? o.customerName : "",
      from: typeof o.from === "string" ? o.from : "",
      to: typeof o.to === "string" ? o.to : "",
      tab: asReturnTab(o.tab),
      packageNo: typeof o.packageNo === "string" ? o.packageNo : "",
      externalOrderNo: typeof o.externalOrderNo === "string" ? o.externalOrderNo : "",
    });
  }
  return out;
}

/** Employees can edit their own record until it is approved. */
export function employeeCanEditOrderRecord(
  status: OrderRecordStatus,
  submittedBy: string,
  userId: string,
) {
  return submittedBy === userId && status !== "approved";
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
