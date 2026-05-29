import type { SupabaseClient } from "@supabase/supabase-js";

export type InventoryStockRow = {
  id: string;
  name: string;
  category: string;
  item_type: string;
  quantity: number;
  unit: string;
  min_level: string;
  unit_cost: string;
  supplier: string;
  supplier_link: string;
  notes: string;
};

export type ReadyMadeStockRow = {
  group: string;
  sheet: string;
  row: string;
  column: string;
  value: string;
};

function escapeCsv(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsv).join(","));
  }
  return lines.join("\n");
}

export function downloadCsvFile(csv: string, filename: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function fetchAllInventoryStock(supabase: SupabaseClient): Promise<InventoryStockRow[]> {
  const { data, error } = await supabase.from("inventory").select("*").order("name");
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id || ""),
    name: String(r.name || ""),
    category: String(r.category ?? ""),
    item_type: String(r.item_type ?? ""),
    quantity: Number(r.quantity ?? 0),
    unit: String(r.unit ?? ""),
    min_level: r.min_level == null ? "" : String(r.min_level),
    unit_cost: r.unit_cost == null ? "" : String(r.unit_cost),
    supplier: String(r.supplier ?? ""),
    supplier_link: String(r.supplier_link ?? ""),
    notes: String(r.notes ?? ""),
  }));
}

export async function fetchReadyMadeStockFlat(supabase: SupabaseClient): Promise<ReadyMadeStockRow[]> {
  const [
    { data: grps, error: gErr },
    { data: bds, error: bErr },
    { data: allCols, error: cErr },
    { data: allRows, error: rErr },
    { data: allCells, error: cellErr },
  ] = await Promise.all([
    supabase.from("ready_made_sheet_groups").select("id,name").order("sort_order"),
    supabase.from("ready_made_boards").select("id,name,group_id").order("sort_order"),
    supabase.from("ready_made_columns").select("id,board_id,name,sort_order").order("sort_order"),
    supabase.from("ready_made_rows").select("id,board_id,label,sort_order").order("sort_order"),
    supabase.from("ready_made_cells").select("row_id,column_id,value"),
  ]);
  const err = gErr || bErr || cErr || rErr || cellErr;
  if (err) throw err;

  const groupMap = Object.fromEntries((grps || []).map((g: { id: string; name: string }) => [g.id, g.name]));
  const cellMap = Object.fromEntries(
    (allCells || []).map((c: { row_id: string; column_id: string; value: unknown }) => [
      `${c.row_id}:${c.column_id}`,
      c.value ?? "",
    ]),
  );

  const flat: ReadyMadeStockRow[] = [];
  for (const board of (bds || []) as { id: string; name: string; group_id: string | null }[]) {
    const boardCols = ((allCols || []) as { id: string; board_id: string; name: string }[]).filter(
      (c) => c.board_id === board.id,
    );
    const boardRows = ((allRows || []) as { id: string; board_id: string; label: string }[]).filter(
      (r) => r.board_id === board.id,
    );
    const groupName = board.group_id ? groupMap[board.group_id] || "Ungrouped" : "Ungrouped";

    if (boardCols.length === 0) {
      for (const row of boardRows) {
        flat.push({ group: groupName, sheet: board.name, row: row.label, column: "", value: "" });
      }
    } else {
      for (const row of boardRows) {
        for (const col of boardCols) {
          flat.push({
            group: groupName,
            sheet: board.name,
            row: row.label,
            column: col.name,
            value: String(cellMap[`${row.id}:${col.id}`] ?? ""),
          });
        }
      }
    }
  }
  return flat;
}

export function inventoryStockToCsv(rows: InventoryStockRow[]): string {
  return buildCsv(
    ["Name", "Category", "Type", "Quantity", "Unit", "Min level", "Unit cost", "Supplier", "Supplier link", "Notes"],
    rows.map((r) => [
      r.name,
      r.category,
      r.item_type,
      r.quantity,
      r.unit,
      r.min_level,
      r.unit_cost,
      r.supplier,
      r.supplier_link,
      r.notes,
    ]),
  );
}

export function readyMadeStockToCsv(rows: ReadyMadeStockRow[]): string {
  return buildCsv(
    ["Group", "Sheet", "Row / Item", "Column", "Value"],
    rows.map((r) => [r.group, r.sheet, r.row, r.column, r.value]),
  );
}

export function exportDateTag(): string {
  return new Date().toISOString().slice(0, 10);
}
