/** Calendar days inclusive between period_start and period_end (YYYY-MM-DD). */
export function periodCalendarDays(periodStart: string, periodEnd: string) {
  const a = new Date(periodStart + "T12:00:00");
  const b = new Date(periodEnd + "T12:00:00");
  const diff = Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, diff + 1);
}

/** Sum raw clocked hours (time_out − time_in) for one user within [periodStart, periodEnd] by local calendar day of time_in. */
export function hoursWorkedInPeriod(
  attendance: { user_id: string; time_in: string; time_out: string | null }[],
  userId: string,
  periodStart: Date,
  periodEnd: Date,
) {
  let total = 0;
  for (const a of attendance) {
    if (a.user_id !== userId) continue;
    const tin = new Date(a.time_in);
    if (tin < periodStart || tin > periodEnd) continue;
    if (!a.time_out) continue;
    const tout = new Date(a.time_out);
    const ms = tout.getTime() - tin.getTime();
    if (ms > 0) total += ms / 3_600_000;
  }
  return Math.round(total * 100) / 100;
}

/** First N paid hours per day at regular rate; paid hours above N use OT rate (hourly). */
export const REGULAR_HOURS_BEFORE_OT_DEFAULT = 9;

const DEFAULT_REGULAR_HOURS_BEFORE_OT = REGULAR_HOURS_BEFORE_OT_DEFAULT;

export type HourlyPayBreakdown = {
  /** Sum of raw clock hours (before break). */
  rawHoursTotal: number;
  /** Sum of paid hours after subtracting break once per calendar day (billable work time). */
  paidHoursTotal: number;
  /** Paid hours billed at regular rate (first `regularHoursBeforeOtPerDay` each day, summed). */
  regularHours: number;
  /** Paid hours beyond that threshold each day, summed (overtime). */
  overtimeHours: number;
  /** Distinct local days with at least one closed shift in range. */
  daysWithShifts: number;
};

/**
 * Hourly payroll from attendance: group by local calendar day of time_in, sum raw hours that day,
 * subtract `breakMinutes` once that day (not more than that day’s raw total) → **paid hours** for the day,
 * then split paid hours: first `regularHoursBeforeOtPerDay` at regular rate, **succeeding** hours at OT rate.
 */
export function hourlyPayBreakdown(
  attendance: { user_id: string; time_in: string; time_out: string | null }[],
  userId: string,
  periodStart: Date,
  periodEnd: Date,
  breakMinutes: number,
  regularHoursBeforeOtPerDay = DEFAULT_REGULAR_HOURS_BEFORE_OT,
): HourlyPayBreakdown {
  const breakH = Math.max(0, Number(breakMinutes || 0) / 60);
  const capParam = Number(regularHoursBeforeOtPerDay);
  const cap = capParam > 0 ? capParam : DEFAULT_REGULAR_HOURS_BEFORE_OT;
  const dayToRaw = new Map<string, number>();

  for (const a of attendance) {
    if (a.user_id !== userId || !a.time_out) continue;
    const tin = new Date(a.time_in);
    if (tin < periodStart || tin > periodEnd) continue;
    const tout = new Date(a.time_out);
    const rawH = Math.max(0, (tout.getTime() - tin.getTime()) / 3_600_000);
    if (rawH <= 0) continue;
    const key = tin.toDateString();
    dayToRaw.set(key, (dayToRaw.get(key) || 0) + rawH);
  }

  let rawHoursTotal = 0;
  let paidHoursTotal = 0;
  let regularHours = 0;
  let overtimeHours = 0;

  for (const rawDay of dayToRaw.values()) {
    rawHoursTotal += rawDay;
    const paidDay = Math.max(0, rawDay - Math.min(breakH, rawDay));
    paidHoursTotal += paidDay;
    regularHours += Math.min(cap, paidDay);
    overtimeHours += Math.max(0, paidDay - cap);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    rawHoursTotal: round2(rawHoursTotal),
    paidHoursTotal: round2(paidHoursTotal),
    regularHours: round2(regularHours),
    overtimeHours: round2(overtimeHours),
    daysWithShifts: dayToRaw.size,
  };
}

/** Pesos for hourly regular + OT buckets. If `overtimeHourlyRate` is 0, OT hours use `regularHourlyRate`. */
export function hourlyGrossFromBuckets(
  regularHours: number,
  overtimeHours: number,
  regularHourlyRate: number,
  overtimeHourlyRate: number,
) {
  const rr = Number(regularHourlyRate || 0);
  const or = Number(overtimeHourlyRate) > 0 ? Number(overtimeHourlyRate) : rr;
  return Math.round((regularHours * rr + overtimeHours * or) * 100) / 100;
}

/** `salaryRate`: pesos per day/week/month as applicable; for `hourly`, pesos per hour (simple total×rate — prefer hourlyGrossFromBuckets + hourlyPayBreakdown for break/OT). */
export function baseSalaryGross(
  salaryType: string,
  salaryRate: number,
  daysWorked: number,
  periodDays: number,
  hoursWorked = 0,
) {
  const rate = Number(salaryRate || 0);
  switch (salaryType) {
    case "daily":
      return daysWorked * rate;
    case "hourly":
      return Math.round(hoursWorked * rate * 100) / 100;
    case "monthly":
      return rate;
    case "weekly":
      return (periodDays / 7) * rate;
    case "biweekly":
      return (periodDays / 14) * rate;
    case "every_3_weeks":
      return (periodDays / 21) * rate;
    case "per_order":
      return 0;
    default:
      return 0;
  }
}

export function allowanceForPeriod(
  basis: string | null | undefined,
  amount: number,
  allowanceWeeksN: number | null | undefined,
  daysWorked: number,
  periodDays: number
) {
  const b = (basis || "none").toLowerCase();
  const amt = Number(amount || 0);
  if (b === "none" || amt <= 0) return 0;
  if (b === "per_day") return daysWorked * amt;
  if (b === "per_week") return (periodDays / 7) * amt;
  if (b === "every_n_weeks") {
    const n = Math.max(1, Math.floor(Number(allowanceWeeksN) || 1));
    return (periodDays / (7 * n)) * amt;
  }
  if (b === "monthly") return amt;
  return 0;
}

export function salaryTypeLabel(t: string | null | undefined) {
  const m: Record<string, string> = {
    daily: "Daily",
    hourly: "Hourly",
    weekly: "Every week",
    biweekly: "Every 2 weeks",
    every_3_weeks: "Every 3 weeks",
    monthly: "Monthly",
    per_order: "Per order",
  };
  return m[String(t || "")] || String(t || "—");
}

export function allowanceBasisLabel(b: string | null | undefined) {
  const m: Record<string, string> = {
    none: "No allowance",
    per_day: "Allowance per day worked",
    per_week: "Allowance per week (calendar)",
    every_n_weeks: "Allowance every N weeks",
    monthly: "Allowance monthly (flat)",
  };
  return m[String(b || "none")] || String(b || "—");
}
