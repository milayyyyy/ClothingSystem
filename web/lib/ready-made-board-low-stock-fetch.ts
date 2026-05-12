import type { SupabaseClient } from "@supabase/supabase-js";
import { computeReadyMadeLowStockRows, type ReadyMadeLowStockRow } from "@/lib/ready-made-low-stock";

export type ReadyMadeBoardLowStockMeta = {
  id: string;
  low_stock_minimum_enabled?: boolean | null;
  low_stock_sheet_minimum?: number | null;
};

/** Loads grid data from Supabase and returns low-stock rows for one board (same rules as the ready-made UI). */
export async function fetchReadyMadeLowStockRowsForBoard(
  supabase: SupabaseClient,
  board: ReadyMadeBoardLowStockMeta,
): Promise<ReadyMadeLowStockRow[]> {
  if (board.low_stock_minimum_enabled === false) return [];
  const v = board.low_stock_sheet_minimum;
  if (v == null || !Number.isFinite(Number(v))) return [];
  const sheetMinimum = Math.trunc(Number(v));
  if (sheetMinimum < 0) return [];

  const [{ data: cols }, { data: rows }] = await Promise.all([
    supabase.from("ready_made_columns").select("id,header_name,sort_order").eq("board_id", board.id).order("sort_order"),
    supabase.from("ready_made_rows").select("id,row_label,sort_order").eq("board_id", board.id).order("sort_order"),
  ]);
  if (!cols?.length || !rows?.length) return [];

  const rowIds = (rows as { id: string }[]).map((r) => r.id);
  const { data: cellsData } = await supabase
    .from("ready_made_cells")
    .select("row_id,column_id,value")
    .in("row_id", rowIds);

  const cellMap = new Map<string, string>();
  for (const c of cellsData || []) {
    const cell = c as { row_id: string; column_id: string; value: string };
    cellMap.set(`${cell.row_id}:${cell.column_id}`, cell.value ?? "");
  }

  return computeReadyMadeLowStockRows(
    rows as { id: string; row_label: string; sort_order: number }[],
    cols as { id: string; header_name: string; sort_order: number }[],
    cellMap,
    { sheetMinimum },
  );
}
