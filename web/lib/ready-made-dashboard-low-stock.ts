import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchReadyMadeLowStockRowsForBoard } from "@/lib/ready-made-board-low-stock-fetch";
import type { DashboardLowStockItem } from "@/components/dashboard-reminder-cards";

type BoardRow = {
  id: string;
  name: string;
  low_stock_minimum_enabled?: boolean | null;
  low_stock_sheet_minimum?: number | null;
};

/** Rows from ready-made sheets that count as low stock (same rules as the ready-made page: all columns vs sheet minimum). */
export async function fetchReadyMadeDashboardLowStockItems(
  supabase: SupabaseClient,
): Promise<DashboardLowStockItem[]> {
  const { data: boards, error } = await supabase
    .from("ready_made_boards")
    .select("id,name,low_stock_minimum_enabled,low_stock_sheet_minimum");
  if (error || !boards?.length) return [];

  const activeBoards = (boards as BoardRow[]).filter((b) => b.low_stock_minimum_enabled !== false);
  const items: DashboardLowStockItem[] = [];

  for (const board of activeBoards) {
    const lowRows = await fetchReadyMadeLowStockRowsForBoard(supabase, board);
    for (const lr of lowRows) {
      items.push({
        id: `ready-made:${board.id}:${lr.rowId}`,
        name: `${board.name || "Sheet"} · ${lr.rowLabel}`,
        quantity: lr.qty,
        min_level: lr.min,
        unit: null,
      });
    }
  }

  return items;
}
