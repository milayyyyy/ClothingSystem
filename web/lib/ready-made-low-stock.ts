export type ReadyMadeCol = { id: string; header_name: string; sort_order: number };
export type ReadyMadeRow = { id: string; row_label: string; sort_order: number };

function parseNumericCell(raw: string): number | null {
  const s = String(raw ?? "")
    .trim()
    .replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export type ReadyMadeLowStockRow = {
  rowId: string;
  rowLabel: string;
  qty: number;
  min: number;
  qtyHeader: string;
  minHeader: string;
};

/**
 * When `sheetMinimum` is set, each row is low stock if any grid column has a numeric cell
 * strictly below that minimum. The reported `qty` is the lowest such value in the row (tie: first column).
 */
export function computeReadyMadeLowStockRows(
  rows: ReadyMadeRow[],
  cols: ReadyMadeCol[],
  cellByPair: Map<string, string>,
  options?: { sheetMinimum?: number | null },
): ReadyMadeLowStockRow[] {
  const sm = options?.sheetMinimum;
  if (sm == null || !Number.isFinite(sm)) return [];
  const threshold = Math.trunc(Number(sm));
  if (threshold < 0) return [];
  if (!cols.length) return [];

  const colsSorted = [...cols].sort((a, b) => a.sort_order - b.sort_order);
  const out: ReadyMadeLowStockRow[] = [];

  for (const r of rows) {
    let bestQty: number | null = null;
    let bestHeader = "";

    for (const c of colsSorted) {
      const qv = parseNumericCell(cellByPair.get(`${r.id}:${c.id}`) ?? "");
      if (qv == null) continue;
      if (qv < threshold) {
        if (bestQty == null || qv < bestQty) {
          bestQty = qv;
          bestHeader = String(c.header_name || "").trim() || "Column";
        }
      }
    }

    if (bestQty != null) {
      out.push({
        rowId: r.id,
        rowLabel: r.row_label || "Row",
        qty: bestQty,
        min: threshold,
        qtyHeader: bestHeader,
        minHeader: "Sheet minimum",
      });
    }
  }

  return out;
}
