import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function peso(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return "₱" + v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Supabase/PostgREST errors are often plain objects, not `instanceof Error`. */
export function formatSupabaseError(e: unknown): string {
  if (e && typeof e === "object") {
    const o = e as { message?: string; details?: string; hint?: string; code?: string };
    const bits = [o.message, o.details, o.hint].filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
    if (bits.length) return bits.join(" — ");
    if (typeof o.code === "string" && o.code.trim()) return `Database error (${o.code})`;
  }
  if (e instanceof Error && e.message) return e.message;
  return "Something went wrong";
}
