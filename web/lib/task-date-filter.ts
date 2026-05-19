export type TaskDatePreset = "today" | "yesterday" | "weekly" | "monthly" | "all";

export function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Due date, or created date when no due date is set. */
export function taskDateKey(t: { due_date?: string | null; created_at?: string | null }) {
  if (t.due_date) return String(t.due_date).slice(0, 10);
  if (t.created_at) return String(t.created_at).slice(0, 10);
  return "";
}

export function inTaskDateRange(
  dateKey: string,
  from: string,
  to: string,
  allTime: boolean,
) {
  if (allTime) return true;
  if (!dateKey) return false;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
}

export function taskDateRangeForPreset(p: TaskDatePreset): {
  from: string;
  to: string;
  allTime: boolean;
} {
  if (p === "all") return { from: "", to: "", allTime: true };

  const now = new Date();
  const today = isoDate(now);

  if (p === "today") return { from: today, to: today, allTime: false };
  if (p === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const ymd = isoDate(y);
    return { from: ymd, to: ymd, allTime: false };
  }
  if (p === "weekly") {
    const start = new Date(now);
    const dow = start.getDay();
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    start.setDate(start.getDate() - mondayOffset);
    return { from: isoDate(start), to: today, allTime: false };
  }
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: isoDate(first), to: today, allTime: false };
}
