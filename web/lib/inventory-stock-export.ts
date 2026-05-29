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

/** One ready-made sheet grid (matches the in-app sheet layout). */
export type ReadyMadeSheetGrid = {
  group: string;
  sheet: string;
  groupSort: number;
  sheetSort: number;
  columns: string[];
  rows: { label: string; values: string[] }[];
};

function escapeCsv(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(escapeCsv).join(",");
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

type GroupRow = { id: string; name: string; sort_order: number };
type BoardRow = { id: string; name: string; group_id: string | null; sort_order: number };
type ColRow = { id: string; board_id: string; header_name: string; sort_order: number };
type RowRow = { id: string; board_id: string; row_label: string; sort_order: number };

function sortByOrder<T extends { sort_order: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.sort_order - b.sort_order);
}

/** Load all ready-made groups, sheets, and cell values for export. */
async function fetchReadyMadeCatalog(supabase: SupabaseClient) {
  const [
    { data: grps, error: gErr },
    { data: bds, error: bErr },
    { data: allCols, error: cErr },
    { data: allRows, error: rErr },
    { data: allCells, error: cellErr },
  ] = await Promise.all([
    supabase.from("ready_made_sheet_groups").select("id,name,sort_order").order("sort_order"),
    supabase.from("ready_made_boards").select("id,name,group_id,sort_order").order("sort_order"),
    supabase.from("ready_made_columns").select("id,board_id,header_name,sort_order").order("sort_order"),
    supabase.from("ready_made_rows").select("id,board_id,row_label,sort_order").order("sort_order"),
    supabase.from("ready_made_cells").select("row_id,column_id,value"),
  ]);
  const err = gErr || bErr || cErr || rErr || cellErr;
  if (err) throw err;

  return {
    groups: (grps || []) as GroupRow[],
    boards: (bds || []) as BoardRow[],
    cols: (allCols || []) as ColRow[],
    rows: (allRows || []) as RowRow[],
    cellMap: Object.fromEntries(
      (allCells || []).map((c: { row_id: string; column_id: string; value: unknown }) => [
        `${c.row_id}:${c.column_id}`,
        String(c.value ?? ""),
      ]),
    ),
  };
}

/** Sheet grids in group → sheet order (same structure as the Ready-made inventory UI). */
export async function fetchReadyMadeStockGrids(supabase: SupabaseClient): Promise<ReadyMadeSheetGrid[]> {
  const { groups, boards, cols, rows, cellMap } = await fetchReadyMadeCatalog(supabase);
  const groupMap = Object.fromEntries(groups.map((g) => [g.id, g]));
  const sortedBoards = sortByOrder(boards);

  const grids: ReadyMadeSheetGrid[] = [];

  for (const board of sortedBoards) {
    const g = board.group_id ? groupMap[board.group_id] : null;
    const groupName = g?.name ?? "Ungrouped";
    const groupSort = g?.sort_order ?? 9999;

    const boardCols = sortByOrder(cols.filter((c) => c.board_id === board.id));
    const boardRows = sortByOrder(rows.filter((r) => r.board_id === board.id));
    const columnHeaders = boardCols.map((c) => c.header_name);

    const gridRows = boardRows.map((row) => ({
      label: row.row_label,
      values: boardCols.map((col) => cellMap[`${row.id}:${col.id}`] ?? ""),
    }));

    grids.push({
      group: groupName,
      sheet: board.name,
      groupSort,
      sheetSort: board.sort_order,
      columns: columnHeaders,
      rows: gridRows,
    });
  }

  grids.sort((a, b) => {
    if (a.groupSort !== b.groupSort) return a.groupSort - b.groupSort;
    if (a.group !== b.group) return a.group.localeCompare(b.group);
    if (a.sheetSort !== b.sheetSort) return a.sheetSort - b.sheetSort;
    return a.sheet.localeCompare(b.sheet);
  });

  return grids;
}

/** Flat rows (legacy); prefer grids export for ready-made. */
export async function fetchReadyMadeStockFlat(
  supabase: SupabaseClient,
): Promise<{ group: string; sheet: string; row: string; column: string; value: string }[]> {
  const grids = await fetchReadyMadeStockGrids(supabase);
  const flat: { group: string; sheet: string; row: string; column: string; value: string }[] = [];
  for (const g of grids) {
    if (g.columns.length === 0) {
      for (const row of g.rows) {
        flat.push({ group: g.group, sheet: g.sheet, row: row.label, column: "", value: "" });
      }
      continue;
    }
    for (const row of g.rows) {
      g.columns.forEach((col, i) => {
        flat.push({
          group: g.group,
          sheet: g.sheet,
          row: row.label,
          column: col,
          value: row.values[i] ?? "",
        });
      });
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

/**
 * CSV with one block per sheet: group name, sheet name, then a grid (row labels × column headers).
 * Opens cleanly in Excel for stock counts per size/column.
 */
export function readyMadeStockGridsToCsv(sheets: ReadyMadeSheetGrid[]): string {
  const lines: string[] = [];

  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    if (i > 0) lines.push("");
    lines.push(csvRow(["Sheet group", s.group]));
    lines.push(csvRow(["Sheet", s.sheet]));
    if (s.columns.length > 0) {
      lines.push(csvRow(["Row / Item", ...s.columns]));
      for (const row of s.rows) {
        lines.push(csvRow([row.label, ...row.values]));
      }
    } else if (s.rows.length > 0) {
      lines.push(csvRow(["Row / Item", "Stock"]));
      for (const row of s.rows) {
        const v = row.values[0] ?? "";
        lines.push(csvRow([row.label, v]));
      }
    } else {
      lines.push(csvRow(["(empty sheet — no rows yet)"]));
    }
  }

  if (lines.length === 0) {
    lines.push(csvRow(["No ready-made sheets found"]));
  }

  return lines.join("\n");
}

/** @deprecated Use readyMadeStockGridsToCsv for sheet layout. */
export function readyMadeStockToCsv(
  rows: { group: string; sheet: string; row: string; column: string; value: string }[],
): string {
  return buildCsv(
    ["Group", "Sheet", "Row / Item", "Column", "Stock"],
    rows.map((r) => [r.group, r.sheet, r.row, r.column, r.value]),
  );
}

export function exportDateTag(): string {
  return new Date().toISOString().slice(0, 10);
}

export function readyMadeExportFilename(tag = exportDateTag()) {
  return `ready_made_inventory_${tag}`;
}

export function inventoryExportFilename(tag = exportDateTag()) {
  return `inventory_stock_${tag}`;
}
