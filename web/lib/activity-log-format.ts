export type ActivityLogRow = {
  id?: string;
  action: string;
  entity: string;
  entity_id?: string | null;
  summary?: string | null;
  payload?: unknown;
};

export type ActivityChange = {
  field: string;
  from: unknown;
  to: unknown;
};

export type ActivityFormatted = {
  actionLabel: "Added" | "Edited" | "Deleted";
  entityLabel: string;
  context: string;
  lines: string[];
  searchText: string;
};

const ENTITY_LABELS: Record<string, string> = {
  orders: "Order",
  inventory: "Inventory",
  expenses: "Expense",
  suppliers: "Supplier",
  salaries: "Salary",
  tasks: "Task",
  stores: "Store",
  finance_accounts: "Finance account",
  finance_transactions: "Finance transaction",
  manual_sales: "Manual sale",
  maintenance_schedules: "Maintenance",
  ready_made_boards: "Ready-made sheet",
  ready_made_columns: "Ready-made column",
  ready_made_rows: "Ready-made row",
  ready_made_cells: "Ready-made cell",
  ready_made_sheet_groups: "Sheet group",
};

const TITLE_FIELDS: Record<string, string[]> = {
  orders: ["order_no", "customer_name", "external_order_no"],
  inventory: ["name"],
  expenses: ["description", "category"],
  suppliers: ["name"],
  salaries: ["amount", "period_start", "period_end"],
  tasks: ["title"],
  stores: ["name"],
  finance_accounts: ["name", "kind"],
  finance_transactions: ["description", "amount", "direction"],
  manual_sales: ["description", "amount", "sale_date"],
  maintenance_schedules: ["title", "machine_name"],
  ready_made_boards: ["name"],
  ready_made_sheet_groups: ["name"],
};

const FIELD_LABELS: Record<string, string> = {
  order_no: "Order #",
  customer_name: "Customer",
  full_name: "Name",
  expense_date: "Date",
  sale_date: "Sale date",
  finance_account_id: "Finance account",
  supplier_id: "Supplier",
  user_id: "Employee",
  on_call_staff_id: "On-call staff",
  item_type: "Type",
  min_level: "Min level",
  unit_cost: "Unit cost",
  down_payment: "Down payment",
  order_type: "Order type",
  sub_stage: "Sub-stage",
  return_status: "Return status",
  return_reason: "Return reason",
  paid_through: "Paid through",
  revenue_channel: "Revenue channel",
  product_service: "Product / service",
  header_name: "Column header",
  row_label: "Row label",
  group_id: "Group",
  board_id: "Sheet",
};

const HIDDEN_ON_INSERT = new Set([
  "id",
  "created_at",
  "updated_at",
  "actor_id",
  "face_descriptor",
  "jersey_checklist",
  "bigseller_line_items",
]);

const MAX_VALUE_LEN = 120;
const MAX_INSERT_FIELDS = 24;
const MAX_LEGACY_FIELDS = 12;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isV2Payload(p: unknown): p is {
  version: number;
  op?: string;
  table?: string;
  changes?: ActivityChange[];
  record?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
} {
  return isRecord(p) && p.version === 2;
}

export function entityDisplayName(entity: string): string {
  return ENTITY_LABELS[entity] || entity.replace(/_/g, " ");
}

export function fieldDisplayName(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  return field.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatActivityValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    const t = value.trim();
    if (t.length <= MAX_VALUE_LEN) return t;
    return `${t.slice(0, MAX_VALUE_LEN)}…`;
  }
  try {
    const s = JSON.stringify(value);
    if (s.length <= MAX_VALUE_LEN) return s;
    return `${s.slice(0, MAX_VALUE_LEN)}…`;
  } catch {
    return String(value);
  }
}

function recordContext(entity: string, record: Record<string, unknown> | undefined): string {
  if (!record) return "";
  const fields = TITLE_FIELDS[entity] || ["name", "title", "description", "order_no"];
  const parts: string[] = [];
  for (const f of fields) {
    const v = record[f];
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      parts.push(`${fieldDisplayName(f)}: ${formatActivityValue(v)}`);
    }
  }
  if (parts.length) return parts.join(" · ");
  if (record.id) return `ID ${String(record.id).slice(0, 8)}…`;
  return "";
}

function formatChangeLine(c: ActivityChange): string {
  const label = fieldDisplayName(c.field);
  const from = formatActivityValue(c.from);
  const to = formatActivityValue(c.to);
  return `${label}: ${from} → ${to}`;
}

function formatInsertLines(record: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (HIDDEN_ON_INSERT.has(key)) continue;
    if (value === null || value === undefined || value === "") continue;
    lines.push(`${fieldDisplayName(key)}: ${formatActivityValue(value)}`);
    if (lines.length >= MAX_INSERT_FIELDS) {
      lines.push("…and more fields");
      break;
    }
  }
  return lines;
}

function formatLegacySnapshot(record: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (["id", "created_at", "updated_at"].includes(key)) continue;
    if (value === null || value === undefined || value === "") continue;
    lines.push(`${fieldDisplayName(key)}: ${formatActivityValue(value)}`);
    if (lines.length >= MAX_LEGACY_FIELDS) break;
  }
  if (Object.keys(record).length > MAX_LEGACY_FIELDS) {
    lines.push("…(snapshot may be incomplete for older logs)");
  }
  return lines;
}

export function formatActivityLog(row: ActivityLogRow): ActivityFormatted {
  const action = String(row.action || "").toUpperCase();
  const entityLabel = entityDisplayName(row.entity);
  const payload = row.payload;

  let actionLabel: ActivityFormatted["actionLabel"] = "Edited";
  if (action === "INSERT") actionLabel = "Added";
  if (action === "DELETE") actionLabel = "Deleted";

  if (isV2Payload(payload)) {
    const record =
      action === "DELETE"
        ? payload.record
        : action === "INSERT"
          ? payload.record
          : payload.after;
    const context = recordContext(row.entity, record);

    if (action === "UPDATE" && Array.isArray(payload.changes) && payload.changes.length > 0) {
      const lines = payload.changes.map((c) =>
        formatChangeLine({
          field: String(c.field),
          from: c.from,
          to: c.to,
        }),
      );
      return {
        actionLabel: "Edited",
        entityLabel,
        context,
        lines,
        searchText: [entityLabel, context, ...lines].join(" "),
      };
    }

    if (action === "INSERT" && payload.record) {
      const lines = formatInsertLines(payload.record);
      return {
        actionLabel: "Added",
        entityLabel,
        context,
        lines: lines.length ? lines : ["New record created"],
        searchText: [entityLabel, context, ...lines].join(" "),
      };
    }

    if (action === "DELETE" && payload.record) {
      const lines = formatInsertLines(payload.record);
      return {
        actionLabel: "Deleted",
        entityLabel,
        context,
        lines: lines.length ? lines : ["Record removed"],
        searchText: [entityLabel, context, ...lines].join(" "),
      };
    }
  }

  // Legacy logs: payload is the row snapshot only
  const legacyRecord = isRecord(payload) ? payload : undefined;
  const context = recordContext(row.entity, legacyRecord);

  if (action === "INSERT") {
    const lines = legacyRecord ? formatInsertLines(legacyRecord) : ["New record"];
    return {
      actionLabel: "Added",
      entityLabel,
      context,
      lines,
      searchText: [entityLabel, context, ...lines].join(" "),
    };
  }

  if (action === "DELETE") {
    const lines = legacyRecord ? formatLegacySnapshot(legacyRecord) : ["Record removed"];
    return {
      actionLabel: "Deleted",
      entityLabel,
      context,
      lines,
      searchText: [entityLabel, context, ...lines].join(" "),
    };
  }

  const lines = legacyRecord
    ? formatLegacySnapshot(legacyRecord)
    : [row.summary || "Updated (no field details stored)"];
  return {
    actionLabel: "Edited",
    entityLabel,
    context,
    lines,
    searchText: [entityLabel, context, row.summary || "", ...lines].join(" "),
  };
}
