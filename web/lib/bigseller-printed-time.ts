/**
 * BigSeller pick lists include a header like: `Printed Time: 11 May 2026 12:45`
 * (optionally with seconds and/or AM/PM). Parsed in the importing user's local timezone.
 */
export function parseBigSellerPrintedTimeFromPdfText(rawText: string): { at: Date | null; raw: string | null } {
  const collapsed = rawText.replace(/\s+/g, " ").trim();
  const m = collapsed.match(
    /(?:Printed\s+Time|Printed)\s*:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i,
  );
  if (!m) return { at: null, raw: null };
  const raw = m[1].trim();
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { at: null, raw };
  return { at: d, raw };
}
