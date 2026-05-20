/** Parse BigSeller date labels like `13 May 2026 11:09` or `13 May 2026 11:09:30 AM`. */
export function parseBigSellerDateTimeLabel(raw: unknown): string | null {
  const t = String(raw ?? "").trim();
  if (!t || t === "--") return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Split stored ISO into readable date + time lines (BigSeller PDF printed time column). */
export function formatBigSellerPrintedAt(iso: string | null | undefined): {
  date: string;
  time: string;
  full: string;
} | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const date = d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return { date, time, full: `${date}, ${time}` };
}
