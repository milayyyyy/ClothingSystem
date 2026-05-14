"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Trash2 } from "lucide-react";
import { computeReadyMadeLowStockRows } from "@/lib/ready-made-low-stock";
import { fetchReadyMadeLowStockRowsForBoard } from "@/lib/ready-made-board-low-stock-fetch";
import { cn } from "@/lib/utils";

type Group = { id: string; name: string; sort_order: number };
type Board = {
  id: string;
  name: string;
  sort_order: number;
  group_id: string | null;
  /** When false, low-stock card / filter / row tint are off for this sheet. */
  low_stock_minimum_enabled?: boolean | null;
  /** Rows are low stock when any column’s numeric cell is strictly below this value (all columns scanned). */
  low_stock_sheet_minimum?: number | null;
};
type Col = { id: string; board_id: string; header_name: string; sort_order: number };
type Row = { id: string; board_id: string; row_label: string; sort_order: number };
type Cell = { id: string; row_id: string; column_id: string; value: string };

function sortByOrder<T extends { sort_order: number }>(arr: T[]) {
  return [...arr].sort((a, b) => a.sort_order - b.sort_order);
}

export function ReadyMadeInventoryClient({ canEdit = true }: { canEdit?: boolean }) {
  const supabase = createClient();
  const [groups, setGroups] = useState<Group[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cols, setCols] = useState<Col[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [cells, setCells] = useState<Cell[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newBoardOpen, setNewBoardOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardGroupId, setNewBoardGroupId] = useState<string>("");
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [sheetSearch, setSheetSearch] = useState("");
  const [gridSearch, setGridSearch] = useState("");
  /** Active sheet only: show rows flagged low stock (any column below minimum). */
  const [lowStockOnly, setLowStockOnly] = useState(false);
  /** Increment to rescan every sheet’s low stock from the server (not only the open sheet). */
  const [lowStockScanKey, setLowStockScanKey] = useState(0);
  const [allSheetsLowStockTotal, setAllSheetsLowStockTotal] = useState(0);
  const [allSheetsLowStockLoading, setAllSheetsLowStockLoading] = useState(false);
  const [boardLowStockCounts, setBoardLowStockCounts] = useState<Record<string, number>>({});

  const cellByPair = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cells) m.set(`${c.row_id}:${c.column_id}`, c.value);
    return m;
  }, [cells]);

  const refreshCatalog = useCallback(async () => {
    const [{ data: gdata, error: ge }, { data: bdata, error: be }] = await Promise.all([
      supabase.from("ready_made_sheet_groups").select("id,name,sort_order").order("sort_order"),
      supabase
        .from("ready_made_boards")
        .select("id,name,sort_order,group_id,low_stock_minimum_enabled,low_stock_sheet_minimum")
        .order("sort_order"),
    ]);
    if (ge) console.error(ge);
    if (be) console.error(be);
    setGroups(((gdata as Group[]) || []).filter(Boolean));
    const bl = (bdata as Board[]) || [];
    setBoards(bl);
    return bl;
  }, [supabase]);

  const loadGrid = useCallback(async (boardId: string) => {
    const { data: c } = await supabase.from("ready_made_columns").select("*").eq("board_id", boardId).order("sort_order");
    const { data: r } = await supabase.from("ready_made_rows").select("*").eq("board_id", boardId).order("sort_order");
    const colList = sortByOrder((c as Col[]) || []);
    const rowList = sortByOrder((r as Row[]) || []);
    setCols(colList);
    setRows(rowList);
    const rowIds = rowList.map((x) => x.id);
    if (!rowIds.length) {
      setCells([]);
      setLowStockScanKey((k) => k + 1);
      return;
    }
    const { data: cellsData } = await supabase
      .from("ready_made_cells")
      .select("id,row_id,column_id,value")
      .in("row_id", rowIds);
    setCells((cellsData as Cell[]) || []);
    setLowStockScanKey((k) => k + 1);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = (await refreshCatalog()) ?? [];
      if (cancelled) return;
      setActiveId((cur) => {
        if (!list.length) return null;
        if (cur && list.some((b) => b.id === cur)) return cur;
        return list[0]!.id;
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshCatalog]);

  useEffect(() => {
    if (!activeId) {
      setCols([]);
      setRows([]);
      setCells([]);
      setLowStockScanKey((k) => k + 1);
      return;
    }
    setGridSearch("");
    setLowStockOnly(false);
    void loadGrid(activeId);
  }, [activeId, loadGrid]);

  function boardsInGroup(groupId: string | null) {
    return sortByOrder(boards.filter((b) => (b.group_id ?? null) === (groupId ?? null)));
  }

  function openNewSheet(groupId?: string) {
    const gid = groupId ?? groups[0]?.id ?? "";
    setNewBoardGroupId(gid);
    setNewBoardName("");
    setNewBoardOpen(true);
  }

  async function createGroup() {
    const name = newGroupName.trim() || "New group";
    setSaving(true);
    try {
      const maxSo = groups.reduce((m, g) => Math.max(m, g.sort_order), -1);
      const { error } = await supabase.from("ready_made_sheet_groups").insert({ name, sort_order: maxSo + 1 });
      if (error) throw error;
      setNewGroupName("");
      setNewGroupOpen(false);
      await refreshCatalog();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Could not create group");
    } finally {
      setSaving(false);
    }
  }

  async function renameGroup(id: string, name: string) {
    await supabase.from("ready_made_sheet_groups").update({ name: name.trim() || "Group" }).eq("id", id);
    await refreshCatalog();
  }

  async function deleteGroup(id: string) {
    if (!confirm("Delete this group? Sheets in it will become ungrouped (you can assign them again).")) return;
    await supabase.from("ready_made_sheet_groups").delete().eq("id", id);
    await refreshCatalog();
  }

  async function createBoard() {
    const name = newBoardName.trim() || "Untitled sheet";
    const gid = newBoardGroupId || groups[0]?.id || null;
    if (!gid) {
      alert("Create a group first (run DB migration 022 if you see this unexpectedly).");
      return;
    }
    setSaving(true);
    try {
      const inGroup = boards.filter((b) => b.group_id === gid);
      const maxSo = inGroup.reduce((m, b) => Math.max(m, b.sort_order), -1);
      const { data: b, error: be } = await supabase
        .from("ready_made_boards")
        .insert({ name, sort_order: maxSo + 1, group_id: gid, low_stock_minimum_enabled: true })
        .select("id")
        .single();
      if (be || !b) throw be;
      const bid = (b as { id: string }).id;
      const { data: insertedCols, error: ce } = await supabase
        .from("ready_made_columns")
        .insert([
          { board_id: bid, header_name: "Column A", sort_order: 0 },
          { board_id: bid, header_name: "Column B", sort_order: 1 },
        ])
        .select();
      if (ce) throw ce;
      const { data: insertedRows, error: re } = await supabase
        .from("ready_made_rows")
        .insert([
          { board_id: bid, row_label: "Row 1", sort_order: 0 },
          { board_id: bid, row_label: "Row 2", sort_order: 1 },
        ])
        .select();
      if (re) throw re;
      const colList = (insertedCols as Col[]) || [];
      const rowList = (insertedRows as Row[]) || [];
      const cellPayload = rowList.flatMap((row) =>
        colList.map((col) => ({ row_id: row.id, column_id: col.id, value: "" })),
      );
      if (cellPayload.length) {
        const { error: celle } = await supabase.from("ready_made_cells").insert(cellPayload);
        if (celle) throw celle;
      }
      setNewBoardName("");
      setNewBoardOpen(false);
      await refreshCatalog();
      setActiveId(bid);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Could not create sheet");
    } finally {
      setSaving(false);
    }
  }

  async function deleteBoard(id: string) {
    if (!confirm("Delete this sheet and all its rows and columns?")) return;
    await supabase.from("ready_made_boards").delete().eq("id", id);
    if (activeId === id) setActiveId(null);
    const list = (await refreshCatalog()) ?? [];
    if (list[0]) setActiveId(list[0].id);
  }

  async function renameBoard(id: string, name: string) {
    await supabase.from("ready_made_boards").update({ name: name.trim() || "Untitled sheet" }).eq("id", id);
    await refreshCatalog();
  }

  async function setBoardGroup(boardId: string, groupId: string | null) {
    await supabase.from("ready_made_boards").update({ group_id: groupId }).eq("id", boardId);
    await refreshCatalog();
  }

  async function setBoardLowStockMinimum(boardId: string, enabled: boolean) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ready_made_boards")
        .update({ low_stock_minimum_enabled: enabled })
        .eq("id", boardId);
      if (error) throw error;
      setBoards((prev) =>
        prev.map((b) => (b.id === boardId ? { ...b, low_stock_minimum_enabled: enabled } : b)),
      );
      setLowStockOnly(false);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Could not update sheet setting");
    } finally {
      setSaving(false);
    }
  }

  async function setBoardSheetMinimum(boardId: string, raw: string) {
    const t = raw.trim();
    let value: number | null = null;
    if (t !== "") {
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) {
        alert("Use a number ≥ 0, or leave empty to clear the sheet minimum.");
        await refreshCatalog();
        return;
      }
      value = Math.trunc(n);
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ready_made_boards")
        .update({ low_stock_sheet_minimum: value })
        .eq("id", boardId);
      if (error) throw error;
      setBoards((prev) =>
        prev.map((b) => (b.id === boardId ? { ...b, low_stock_sheet_minimum: value } : b)),
      );
      setLowStockOnly(false);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Could not update sheet minimum");
      await refreshCatalog();
    } finally {
      setSaving(false);
    }
  }

  async function updateColumnHeader(col: Col, header_name: string) {
    await supabase.from("ready_made_columns").update({ header_name }).eq("id", col.id);
    setCols((prev) => prev.map((c) => (c.id === col.id ? { ...c, header_name } : c)));
  }

  async function updateRowLabel(row: Row, row_label: string) {
    await supabase.from("ready_made_rows").update({ row_label }).eq("id", row.id);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, row_label } : r)));
  }

  async function setCellValue(rowId: string, columnId: string, value: string) {
    const { data: existing } = await supabase
      .from("ready_made_cells")
      .select("id")
      .eq("row_id", rowId)
      .eq("column_id", columnId)
      .maybeSingle();
    if (existing?.id) {
      await supabase.from("ready_made_cells").update({ value }).eq("id", (existing as { id: string }).id);
      setCells((prev) =>
        prev.map((c) => (c.row_id === rowId && c.column_id === columnId ? { ...c, value } : c)),
      );
      setLowStockScanKey((k) => k + 1);
    } else {
      const { data: inserted } = await supabase
        .from("ready_made_cells")
        .insert({ row_id: rowId, column_id: columnId, value })
        .select("id,row_id,column_id,value")
        .single();
      if (inserted) setCells((prev) => [...prev.filter((c) => !(c.row_id === rowId && c.column_id === columnId)), inserted as Cell]);
      setLowStockScanKey((k) => k + 1);
    }
  }

  async function addColumn() {
    if (!activeId) return;
    const nextSo = cols.reduce((m, c) => Math.max(m, c.sort_order), -1) + 1;
    const label = `Column ${cols.length + 1}`;
    const { data: col, error } = await supabase
      .from("ready_made_columns")
      .insert({ board_id: activeId, header_name: label, sort_order: nextSo })
      .select()
      .single();
    if (error || !col) return;
    const newCol = col as Col;
    const inserts = rows.map((r) => ({ row_id: r.id, column_id: newCol.id, value: "" }));
    if (inserts.length) await supabase.from("ready_made_cells").insert(inserts);
    await loadGrid(activeId);
  }

  async function removeColumn(colId: string) {
    if (cols.length <= 1) {
      alert("Keep at least one column.");
      return;
    }
    await supabase.from("ready_made_columns").delete().eq("id", colId);
    if (activeId) await loadGrid(activeId);
  }

  async function addRow() {
    if (!activeId) return;
    const nextSo = rows.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
    const label = `Row ${rows.length + 1}`;
    const { data: row, error } = await supabase
      .from("ready_made_rows")
      .insert({ board_id: activeId, row_label: label, sort_order: nextSo })
      .select()
      .single();
    if (error || !row) return;
    const newRow = row as Row;
    const inserts = cols.map((c) => ({ row_id: newRow.id, column_id: c.id, value: "" }));
    if (inserts.length) await supabase.from("ready_made_cells").insert(inserts);
    await loadGrid(activeId);
  }

  async function removeRow(rowId: string) {
    if (rows.length <= 1) {
      alert("Keep at least one row.");
      return;
    }
    await supabase.from("ready_made_rows").delete().eq("id", rowId);
    if (activeId) await loadGrid(activeId);
  }

  const activeBoard = boards.find((b) => b.id === activeId);
  const lowStockMinimumActive = activeBoard != null && activeBoard.low_stock_minimum_enabled !== false;
  const sheetMinimumResolved = useMemo(() => {
    const v = activeBoard?.low_stock_sheet_minimum;
    if (v == null || !Number.isFinite(Number(v))) return null;
    return Math.trunc(Number(v));
  }, [activeBoard?.low_stock_sheet_minimum]);
  const ungroupedBoards = boardsInGroup(null);

  const sheetQ = sheetSearch.trim().toLowerCase();

  function filterBoardsInGroup(groupId: string | null, group: Group | null) {
    const list = boardsInGroup(groupId);
    if (!sheetQ) return list;
    if (group && group.name.toLowerCase().includes(sheetQ)) return list;
    return list.filter((b) => (b.name || "").toLowerCase().includes(sheetQ));
  }

  const colsSorted = useMemo(() => sortByOrder(cols), [cols]);

  const lowStockRowsActive = useMemo(() => {
    if (!activeBoard || !lowStockMinimumActive) return [];
    return computeReadyMadeLowStockRows(rows, cols, cellByPair, { sheetMinimum: sheetMinimumResolved });
  }, [activeBoard, lowStockMinimumActive, rows, cols, cellByPair, sheetMinimumResolved]);

  const lowStockRowIdSet = useMemo(() => new Set(lowStockRowsActive.map((r) => r.rowId)), [lowStockRowsActive]);

  const displayRows = useMemo(() => {
    let list = sortByOrder(rows);
    const q = gridSearch.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      list = list.filter((r) => {
        const parts: string[] = [r.row_label.toLowerCase()];
        for (const c of colsSorted) {
          parts.push(c.header_name.toLowerCase());
          parts.push((cellByPair.get(`${r.id}:${c.id}`) || "").toLowerCase());
        }
        const blob = parts.join("\n");
        return tokens.every((t) => blob.includes(t));
      });
    }
    if (lowStockOnly) {
      list = lowStockRowIdSet.size > 0 ? list.filter((r) => lowStockRowIdSet.has(r.id)) : [];
    }
    return list;
  }, [rows, colsSorted, cellByPair, gridSearch, lowStockOnly, lowStockRowIdSet]);

  const lowStockCount = lowStockRowsActive.length;

  useEffect(() => {
    let cancelled = false;
    if (!boards.length) {
      setBoardLowStockCounts({});
      setAllSheetsLowStockTotal(0);
      setAllSheetsLowStockLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setAllSheetsLowStockLoading(true);
    const tid = window.setTimeout(async () => {
      const eligible = boards.filter(
        (b) =>
          b.low_stock_minimum_enabled !== false &&
          b.low_stock_sheet_minimum != null &&
          Number.isFinite(Number(b.low_stock_sheet_minimum)),
      );
      const counts: Record<string, number> = {};
      let total = 0;
      try {
        await Promise.all(
          eligible.map(async (b) => {
            const list = await fetchReadyMadeLowStockRowsForBoard(supabase, b);
            if (cancelled) return;
            counts[b.id] = list.length;
            total += list.length;
          }),
        );
      } catch (e) {
        console.error(e);
      }
      if (!cancelled) {
        setBoardLowStockCounts(counts);
        setAllSheetsLowStockTotal(total);
        setAllSheetsLowStockLoading(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [boards, lowStockScanKey, supabase]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-muted-foreground">
            Organize sheets into groups on the left, then open a sheet to edit the grid (row names, column headers, cells).{" "}
            <Link href="/admin/inventory" className="text-primary underline-offset-4 hover:underline">
              ← Stock inventory
            </Link>
          </p>
          <div className="flex max-w-md flex-col gap-1">
            <Label htmlFor="rm-sheet-search" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Search sheets
            </Label>
            <Input
              id="rm-sheet-search"
              type="search"
              placeholder="Sheet or group name…"
              value={sheetSearch}
              onChange={(e) => setSheetSearch(e.target.value)}
              className="h-9"
              autoComplete="off"
            />
          </div>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setNewGroupOpen(true)} disabled={saving}>
              <Plus className="mr-1 h-4 w-4" /> New group
            </Button>
            <Button type="button" size="sm" onClick={() => openNewSheet()} disabled={saving || !groups.length}>
              <Plus className="mr-1 h-4 w-4" /> New sheet
            </Button>
          </div>
        )}
      </div>

      {boards.length > 0 && (
        <div className={cn("grid gap-4", activeBoard ? "max-w-xl sm:grid-cols-2" : "max-w-md")}>
          {activeBoard && (
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Rows on this sheet</div>
                <div className="text-2xl font-semibold">{rows.length}</div>
              </CardContent>
            </Card>
          )}
          <Card
            role="button"
            tabIndex={lowStockMinimumActive && lowStockCount > 0 ? 0 : -1}
            aria-pressed={lowStockOnly}
            aria-disabled={!lowStockMinimumActive || lowStockCount === 0}
            aria-label={
              !lowStockMinimumActive
                ? "Low stock minimum is off for this sheet"
                : lowStockCount === 0
                  ? allSheetsLowStockTotal > 0
                    ? `No low stock rows on this sheet; ${allSheetsLowStockTotal} on other sheets`
                    : "No low stock rows on any monitored sheet"
                  : lowStockOnly
                    ? "Low stock filter is on. Click to show all rows again."
                    : `Show only low stock rows on this sheet (${lowStockCount})`
            }
            className={cn(
              "outline-none transition-colors",
              lowStockMinimumActive &&
                lowStockCount > 0 &&
                "cursor-pointer hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              lowStockOnly && lowStockMinimumActive && lowStockCount > 0 && "border-primary bg-primary/5 ring-2 ring-primary/40",
              !lowStockMinimumActive && "cursor-not-allowed opacity-70",
              lowStockMinimumActive && lowStockCount === 0 && "cursor-default",
            )}
            onClick={() => {
              if (!lowStockMinimumActive || lowStockCount === 0) return;
              setLowStockOnly((v) => !v);
            }}
            onKeyDown={(e) => {
              if (!lowStockMinimumActive || lowStockCount === 0) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setLowStockOnly((v) => !v);
              }
            }}
          >
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Low stock (all monitored sheets)</div>
              <div className="text-2xl font-semibold text-destructive">
                {allSheetsLowStockLoading ? "…" : allSheetsLowStockTotal}
              </div>
              {activeBoard && lowStockMinimumActive && (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  This sheet: <span className="font-medium text-foreground">{lowStockCount}</span>
                </p>
              )}
              {lowStockCount > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {lowStockOnly
                    ? "Filtered — click again to clear (this sheet only)"
                    : "Click to list low stock rows on this sheet only (any column below minimum)"}
                </p>
              )}
              {lowStockMinimumActive && lowStockCount === 0 && sheetMinimumResolved != null && cols.length > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  No low-stock rows on this sheet (no numeric cell strictly below your minimum in any column), or clear the filter
                  to see all rows.
                </p>
              )}
              {lowStockMinimumActive && lowStockCount === 0 && sheetMinimumResolved == null && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Set <span className="font-medium text-foreground">Minimum quantity</span> below — all columns are checked; any
                  numeric cell strictly below that value counts as low stock for its row.
                </p>
              )}
              {lowStockMinimumActive && lowStockCount === 0 && sheetMinimumResolved != null && cols.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">Add at least one column to evaluate cells for low stock.</p>
              )}
              {!lowStockMinimumActive && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Turn on <span className="font-medium text-foreground">Low stock minimum</span> for this sheet (above the grid) to
                  filter rows here. Totals above still include every sheet with low stock on and a minimum set.
                </p>
              )}
              {lowStockMinimumActive &&
                lowStockCount === 0 &&
                allSheetsLowStockTotal > 0 &&
                !allSheetsLowStockLoading && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Other sheets have low stock — pick a sheet in the sidebar to edit those rows.
                  </p>
                )}
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="w-full shrink-0 space-y-3 lg:w-72">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sheet groups</h2>
          {sortByOrder(groups).map((g) => {
            const boardsFiltered = filterBoardsInGroup(g.id, g);
            if (sheetQ && boardsFiltered.length === 0 && !g.name.toLowerCase().includes(sheetQ)) return null;
            return (
            <div key={g.id} className="rounded-lg border border-border bg-card/40 p-3 shadow-sm">
              <div className="mb-2 flex items-start gap-2">
                <Input
                  className="h-8 flex-1 text-sm font-medium"
                  key={`gname:${g.id}:${g.name}`}
                  defaultValue={g.name}
                  onBlur={(e) => {
                    if (e.target.value !== g.name) void renameGroup(g.id, e.target.value);
                  }}
                  aria-label="Group name"
                />
                {canEdit && (
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => deleteGroup(g.id)} aria-label="Delete group">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {boardsFiltered.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    title={
                      b.low_stock_minimum_enabled === false
                        ? "Low stock minimum is off for this sheet"
                        : undefined
                    }
                    onClick={() => setActiveId(b.id)}
                    className={`rounded-md border px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                      b.id === activeId
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-transparent bg-muted/30 hover:bg-muted/60"
                    }`}
                  >
                    <div className="flex w-full items-start justify-between gap-1.5">
                      <span className="min-w-0 flex-1">{b.name || "Untitled"}</span>
                      {(boardLowStockCounts[b.id] ?? 0) > 0 && (
                        <span
                          className="shrink-0 rounded bg-destructive/15 px-1 py-0.5 text-[10px] font-semibold tabular-nums text-destructive"
                          title="Low stock rows on this sheet"
                        >
                          {boardLowStockCounts[b.id]}
                        </span>
                      )}
                    </div>
                    {b.low_stock_minimum_enabled === false && (
                      <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">Min off</span>
                    )}
                  </button>
                ))}
                {boardsInGroup(g.id).length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No sheets — add one below.</p>
                )}
                {boardsInGroup(g.id).length > 0 && boardsFiltered.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No sheets match search.</p>
                )}
              </div>
              {canEdit && (
                <Button type="button" variant="secondary" size="sm" className="mt-2 h-7 w-full text-[11px]" onClick={() => openNewSheet(g.id)}>
                  <Plus className="mr-1 h-3 w-3" /> Sheet in this group
                </Button>
              )}
            </div>
            );
          })}
          {ungroupedBoards.length > 0 && (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ungrouped</div>
              <div className="flex flex-col gap-1.5">
                {(sheetQ ? filterBoardsInGroup(null, null) : ungroupedBoards).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    title={
                      b.low_stock_minimum_enabled === false
                        ? "Low stock minimum is off for this sheet"
                        : undefined
                    }
                    onClick={() => setActiveId(b.id)}
                    className={`rounded-md border px-2 py-1.5 text-left text-xs font-medium transition-colors ${
                      b.id === activeId
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-transparent bg-muted/30 hover:bg-muted/60"
                    }`}
                  >
                    <div className="flex w-full items-start justify-between gap-1.5">
                      <span className="min-w-0 flex-1">{b.name || "Untitled"}</span>
                      {(boardLowStockCounts[b.id] ?? 0) > 0 && (
                        <span
                          className="shrink-0 rounded bg-destructive/15 px-1 py-0.5 text-[10px] font-semibold tabular-nums text-destructive"
                          title="Low stock rows on this sheet"
                        >
                          {boardLowStockCounts[b.id]}
                        </span>
                      )}
                    </div>
                    {b.low_stock_minimum_enabled === false && (
                      <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">Min off</span>
                    )}
                  </button>
                ))}
                {sheetQ && filterBoardsInGroup(null, null).length === 0 && (
                  <p className="text-[11px] text-muted-foreground">No ungrouped sheets match.</p>
                )}
              </div>
            </div>
          )}
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No groups yet. Add one, or apply migration <code className="rounded bg-muted px-1">022_ready_made_sheet_groups.sql</code> if the app errors loading data.
            </p>
          )}
        </aside>

        <div className="min-w-0 flex-1 space-y-4">
          {activeBoard && (
            <Card>
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-3">
                  <Label className="sr-only" htmlFor="board-name">
                    Sheet name
                  </Label>
                  <Input
                    id="board-name"
                    className="max-w-md font-medium"
                    key={`${activeBoard.id}:${activeBoard.name}`}
                    defaultValue={activeBoard.name}
                    onBlur={(e) => {
                      if (e.target.value !== activeBoard.name) void renameBoard(activeBoard.id, e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Label htmlFor="board-group" className="text-xs text-muted-foreground whitespace-nowrap">
                      Group
                    </Label>
                    <select
                      id="board-group"
                      className="h-9 min-w-[10rem] rounded-md border border-input bg-background px-2 text-xs shadow-sm"
                      value={activeBoard.group_id ?? "__none__"}
                      onChange={(e) => {
                        const v = e.target.value;
                        void setBoardGroup(activeBoard.id, v === "__none__" ? null : v);
                      }}
                    >
                      <option value="__none__">Ungrouped</option>
                      {sortByOrder(groups).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {canEdit && (
                    <Button type="button" variant="outline" size="sm" onClick={() => deleteBoard(activeBoard.id)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete sheet
                    </Button>
                  )}
                </div>

                <div className="space-y-3 rounded-md border border-border/60 bg-muted/15 px-3 py-2.5 text-xs">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
                      checked={activeBoard.low_stock_minimum_enabled !== false}
                      onChange={(e) => void setBoardLowStockMinimum(activeBoard.id, e.target.checked)}
                      disabled={saving}
                      aria-label="Low stock minimum for this sheet"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">Low stock minimum</span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        Turn on to enable the low-stock count, row tint, and filter. Column names do not matter: set a minimum
                        below, and every column’s numeric cells are checked — if any value in a row is{" "}
                        <span className="font-medium text-foreground">strictly below</span> that minimum, the row counts as low
                        stock (including on the dashboard Low stock card).
                      </span>
                    </span>
                  </label>
                  <div className="flex flex-col gap-2 border-t border-border/50 pt-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
                    <div className="flex w-full max-w-[11rem] flex-col gap-1">
                      <Label htmlFor="board-sheet-min" className="text-[11px] text-muted-foreground">
                        Minimum quantity
                      </Label>
                      <Input
                        id="board-sheet-min"
                        type="number"
                        min={0}
                        step={1}
                        disabled={saving}
                        className="h-9"
                        key={`${activeBoard.id}:lsm:${activeBoard.low_stock_sheet_minimum ?? ""}`}
                        defaultValue={activeBoard.low_stock_sheet_minimum ?? ""}
                        placeholder="e.g. 10"
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          const cur =
                            activeBoard.low_stock_sheet_minimum == null
                              ? ""
                              : String(activeBoard.low_stock_sheet_minimum);
                          if (next === cur) return;
                          void setBoardSheetMinimum(activeBoard.id, e.target.value);
                        }}
                        aria-label="Minimum quantity — all columns compared to this value"
                      />
                    </div>
                    <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
                      Every column is scanned left to right. If any cell parses as a number and is{" "}
                      <span className="font-medium text-foreground">strictly below</span> this minimum, the whole row is low
                      stock (the count uses the lowest such value in that row). Clear the field to turn off numeric checks.
                    </p>
                  </div>
                </div>

                <div className="flex max-w-md flex-col gap-1">
                  <Label htmlFor="rm-grid-search" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Search this sheet
                  </Label>
                  <Input
                    id="rm-grid-search"
                    type="search"
                    placeholder="Row label, column header, or cell text…"
                    value={gridSearch}
                    onChange={(e) => setGridSearch(e.target.value)}
                    className="h-9 text-sm"
                    autoComplete="off"
                  />
                </div>

                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-max min-w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-muted/80">
                        <th className="sticky left-0 z-[1] min-w-[7rem] border-b border-r bg-muted px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Row
                        </th>
                        {colsSorted.map((c) => (
                          <th key={c.id} className="group min-w-[6rem] border-b border-r px-0 py-0">
                            <div className="flex items-center gap-0.5">
                              <input
                                className="min-w-0 flex-1 border-0 bg-transparent px-1 py-1.5 text-[11px] font-medium outline-none focus:bg-background/80"
                                key={`h:${c.id}:${c.header_name}`}
                                defaultValue={c.header_name}
                                onBlur={(e) => {
                                  if (e.target.value !== c.header_name) void updateColumnHeader(c, e.target.value);
                                }}
                                aria-label="Column header"
                              />
                              <button
                                type="button"
                                className={`shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 ${!canEdit ? "hidden" : ""}`}
                                onClick={() => removeColumn(c.id)}
                                aria-label="Remove column"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </th>
                        ))}
                        {canEdit && (
                          <th className="border-b bg-muted/40 px-1 py-1 align-middle">
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => addColumn()}>
                              + Column
                            </Button>
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length > 0 && gridSearch.trim() && displayRows.length === 0 && !lowStockOnly && (
                        <tr>
                          <td
                            colSpan={colsSorted.length + 2}
                            className="p-6 text-center text-sm text-muted-foreground"
                          >
                            No rows match this sheet search.
                          </td>
                        </tr>
                      )}
                      {rows.length > 0 && lowStockOnly && displayRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={colsSorted.length + 2}
                            className="p-6 text-center text-sm text-muted-foreground"
                          >
                            {lowStockCount === 0
                              ? "No low-stock rows — set a minimum above and ensure some cell is strictly below it, or clear the filter."
                              : "No rows match both this search and low stock. Clear search or turn off low stock filter."}
                          </td>
                        </tr>
                      )}
                      {displayRows.map((r) => (
                        <tr
                          key={r.id}
                          className={
                            "border-b border-border/60 hover:bg-muted/15 " +
                            (lowStockMinimumActive && lowStockRowIdSet.has(r.id)
                              ? "bg-amber-500/10 dark:bg-amber-950/35"
                              : "")
                          }
                        >
                          <td className="sticky left-0 z-[1] border-r bg-card px-1 py-0">
                            <input
                              className="w-full min-w-[6rem] border-0 bg-transparent px-1 py-1.5 text-[11px] outline-none focus:bg-primary/5"
                              key={`r:${r.id}:${r.row_label}`}
                              defaultValue={r.row_label}
                              onBlur={(e) => {
                                if (e.target.value !== r.row_label) void updateRowLabel(r, e.target.value);
                              }}
                              aria-label="Row name"
                            />
                          </td>
                          {colsSorted.map((c) => (
                            <td key={c.id} className="border-r p-0">
                              <input
                                className="h-8 w-full min-w-[5rem] border-0 bg-transparent px-1 text-[11px] outline-none focus:bg-primary/5"
                                key={`c:${r.id}:${c.id}:${cellByPair.get(`${r.id}:${c.id}`) ?? ""}`}
                                defaultValue={cellByPair.get(`${r.id}:${c.id}`) ?? ""}
                                onBlur={(e) => {
                                  const v = e.target.value;
                                  const prev = cellByPair.get(`${r.id}:${c.id}`) ?? "";
                                  if (v !== prev) void setCellValue(r.id, c.id, v);
                                }}
                              />
                            </td>
                          ))}
                          <td className="bg-muted/10 px-1 py-0 text-center">
                            {canEdit && (
                              <button
                                type="button"
                                className="rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => removeRow(r.id)}
                              >
                                Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canEdit && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => addRow()}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add row
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
          {!activeBoard && boards.length > 0 && (
            <p className="text-sm text-muted-foreground">Select a sheet from the left, or create a new one.</p>
          )}
        </div>
      </div>

      <Dialog open={newBoardOpen} onClose={() => setNewBoardOpen(false)} title="New ready made sheet">
        <div className="space-y-3">
          <div>
            <Label htmlFor="nb">Sheet name</Label>
            <Input
              id="nb"
              className="mt-1"
              placeholder="e.g. Caps rack, Outlet shelf A"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="nbg">Group</Label>
            <select
              id="nbg"
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
              value={newBoardGroupId}
              onChange={(e) => setNewBoardGroupId(e.target.value)}
            >
              {sortByOrder(groups).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setNewBoardOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void createBoard()} disabled={saving}>
              Create
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog open={newGroupOpen} onClose={() => setNewGroupOpen(false)} title="New sheet group">
        <div className="space-y-3">
          <div>
            <Label htmlFor="ng">Group name</Label>
            <Input
              id="ng"
              className="mt-1"
              placeholder="e.g. Outlet racks, Online SKUs"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setNewGroupOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void createGroup()} disabled={saving}>
              Create group
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
