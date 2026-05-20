export const SUPPLIER_WEEKDAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
] as const;

export type SupplierWeekdayKey = (typeof SUPPLIER_WEEKDAYS)[number]["key"];

const DAY_LABEL = Object.fromEntries(SUPPLIER_WEEKDAYS.map((d) => [d.key, d.label])) as Record<
  SupplierWeekdayKey,
  string
>;

/** Normalize DB time (e.g. 09:00:00) for `<input type="time">`. */
export function toTimeInputValue(v: string | null | undefined): string {
  const t = String(v ?? "").trim();
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function formatTime12h(hhmm: string | null | undefined): string {
  const t = toTimeInputValue(hhmm);
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return t;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatSupplierDaysOpen(days: string[] | null | undefined): string {
  const keys = (days || []).filter((d) => d in DAY_LABEL) as SupplierWeekdayKey[];
  if (keys.length === 0) return "";
  const ordered = SUPPLIER_WEEKDAYS.map((d) => d.key).filter((k) => keys.includes(k));
  if (ordered.length === 7) return "Daily";
  if (
    ordered.length === 5 &&
    ordered.every((k) => ["mon", "tue", "wed", "thu", "fri"].includes(k))
  ) {
    return "Mon–Fri";
  }
  return ordered.map((k) => DAY_LABEL[k]).join(", ");
}

export function formatSupplierHoursSummary(s: {
  days_open?: string[] | null;
  opens_at?: string | null;
  closes_at?: string | null;
}): string | null {
  const days = formatSupplierDaysOpen(s.days_open);
  const open = formatTime12h(s.opens_at);
  const close = formatTime12h(s.closes_at);
  const time =
    open && close ? `${open} – ${close}` : open ? `Opens ${open}` : close ? `Closes ${close}` : "";
  if (days && time) return `${days} · ${time}`;
  if (days) return days;
  if (time) return time;
  return null;
}
