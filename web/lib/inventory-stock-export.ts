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

export function downloadPdfBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type JsPDFDoc = import("jspdf").jsPDF;
type AutoTableFn = typeof import("jspdf-autotable").default;

const PDF_MARGIN = 8;

function pdfContentWidth(doc: JsPDFDoc): number {
  return doc.internal.pageSize.getWidth() - 2 * PDF_MARGIN;
}

function pdfTableEndY(doc: JsPDFDoc): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return last?.finalY ?? 18;
}

/** Current stock PDF: all inventory items, optionally ready-made sheets. */
export async function buildInventoryStockPdf(opts: {
  inventory?: InventoryStockRow[];
  readyMade?: ReadyMadeSheetGrid[];
}): Promise<Blob> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default as AutoTableFn;
  const inventory = opts.inventory ?? [];
  const readyMade = opts.readyMade ?? [];
  const includeInventory = opts.inventory != null;
  const includeReadyMade = opts.readyMade != null;

  const landscape = includeInventory;
  const doc = new jsPDF({
    orientation: landscape ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const pageW = pdfContentWidth(doc);
  const generated = new Date().toLocaleString();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("PrintShop — All stock", PDF_MARGIN, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Generated ${generated} · Current on-hand quantities`, PDF_MARGIN, 16);

  let y = 20;
  const tableOpts = {
    styles: { fontSize: 7, cellPadding: 1.2, overflow: "linebreak" as const },
    headStyles: { fillColor: [30, 30, 45] as [number, number, number], textColor: 255, fontSize: 7, fontStyle: "bold" as const },
    margin: { left: PDF_MARGIN, right: PDF_MARGIN },
  };

  if (includeInventory) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Stock inventory (${inventory.length} item${inventory.length === 1 ? "" : "s"})`, PDF_MARGIN, y);
    y += 3;
    const nameW = 48;
    const catW = 28;
    const typeW = 22;
    const qtyW = 16;
    const unitW = 16;
    const minW = 14;
    const costW = 18;
    const supW = 32;
    const notesW = pageW - nameW - catW - typeW - qtyW - unitW - minW - costW - supW;
    autoTable(doc, {
      ...tableOpts,
      startY: y,
      tableWidth: pageW,
      head: [["Name", "Category", "Type", "Qty", "Unit", "Min", "Cost", "Supplier", "Notes"]],
      body: inventory.map((r) => [
        r.name.trim() || "—",
        r.category.trim() || "—",
        r.item_type.trim() || "—",
        String(r.quantity),
        r.unit || "—",
        r.min_level || "—",
        r.unit_cost || "—",
        r.supplier.trim() || "—",
        r.notes.trim() || "—",
      ]),
      columnStyles: {
        0: { cellWidth: nameW },
        1: { cellWidth: catW },
        2: { cellWidth: typeW },
        3: { cellWidth: qtyW, halign: "right" },
        4: { cellWidth: unitW },
        5: { cellWidth: minW, halign: "right" },
        6: { cellWidth: costW, halign: "right" },
        7: { cellWidth: supW },
        8: { cellWidth: notesW },
      },
    });
    y = pdfTableEndY(doc) + 8;
  }

  if (includeReadyMade) {
    if (includeInventory) {
      doc.addPage();
      y = PDF_MARGIN + 6;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Ready-made inventory (${readyMade.length} sheet${readyMade.length === 1 ? "" : "s"})`, PDF_MARGIN, y);
    y += 4;

    if (readyMade.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.text("No ready-made sheets.", PDF_MARGIN, y);
    }

    for (const sheet of readyMade) {
      const pageH = doc.internal.pageSize.getHeight();
      if (y > pageH - 28) {
        doc.addPage();
        y = PDF_MARGIN + 6;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(`${sheet.group} / ${sheet.sheet}`, PDF_MARGIN, y);
      y += 3.5;

      if (sheet.columns.length === 0 && sheet.rows.length === 0) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7);
        doc.text("(empty)", PDF_MARGIN, y);
        y += 6;
        continue;
      }

      const headers = ["Item", ...sheet.columns.map((c) => c.trim() || "—")];
      const body = sheet.rows.map((row) => [
        row.label.trim() || "—",
        ...row.values.map((v) => String(v ?? "").trim() || "—"),
      ]);
      const itemColW = Math.min(40, pageW * 0.22);
      const dataCols = sheet.columns.length;
      const dataColW = dataCols > 0 ? (pageW - itemColW) / dataCols : pageW - itemColW;
      const colStyles: Record<number, { cellWidth: number; halign?: "left" | "center" }> = {
        0: { cellWidth: itemColW },
      };
      for (let ci = 0; ci < dataCols; ci++) {
        colStyles[ci + 1] = { cellWidth: dataColW, halign: "center" };
      }

      autoTable(doc, {
        ...tableOpts,
        startY: y,
        tableWidth: pageW,
        head: [headers],
        body,
        styles: { ...tableOpts.styles, fontSize: 6.5, cellPadding: 1 },
        columnStyles: colStyles,
      });
      y = pdfTableEndY(doc) + 6;
    }
  }

  return doc.output("blob");
}
