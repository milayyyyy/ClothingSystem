"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, Copy, ExternalLink, Eye, EyeOff, Plus, Search, Tag, Trash2 } from "lucide-react";
import { InventoryFullStockExportButton } from "@/components/inventory-full-stock-export-button";
import { computeReadyMadeLowStockRows } from "@/lib/ready-made-low-stock";
import { fetchReadyMadeLowStockRowsForBoard } from "@/lib/ready-made-board-low-stock-fetch";
import { cn } from "@/lib/utils";
import { useConfirmAction } from "@/components/confirm-dialog";

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
  /** When true, editing a cell value shows BigSeller login details for this sheet. */
  bigseller_stock_prompt_enabled?: boolean | null;
  bigseller_url?: string | null;
  bigseller_username?: string | null;
  bigseller_password?: string | null;
};

const BOARD_SELECT_FULL =
  "id,name,sort_order,group_id,low_stock_minimum_enabled,low_stock_sheet_minimum,bigseller_stock_prompt_enabled,bigseller_url,bigseller_username,bigseller_password";
const BOARD_SELECT_BASE =
  "id,name,sort_order,group_id,low_stock_minimum_enabled,low_stock_sheet_minimum";

function bigsellerHref(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

type BigsellerPrompt = {
  sheetName: string;
  rowLabel: string;
  colHeader: string;
  value: string;
  url: string;
  username: string;
  password: string;
};

function CopyableField({
  label,
  value,
  secret = false,
  href,
}: {
  label: string;
  value: string;
  secret?: boolean;
  href?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [reveal, setReveal] = useState(false);
  const shown = secret && !reveal ? (value ? "••••••••" : "") : value;

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      alert("Could not copy");
    }
  }

  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1 truncate rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-sm">
          {value ? (
            href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                {shown}
              </a>
            ) : (
              <span className="font-mono text-[13px]">{shown}</span>
            )
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </div>
        {secret && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-9 shrink-0 px-0"
            disabled={!value}
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Hide password" : "Show password"}
          >
            {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
        )}
        {href && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-9 shrink-0 px-0"
            onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
            aria-label="Open BigSeller"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 px-2.5"
          disabled={!value}
          onClick={() => void copy()}
        >
          <Copy className="mr-1 h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

type Col = { id: string; board_id: string; header_name: string; sort_order: number; description?: string | null };
type Row = { id: string; board_id: string; row_label: string; sort_order: number };
type Cell = {
  id: string;
  row_id: string;
  column_id: string;
  value: string;
  description?: string | null;
  board_name_cache?: string | null;
  row_label_cache?: string | null;
  col_header_cache?: string | null;
};

function sortByOrder<T extends { sort_order: number }>(arr: T[]) {
  return [...arr].sort((a, b) => a.sort_order - b.sort_order);
}

const UNGROUPED_COLLAPSE_KEY = "__ungrouped__";

/** Matches Tailwind `lg` (1024px): phone / small tablet uses the popup sheet picker. */
function useIsPhoneUi() {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsPhone(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isPhone;
}

export function ReadyMadeInventoryClient({ canEdit = true }: { canEdit?: boolean }) {
  const supabase = createClient();
  const isPhoneUi = useIsPhoneUi();
  const { ask, dialog: confirmDialog } = useConfirmAction();
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
  /** Collapsed sheet-group keys (group id or UNGROUPED_COLLAPSE_KEY). Default: all collapsed. */
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const collapsedInitRef = useRef(false);
  /** Active sheet only: show rows flagged low stock (any column below minimum). */
  const [lowStockOnly, setLowStockOnly] = useState(false);
  /** Phone: sheet list is hidden until this is open (desktop sidebar stays visible). */
  const [sheetNavOpen, setSheetNavOpen] = useState(false);
  // Per-cell description dialog
  const [connectingCell, setConnectingCell] = useState<{ rowId: string; columnId: string; rowLabel: string; colHeader: string } | null>(null);
  const [connectCellDraft, setConnectCellDraft] = useState("");
  // Per-column description dialog (column header row)
  const [connectingCol, setConnectingCol] = useState<Col | null>(null);
  const [connectColDraft, setConnectColDraft] = useState("");
  /** Increment to rescan every sheet’s low stock from the server (not only the open sheet). */
  const [lowStockScanKey, setLowStockScanKey] = useState(0);
  const [allSheetsLowStockTotal, setAllSheetsLowStockTotal] = useState(0);
  const [allSheetsLowStockLoading, setAllSheetsLowStockLoading] = useState(false);
  const [boardLowStockCounts, setBoardLowStockCounts] = useState<Record<string, number>>({});
  const [bigsellerPrompt, setBigsellerPrompt] = useState<BigsellerPrompt | null>(null);
  const [showSheetBigsellerPassword, setShowSheetBigsellerPassword] = useState(false);

  const cellByPair = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cells) m.set(`${c.row_id}:${c.column_id}`, c.value);
    return m;
  }, [cells]);

  const cellMetaByPair = useMemo(() => {
    const m = new Map<string, { description?: string | null }>();
    for (const c of cells) m.set(`${c.row_id}:${c.column_id}`, { description: c.description });
    return m;
  }, [cells]);

  const refreshCatalog = useCallback(async () => {
    const [{ data: gdata, error: ge }, { data: bdata, error: be }] = await Promise.all([
      supabase.from("ready_made_sheet_groups").select("id,name,sort_order").order("sort_order"),
      supabase.from("ready_made_boards").select(BOARD_SELECT_FULL).order("sort_order"),
    ]);
    if (ge) console.error(ge);
    let boardsData = bdata;
    if (be) {
      const { data: fallback, error: fe } = await supabase
        .from("ready_made_boards")
        .select(BOARD_SELECT_BASE)
        .order("sort_order");
      if (fe) console.error(fe);
      else console.error(be);
      boardsData = fallback;
    }
    setGroups(((gdata as Group[]) || []).filter(Boolean));
    const bl = (boardsData as Board[]) || [];
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
    const { data: cellsData, error: cellsErr } = await supabase
      .from("ready_made_cells")
      .select("id,row_id,column_id,value,description,board_name_cache,row_label_cache,col_header_cache")
      .in("row_id", rowIds);
    // Fallback: if new columns don't exist yet (migration not yet applied), re-fetch without them
    if (cellsErr) {
      const { data: fallback } = await supabase
        .from("ready_made_cells")
        .select("id,row_id,column_id,value")
        .in("row_id", rowIds);
      setCells((fallback as Cell[]) || []);
    } else {
      setCells((cellsData as Cell[]) || []);
    }
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
    setShowSheetBigsellerPassword(false);
    void loadGrid(activeId);
  }, [activeId, loadGrid]);

  useEffect(() => {
    if (!isPhoneUi) setSheetNavOpen(false);
  }, [isPhoneUi]);

  function boardsInGroup(groupId: string | null) {
    return sortByOrder(boards.filter((b) => (b.group_id ?? null) === (groupId ?? null)));
  }

  function openNewSheet(groupId?: string) {
    const gid = groupId ?? groups[0]?.id ?? "";
    setNewBoardGroupId(gid);
    setNewBoardName("");
    setSheetNavOpen(false);
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

  function deleteGroup(id: string) {
    const g = groups.find((x) => x.id === id);
    ask({
      title: "Delete sheet group?",
      description: `Delete "${g?.name || "this group"}"? Sheets inside will become ungrouped. This cannot be undone.`,
      confirmLabel: "Delete group",
      onConfirm: async () => {
        const { error } = await supabase.from("ready_made_sheet_groups").delete().eq("id", id);
        if (error) {
          alert(error.message);
          return;
        }
        await refreshCatalog();
      },
    });
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

  function deleteBoard(id: string) {
    const b = boards.find((x) => x.id === id);
    ask({
      title: "Delete sheet?",
      description: `Delete "${b?.name || "this sheet"}" and all its rows, columns, and cell values? This cannot be undone.`,
      confirmLabel: "Delete sheet",
      onConfirm: async () => {
        const { error } = await supabase.from("ready_made_boards").delete().eq("id", id);
        if (error) {
          alert(error.message);
          return;
        }
        if (activeId === id) setActiveId(null);
        const list = (await refreshCatalog()) ?? [];
        if (list[0]) setActiveId(list[0].id);
      },
    });
  }

  async function duplicateBoard(sourceBoardId: string) {
    const source = boards.find((b) => b.id === sourceBoardId);
    if (!source) return;
    setSaving(true);
    try {
      const [{ data: srcColsRaw }, { data: srcRowsRaw }] = await Promise.all([
        supabase.from("ready_made_columns").select("*").eq("board_id", sourceBoardId).order("sort_order"),
        supabase.from("ready_made_rows").select("*").eq("board_id", sourceBoardId).order("sort_order"),
      ]);
      const srcCols = sortByOrder((srcColsRaw as Col[]) || []);
      const srcRows = sortByOrder((srcRowsRaw as Row[]) || []);
      const srcRowIds = srcRows.map((r) => r.id);
      const { data: srcCellsRaw } = srcRowIds.length
        ? await supabase
            .from("ready_made_cells")
            .select("row_id,column_id,value")
            .in("row_id", srcRowIds)
        : { data: [] as Cell[] };
      const srcCells = (srcCellsRaw as Cell[]) || [];

      const inGroup = boards.filter((b) => (b.group_id ?? null) === (source.group_id ?? null));
      const maxSo = inGroup.reduce((m, b) => Math.max(m, b.sort_order), -1);
      const baseName = (source.name || "Untitled").trim() || "Untitled";
      const copyName = `${baseName} (copy)`;

      const { data: createdFull, error: boardErrFull } = await supabase
        .from("ready_made_boards")
        .insert({
          name: copyName,
          sort_order: maxSo + 1,
          group_id: source.group_id,
          low_stock_minimum_enabled: source.low_stock_minimum_enabled ?? true,
          low_stock_sheet_minimum: source.low_stock_sheet_minimum ?? null,
          bigseller_stock_prompt_enabled: source.bigseller_stock_prompt_enabled ?? false,
          bigseller_url: source.bigseller_url ?? null,
          bigseller_username: source.bigseller_username ?? null,
          bigseller_password: source.bigseller_password ?? null,
        })
        .select("id")
        .single();
      let created: { id: string } | null = createdFull as { id: string } | null;
      let boardErr = boardErrFull;
      if (boardErr || !created) {
        const retry = await supabase
          .from("ready_made_boards")
          .insert({
            name: copyName,
            sort_order: maxSo + 1,
            group_id: source.group_id,
            low_stock_minimum_enabled: source.low_stock_minimum_enabled ?? true,
            low_stock_sheet_minimum: source.low_stock_sheet_minimum ?? null,
          })
          .select("id")
          .single();
        created = retry.data as { id: string } | null;
        boardErr = retry.error;
      }
      if (boardErr || !created) throw boardErr ?? new Error("Could not duplicate sheet");

      const newBoardId = (created as { id: string }).id;
      const colIdMap = new Map<string, string>();
      const rowIdMap = new Map<string, string>();

      if (srcCols.length) {
        const { data: newCols, error: colErr } = await supabase
          .from("ready_made_columns")
          .insert(
            srcCols.map((c) => ({
              board_id: newBoardId,
              header_name: c.header_name,
              sort_order: c.sort_order,
            })),
          )
          .select("id");
        if (colErr) throw colErr;
        srcCols.forEach((c, i) => {
          const nid = (newCols as { id: string }[])?.[i]?.id;
          if (nid) colIdMap.set(c.id, nid);
        });
      }

      if (srcRows.length) {
        const { data: newRows, error: rowErr } = await supabase
          .from("ready_made_rows")
          .insert(
            srcRows.map((r) => ({
              board_id: newBoardId,
              row_label: r.row_label,
              sort_order: r.sort_order,
            })),
          )
          .select("id");
        if (rowErr) throw rowErr;
        srcRows.forEach((r, i) => {
          const nid = (newRows as { id: string }[])?.[i]?.id;
          if (nid) rowIdMap.set(r.id, nid);
        });
      }

      const cellPayload = srcCells
        .map((cell) => {
          const row_id = rowIdMap.get(cell.row_id);
          const column_id = colIdMap.get(cell.column_id);
          if (!row_id || !column_id) return null;
          return { row_id, column_id, value: cell.value ?? "" };
        })
        .filter(Boolean) as { row_id: string; column_id: string; value: string }[];

      if (cellPayload.length) {
        const { error: cellErr } = await supabase.from("ready_made_cells").insert(cellPayload);
        if (cellErr) throw cellErr;
      }

      await refreshCatalog();
      setActiveId(newBoardId);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Could not duplicate sheet");
    } finally {
      setSaving(false);
    }
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

  async function setBoardBigsellerPromptEnabled(boardId: string, enabled: boolean) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ready_made_boards")
        .update({ bigseller_stock_prompt_enabled: enabled })
        .eq("id", boardId);
      if (error) throw error;
      setBoards((prev) =>
        prev.map((b) => (b.id === boardId ? { ...b, bigseller_stock_prompt_enabled: enabled } : b)),
      );
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Could not update BigSeller reminder");
    } finally {
      setSaving(false);
    }
  }

  async function setBoardBigsellerText(
    boardId: string,
    field: "bigseller_url" | "bigseller_username" | "bigseller_password",
    raw: string,
  ) {
    const value = raw.trim() || null;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("ready_made_boards")
        .update({ [field]: value })
        .eq("id", boardId);
      if (error) throw error;
      setBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, [field]: value } : b)));
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Could not save BigSeller login");
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
    // Lookup labels for activity log context cache
    const row = rows.find((r) => r.id === rowId);
    const col = cols.find((c) => c.id === columnId);
    const boardName = activeBoard?.name ?? null;
    const contextPatch = {
      board_name_cache:  boardName,
      row_label_cache:   row?.row_label ?? null,
      col_header_cache:  col?.header_name ?? null,
    };

    const { data: existing } = await supabase
      .from("ready_made_cells")
      .select("id")
      .eq("row_id", rowId)
      .eq("column_id", columnId)
      .maybeSingle();
    if (existing?.id) {
      const { error: updateErr } = await supabase
        .from("ready_made_cells")
        .update({ value, ...contextPatch })
        .eq("id", (existing as { id: string }).id);
      // Fallback if new columns don't exist yet
      if (updateErr) {
        await supabase.from("ready_made_cells").update({ value }).eq("id", (existing as { id: string }).id);
      }
      setCells((prev) =>
        prev.map((c) => (c.row_id === rowId && c.column_id === columnId ? { ...c, value, ...contextPatch } : c)),
      );
      setLowStockScanKey((k) => k + 1);
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from("ready_made_cells")
        .insert({ row_id: rowId, column_id: columnId, value, ...contextPatch })
        .select("id,row_id,column_id,value,description,board_name_cache,row_label_cache,col_header_cache")
        .single();
      // Fallback if new columns don't exist yet
      if (insertErr) {
        const { data: insertedBasic } = await supabase
          .from("ready_made_cells")
          .insert({ row_id: rowId, column_id: columnId, value })
          .select("id,row_id,column_id,value")
          .single();
        if (insertedBasic) setCells((prev) => [...prev.filter((c) => !(c.row_id === rowId && c.column_id === columnId)), insertedBasic as Cell]);
      } else if (inserted) {
        setCells((prev) => [...prev.filter((c) => !(c.row_id === rowId && c.column_id === columnId)), inserted as Cell]);
      }
      setLowStockScanKey((k) => k + 1);
    }

    if (activeBoard?.bigseller_stock_prompt_enabled) {
      setBigsellerPrompt({
        sheetName: activeBoard.name,
        rowLabel: row?.row_label ?? "",
        colHeader: col?.header_name ?? "",
        value,
        url: (activeBoard.bigseller_url ?? "").trim(),
        username: (activeBoard.bigseller_username ?? "").trim(),
        password: (activeBoard.bigseller_password ?? "").trim(),
      });
    }
  }

  async function setCellMeta(rowId: string, columnId: string, description: string | null) {
    const { data: existing } = await supabase
      .from("ready_made_cells")
      .select("id")
      .eq("row_id", rowId)
      .eq("column_id", columnId)
      .maybeSingle();

    const row = rows.find((r) => r.id === rowId);
    const col = cols.find((c) => c.id === columnId);
    const contextPatch = {
      board_name_cache: activeBoard?.name ?? null,
      row_label_cache:  row?.row_label ?? null,
      col_header_cache: col?.header_name ?? null,
      description:      description || null,
    };

    if (existing?.id) {
      await supabase.from("ready_made_cells").update(contextPatch).eq("id", (existing as { id: string }).id);
    } else {
      // Cell doesn't exist yet — create it with empty value
      await supabase.from("ready_made_cells").insert({
        row_id: rowId, column_id: columnId, value: "", ...contextPatch,
      });
    }
    setCells((prev) => prev.map((c) =>
      c.row_id === rowId && c.column_id === columnId
        ? { ...c, ...contextPatch }
        : c
    ));
  }

  function openConnectCell(row: Row, col: Col) {
    const meta = cellMetaByPair.get(`${row.id}:${col.id}`);
    setConnectCellDraft(meta?.description ?? "");
    setConnectingCell({ rowId: row.id, columnId: col.id, rowLabel: row.row_label, colHeader: col.header_name });
  }

  async function saveConnectCell() {
    if (!connectingCell) return;
    await setCellMeta(connectingCell.rowId, connectingCell.columnId, connectCellDraft || null);
    setConnectingCell(null);
  }

  async function saveConnectCol() {
    if (!connectingCol) return;
    const { error } = await supabase
      .from("ready_made_columns")
      .update({ description: connectColDraft || null })
      .eq("id", connectingCol.id);
    if (!error) {
      setCols((prev) => prev.map((c) => c.id === connectingCol.id ? { ...c, description: connectColDraft || null } : c));
    }
    // If error (e.g. migration not applied yet), close dialog gracefully
    setConnectingCol(null);
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

  function removeColumn(colId: string) {
    if (cols.length <= 1) {
      alert("Keep at least one column.");
      return;
    }
    const col = cols.find((c) => c.id === colId);
    ask({
      title: "Delete column?",
      description: `Delete column "${col?.header_name || "this column"}" and all cell values in it? This cannot be undone.`,
      confirmLabel: "Delete column",
      onConfirm: async () => {
        const { error } = await supabase.from("ready_made_columns").delete().eq("id", colId);
        if (error) {
          alert(error.message);
          return;
        }
        if (activeId) await loadGrid(activeId);
      },
    });
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

  function removeRow(rowId: string) {
    if (rows.length <= 1) {
      alert("Keep at least one row.");
      return;
    }
    const row = rows.find((r) => r.id === rowId);
    ask({
      title: "Delete row?",
      description: `Delete row "${row?.row_label || "this row"}" and all cell values in it? This cannot be undone.`,
      confirmLabel: "Delete row",
      onConfirm: async () => {
        const { error } = await supabase.from("ready_made_rows").delete().eq("id", rowId);
        if (error) {
          alert(error.message);
          return;
        }
        if (activeId) await loadGrid(activeId);
      },
    });
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

  useEffect(() => {
    if (loading || collapsedInitRef.current) return;
    const hasUngrouped = boards.some((b) => !b.group_id);
    if (groups.length === 0 && !hasUngrouped) return;
    collapsedInitRef.current = true;
    const keys = groups.map((g) => g.id);
    if (hasUngrouped) keys.push(UNGROUPED_COLLAPSE_KEY);
    setCollapsedGroupIds(new Set(keys));
  }, [loading, groups, boards]);

  function toggleGroupCollapsed(groupKey: string) {
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  function isSheetListCollapsed(groupKey: string, visibleSheets: Board[], groupName?: string) {
    if (sheetQ) {
      if (groupName && groupName.toLowerCase().includes(sheetQ)) return false;
      if (visibleSheets.length > 0) return false;
    }
    if (visibleSheets.some((b) => b.id === activeId)) return false;
    return collapsedGroupIds.has(groupKey);
  }

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

  function renderSheetRow(b: Board) {
    return (
      <div key={b.id} className="flex items-stretch gap-0.5">
        <button
          type="button"
          title={
            b.low_stock_minimum_enabled === false ? "Low stock minimum is off for this sheet" : undefined
          }
          onClick={() => {
            setActiveId(b.id);
            setSheetNavOpen(false);
          }}
          className={`min-w-0 flex-1 rounded-md border px-2 py-2 text-left text-xs font-medium transition-colors sm:py-1.5 ${
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
        {canEdit && (
          <button
            type="button"
            className="shrink-0 rounded-md border border-transparent px-1.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
            disabled={saving}
            title="Duplicate sheet with all row, column, and cell values"
            aria-label={`Duplicate ${b.name || "sheet"}`}
            onClick={() => void duplicateBoard(b.id)}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  function renderSheetGroups() {
    return (
      <>
        {sortByOrder(groups).map((g) => {
          const boardsFiltered = filterBoardsInGroup(g.id, g);
          const allInGroup = boardsInGroup(g.id);
          if (sheetQ && boardsFiltered.length === 0 && !g.name.toLowerCase().includes(sheetQ)) return null;
          const collapsed = isSheetListCollapsed(g.id, boardsFiltered, g.name);
          const sheetCount = allInGroup.length;
          return (
            <div key={g.id} className="rounded-lg border border-border bg-card/40 p-2 shadow-sm">
              <div className="mb-1.5 flex items-center gap-1">
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground sm:h-7 sm:w-7"
                  onClick={() => toggleGroupCollapsed(g.id)}
                  aria-expanded={!collapsed}
                  aria-label={collapsed ? `Show sheets in ${g.name}` : `Hide sheets in ${g.name}`}
                  title={collapsed ? "Show sheets" : "Hide sheets"}
                >
                  <ChevronRight className={cn("h-4 w-4 transition-transform", !collapsed && "rotate-90")} />
                </button>
                <Input
                  className="h-9 min-w-0 flex-1 text-base font-medium sm:h-8 sm:text-sm"
                  key={`gname:${g.id}:${g.name}`}
                  defaultValue={g.name}
                  readOnly={!canEdit}
                  onBlur={(e) => {
                    if (!canEdit) return;
                    if (e.target.value !== g.name) void renameGroup(g.id, e.target.value);
                  }}
                  aria-label="Group name"
                />
                {canEdit && (
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 sm:h-8 sm:w-8" onClick={() => deleteGroup(g.id)} aria-label="Delete group">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              {collapsed ? (
                <button
                  type="button"
                  className="mb-1 w-full rounded-md px-1 py-2 text-left text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  onClick={() => toggleGroupCollapsed(g.id)}
                >
                  {sheetCount === 0
                    ? "No sheets — tap to expand"
                    : sheetCount === 1
                      ? "1 sheet hidden — tap to show"
                      : `${sheetCount} sheets hidden — tap to show`}
                </button>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {boardsFiltered.map((b) => renderSheetRow(b))}
                  {sheetCount === 0 && (
                    <p className="text-[11px] text-muted-foreground">No sheets — add one below.</p>
                  )}
                  {sheetCount > 0 && boardsFiltered.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">No sheets match search.</p>
                  )}
                </div>
              )}
              {canEdit && !collapsed && (
                <Button type="button" variant="secondary" size="sm" className="mt-2 h-9 w-full text-[11px] sm:h-7" onClick={() => openNewSheet(g.id)}>
                  <Plus className="mr-1 h-3 w-3" /> Sheet in this group
                </Button>
              )}
              {canEdit && collapsed && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-1 h-9 w-full text-[11px] text-muted-foreground sm:h-7"
                  onClick={() => {
                    toggleGroupCollapsed(g.id);
                    openNewSheet(g.id);
                  }}
                >
                  <Plus className="mr-1 h-3 w-3" /> Add sheet
                </Button>
              )}
            </div>
          );
        })}
        {ungroupedBoards.length > 0 && (() => {
          const ungroupedFiltered = sheetQ ? filterBoardsInGroup(null, null) : ungroupedBoards;
          const ungroupedCollapsed = isSheetListCollapsed(UNGROUPED_COLLAPSE_KEY, ungroupedFiltered, "Ungrouped");
          return (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 p-2">
              <div className="mb-2 flex items-center gap-1">
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground sm:h-7 sm:w-7"
                  onClick={() => toggleGroupCollapsed(UNGROUPED_COLLAPSE_KEY)}
                  aria-expanded={!ungroupedCollapsed}
                  aria-label={ungroupedCollapsed ? "Show ungrouped sheets" : "Hide ungrouped sheets"}
                >
                  <ChevronRight className={cn("h-4 w-4 transition-transform", !ungroupedCollapsed && "rotate-90")} />
                </button>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ungrouped</div>
              </div>
              {ungroupedCollapsed ? (
                <button
                  type="button"
                  className="w-full rounded-md px-1 py-2 text-left text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  onClick={() => toggleGroupCollapsed(UNGROUPED_COLLAPSE_KEY)}
                >
                  {ungroupedBoards.length === 1
                    ? "1 sheet hidden — tap to show"
                    : `${ungroupedBoards.length} sheets hidden — tap to show`}
                </button>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {ungroupedFiltered.map((b) => renderSheetRow(b))}
                  {sheetQ && ungroupedFiltered.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">No ungrouped sheets match.</p>
                  )}
                </div>
              )}
            </div>
          );
        })()}
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No groups yet. Add one, or apply migration <code className="rounded bg-muted px-1">022_ready_made_sheet_groups.sql</code> if the app errors loading data.
          </p>
        )}
      </>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {confirmDialog}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative hidden min-w-0 flex-1 sm:max-w-sm lg:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Label htmlFor="rm-sheet-search" className="sr-only">
            Search sheets
          </Label>
          <Input
            id="rm-sheet-search"
            type="search"
            placeholder="Search sheets or groups…"
            value={sheetSearch}
            onChange={(e) => setSheetSearch(e.target.value)}
            className="h-10 pl-8 sm:h-8"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <InventoryFullStockExportButton compact mode="ready-made" />
          {canEdit && (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setNewGroupOpen(true)} disabled={saving} aria-label="New group">
                <Plus className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">New group</span>
              </Button>
              <Button type="button" size="sm" onClick={() => openNewSheet()} disabled={saving || !groups.length} aria-label="New sheet">
                <Plus className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">New sheet</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {boards.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeBoard && (
            <div className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs">
              <span className="text-muted-foreground">Rows</span>
              <span className="font-semibold tabular-nums">{rows.length}</span>
            </div>
          )}
          <button
            type="button"
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
              "inline-flex min-h-10 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-xs outline-none transition-colors sm:min-h-0",
              lowStockMinimumActive &&
                lowStockCount > 0 &&
                "cursor-pointer hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring",
              lowStockOnly && lowStockMinimumActive && lowStockCount > 0 && "border-primary bg-primary/5",
              !lowStockMinimumActive && "cursor-not-allowed opacity-70",
              lowStockMinimumActive && lowStockCount === 0 && "cursor-default",
            )}
            onClick={() => {
              if (!lowStockMinimumActive || lowStockCount === 0) return;
              setLowStockOnly((v) => !v);
            }}
          >
            <span className="text-muted-foreground">Low stock</span>
            <span className="font-semibold tabular-nums text-destructive">
              {allSheetsLowStockLoading ? "…" : allSheetsLowStockTotal}
            </span>
            {activeBoard && lowStockMinimumActive && (
              <span className="text-muted-foreground">
                · this sheet <span className="font-medium text-foreground">{lowStockCount}</span>
              </span>
            )}
            {lowStockCount > 0 && (
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                {lowStockOnly ? "· filtered" : "· tap to filter"}
              </span>
            )}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
        {boards.length > 0 && (
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-2 rounded-md border bg-card px-3 text-left lg:hidden"
            onClick={() => setSheetNavOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetNavOpen}
          >
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{activeBoard?.name || "Select a sheet"}</span>
            <span className="shrink-0 text-[11px] text-muted-foreground">Sheets</span>
          </button>
        )}
        <aside className="hidden w-full shrink-0 space-y-2 lg:block lg:w-60">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sheet groups</h2>
          {renderSheetGroups()}
        </aside>
        <Dialog
          open={isPhoneUi && sheetNavOpen}
          onClose={() => setSheetNavOpen(false)}
          title="Select a sheet"
          description={activeBoard?.name ? `Current: ${activeBoard.name}` : "Choose a sheet to edit."}
          size="md"
        >
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Label htmlFor="rm-sheet-search-phone" className="sr-only">
                Search sheets
              </Label>
              <Input
                id="rm-sheet-search-phone"
                type="search"
                placeholder="Search sheets or groups…"
                value={sheetSearch}
                onChange={(e) => setSheetSearch(e.target.value)}
                className="h-11 pl-8"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">{renderSheetGroups()}</div>
          </div>
        </Dialog>

        <div className="min-w-0 flex-1 space-y-3">
          {activeBoard && (
            <Card>
              <CardContent className="space-y-3 p-3 sm:p-4">
                <div className="flex flex-col gap-2 border-b border-border/60 pb-2.5 sm:flex-row sm:flex-wrap sm:items-center">
                  <Label className="sr-only" htmlFor="board-name">
                    Sheet name
                  </Label>
                  <Input
                    id="board-name"
                    className="h-10 min-w-0 flex-1 font-medium sm:h-8 sm:max-w-sm"
                    key={`${activeBoard.id}:${activeBoard.name}`}
                    defaultValue={activeBoard.name}
                    readOnly={!canEdit}
                    onBlur={(e) => {
                      if (!canEdit) return;
                      if (e.target.value !== activeBoard.name) void renameBoard(activeBoard.id, e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Label htmlFor="board-group" className="text-xs text-muted-foreground whitespace-nowrap">
                      Group
                    </Label>
                    <select
                      id="board-group"
                      className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-base shadow-sm sm:h-8 sm:min-w-[9rem] sm:flex-none sm:text-xs"
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
                    {canEdit && (
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 px-2.5 sm:h-8"
                          disabled={saving}
                          onClick={() => void duplicateBoard(activeBoard.id)}
                          aria-label="Duplicate sheet"
                        >
                          <Copy className="h-3.5 w-3.5 sm:mr-1" />
                          <span className="hidden sm:inline">Duplicate</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-10 px-2.5 sm:h-8"
                          onClick={() => deleteBoard(activeBoard.id)}
                          aria-label="Delete sheet"
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:mr-1" />
                          <span className="hidden sm:inline">Delete</span>
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <details className="rounded-md border border-border/60 bg-muted/15 px-3 py-2 text-xs">
                  <summary className="cursor-pointer list-none font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center justify-between gap-2">
                      <span>Low stock minimum</span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        {activeBoard.low_stock_minimum_enabled === false
                          ? "Off"
                          : activeBoard.low_stock_sheet_minimum == null
                            ? "On · no minimum"
                            : `On · min ${activeBoard.low_stock_sheet_minimum}`}
                      </span>
                    </span>
                  </summary>
                  <div className="mt-2 space-y-2 border-t border-border/50 pt-2">
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                        checked={activeBoard.low_stock_minimum_enabled !== false}
                        onChange={(e) => { if (canEdit) void setBoardLowStockMinimum(activeBoard.id, e.target.checked); }}
                        disabled={saving || !canEdit}
                        aria-label="Low stock minimum for this sheet"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        Count and tint rows when any numeric cell is strictly below the minimum.
                      </span>
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                      <div className="flex w-full max-w-[11rem] flex-col gap-1">
                        <Label htmlFor="board-sheet-min" className="text-[11px] text-muted-foreground">
                          Minimum quantity
                        </Label>
                        <Input
                          id="board-sheet-min"
                          type="number"
                          min={0}
                          step={1}
                          disabled={saving || !canEdit}
                          readOnly={!canEdit}
                          className="h-10 sm:h-8"
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
                      <p className="hidden min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground sm:block">
                        Clear the field to stop numeric checks. Dashboard low-stock uses the same rule.
                      </p>
                    </div>
                  </div>
                </details>

                <details className="rounded-md border border-border/60 bg-muted/15 px-3 py-2 text-xs">
                  <summary className="cursor-pointer list-none font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center justify-between gap-2">
                      <span>BigSeller stock reminder</span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        {activeBoard.bigseller_stock_prompt_enabled ? "On" : "Off"}
                      </span>
                    </span>
                  </summary>
                  <div className="mt-2 space-y-2.5 border-t border-border/50 pt-2">
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-input accent-primary"
                        checked={!!activeBoard.bigseller_stock_prompt_enabled}
                        onChange={(e) => {
                          if (canEdit) void setBoardBigsellerPromptEnabled(activeBoard.id, e.target.checked);
                        }}
                        disabled={saving || !canEdit}
                        aria-label="Show BigSeller login after editing a value"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        After a value on this sheet is edited, show the BigSeller link, username, and password.
                      </span>
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="flex flex-col gap-1 sm:col-span-2">
                        <Label htmlFor="board-bigseller-url" className="text-[11px] text-muted-foreground">
                          Link
                        </Label>
                        <Input
                          id="board-bigseller-url"
                          type="url"
                          disabled={saving || !canEdit}
                          readOnly={!canEdit}
                          className="h-10 sm:h-8"
                          key={`${activeBoard.id}:bsurl:${activeBoard.bigseller_url ?? ""}`}
                          defaultValue={activeBoard.bigseller_url ?? ""}
                          placeholder="https://www.bigseller.com/"
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            const cur = (activeBoard.bigseller_url ?? "").trim();
                            if (next === cur) return;
                            void setBoardBigsellerText(activeBoard.id, "bigseller_url", e.target.value);
                          }}
                          aria-label="BigSeller login or stock page link"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="board-bigseller-user" className="text-[11px] text-muted-foreground">
                          Username
                        </Label>
                        <Input
                          id="board-bigseller-user"
                          type="text"
                          autoComplete="off"
                          disabled={saving || !canEdit}
                          readOnly={!canEdit}
                          className="h-10 sm:h-8"
                          key={`${activeBoard.id}:bsuser:${activeBoard.bigseller_username ?? ""}`}
                          defaultValue={activeBoard.bigseller_username ?? ""}
                          placeholder="BigSeller username"
                          onBlur={(e) => {
                            const next = e.target.value.trim();
                            const cur = (activeBoard.bigseller_username ?? "").trim();
                            if (next === cur) return;
                            void setBoardBigsellerText(activeBoard.id, "bigseller_username", e.target.value);
                          }}
                          aria-label="BigSeller username"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label htmlFor="board-bigseller-pass" className="text-[11px] text-muted-foreground">
                          Password
                        </Label>
                        <div className="flex items-center gap-1">
                          <Input
                            id="board-bigseller-pass"
                            type={showSheetBigsellerPassword ? "text" : "password"}
                            autoComplete="new-password"
                            disabled={saving || !canEdit}
                            readOnly={!canEdit}
                            className="h-10 sm:h-8"
                            key={`${activeBoard.id}:bspass:${activeBoard.bigseller_password ?? ""}`}
                            defaultValue={activeBoard.bigseller_password ?? ""}
                            placeholder="BigSeller password"
                            onBlur={(e) => {
                              const next = e.target.value.trim();
                              const cur = (activeBoard.bigseller_password ?? "").trim();
                              if (next === cur) return;
                              void setBoardBigsellerText(activeBoard.id, "bigseller_password", e.target.value);
                            }}
                            aria-label="BigSeller password"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-10 w-10 shrink-0 px-0 sm:h-8 sm:w-8"
                            onClick={() => setShowSheetBigsellerPassword((v) => !v)}
                            aria-label={showSheetBigsellerPassword ? "Hide password" : "Show password"}
                          >
                            {showSheetBigsellerPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </details>

                <div className="relative max-w-md">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Label htmlFor="rm-grid-search" className="sr-only">
                    Search this sheet
                  </Label>
                  <Input
                    id="rm-grid-search"
                    type="search"
                    placeholder="Search rows, columns, or cells…"
                    value={gridSearch}
                    onChange={(e) => setGridSearch(e.target.value)}
                    className="h-10 pl-8 sm:h-8"
                    autoComplete="off"
                  />
                </div>

                <div className="-mx-3 overflow-x-auto overscroll-x-contain border-y border-border sm:mx-0 sm:rounded-md sm:border">
                  <table className="w-max min-w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="bg-muted/80">
                        <th className="sticky left-0 z-[1] min-w-[5.5rem] border-b border-r bg-muted px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Row
                        </th>
                        {colsSorted.map((c) => (
                          <th key={c.id} className="group min-w-[5.5rem] border-b border-r px-0 py-0">
                            <div className="flex items-center gap-0.5">
                              <input
                                className="min-w-0 flex-1 border-0 bg-transparent px-1.5 py-2 text-base font-medium outline-none focus:bg-background/80 sm:py-1.5 sm:text-[11px]"
                                key={`h:${c.id}:${c.header_name}`}
                                defaultValue={c.header_name}
                                onBlur={(e) => {
                                  if (e.target.value !== c.header_name) void updateColumnHeader(c, e.target.value);
                                }}
                                aria-label="Column header"
                              />
                              {canEdit && (
                                <button
                                  type="button"
                                  title={c.description ? `Description: ${c.description}` : "Set description for this column"}
                                  className={cn(
                                    "shrink-0 rounded p-1.5 sm:p-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100",
                                    c.description ? "text-primary" : "text-muted-foreground/50 hover:text-primary",
                                  )}
                                  onClick={() => { setConnectColDraft(c.description ?? ""); setConnectingCol(c); }}
                                >
                                  <Tag className="h-3 w-3 sm:h-2.5 sm:w-2.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                className={cn(
                                  "shrink-0 rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:p-0.5 sm:opacity-0 sm:group-hover:opacity-100",
                                  !canEdit && "hidden",
                                )}
                                onClick={() => removeColumn(c.id)}
                                aria-label="Remove column"
                              >
                                <Trash2 className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                              </button>
                            </div>
                          </th>
                        ))}
                        {canEdit && (
                          <th className="border-b bg-muted/40 px-1 py-1 align-middle">
                            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-[10px] sm:h-7" onClick={() => addColumn()}>
                              + Col
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
                              className="h-10 w-full min-w-[5rem] border-0 bg-transparent px-1.5 text-base outline-none focus:bg-primary/5 sm:h-7 sm:text-[11px]"
                              key={`r:${r.id}:${r.row_label}`}
                              defaultValue={r.row_label}
                              readOnly={!canEdit}
                              onBlur={(e) => {
                                if (!canEdit) return;
                                if (e.target.value !== r.row_label) void updateRowLabel(r, e.target.value);
                              }}
                              aria-label="Row name"
                            />
                          </td>
                          {colsSorted.map((c) => (
                            <td key={c.id} className="group/cell border-r p-0">
                              <div className="flex items-center">
                                <input
                                  className="h-10 min-w-0 flex-1 border-0 bg-transparent px-1.5 text-base outline-none focus:bg-primary/5 sm:h-7 sm:text-[11px]"
                                  key={`c:${r.id}:${c.id}:${cellByPair.get(`${r.id}:${c.id}`) ?? ""}`}
                                  defaultValue={cellByPair.get(`${r.id}:${c.id}`) ?? ""}
                                  readOnly={!canEdit}
                                  onBlur={(e) => {
                                    if (!canEdit) return;
                                    const v = e.target.value;
                                    const prev = cellByPair.get(`${r.id}:${c.id}`) ?? "";
                                    if (v !== prev) void setCellValue(r.id, c.id, v);
                                  }}
                                />
                                {canEdit && (
                                  <button
                                    type="button"
                                    title={cellMetaByPair.get(`${r.id}:${c.id}`)?.description ? `Description: ${cellMetaByPair.get(`${r.id}:${c.id}`)?.description}` : "Set description for this cell"}
                                    className={cn(
                                      "mr-0.5 shrink-0 rounded p-1.5 sm:p-0.5",
                                      cellMetaByPair.get(`${r.id}:${c.id}`)?.description
                                        ? "text-primary"
                                        : "text-muted-foreground/50 hover:text-primary sm:opacity-0 sm:group-hover/cell:opacity-100",
                                    )}
                                    onClick={() => openConnectCell(r, c)}
                                  >
                                    <Tag className="h-3 w-3 sm:h-2.5 sm:w-2.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          ))}
                          <td className="bg-muted/10 px-0.5 py-0 text-center">
                            {canEdit && (
                              <button
                                type="button"
                                className="inline-flex h-10 w-10 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:h-7 sm:w-7"
                                onClick={() => removeRow(r.id)}
                                aria-label="Remove row"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canEdit && (
                  <Button type="button" variant="secondary" size="sm" className="w-full sm:w-auto" onClick={() => addRow()}>
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

      {/* Per-cell description dialog */}
      <Dialog
        open={!!connectingCell}
        onClose={() => setConnectingCell(null)}
        title={connectingCell ? `${activeBoard?.name ?? ""} › ${connectingCell.rowLabel} › ${connectingCell.colHeader}` : ""}
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            This description will appear in the activity log whenever this cell&apos;s value is changed.
          </p>
          <div>
            <Label htmlFor="cell-desc">Description</Label>
            <Input
              id="cell-desc"
              className="mt-1"
              placeholder={`e.g. ${activeBoard?.name ?? "Item"} ${connectingCell?.rowLabel ?? ""} ${connectingCell?.colHeader ?? ""}`}
              value={connectCellDraft}
              onChange={(e) => setConnectCellDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void saveConnectCell(); }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConnectingCell(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveConnectCell()}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Per-column description dialog */}
      <Dialog
        open={!!connectingCol}
        onClose={() => setConnectingCol(null)}
        title={connectingCol ? `${activeBoard?.name ?? ""} › ${connectingCol.header_name}` : ""}
      >
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            This description will appear in the activity log whenever this column header is changed.
          </p>
          <div>
            <Label htmlFor="col-desc">Description</Label>
            <Input
              id="col-desc"
              className="mt-1"
              placeholder={`e.g. ${activeBoard?.name ?? "Item"} ${connectingCol?.header_name ?? ""} sizes`}
              value={connectColDraft}
              onChange={(e) => setConnectColDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void saveConnectCol(); }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConnectingCol(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveConnectCol()}>
              Save
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!bigsellerPrompt}
        onClose={() => setBigsellerPrompt(null)}
        title="Update BigSeller stock"
        description="Log in to BigSeller and match this sheet’s new quantity."
        size="md"
      >
        {bigsellerPrompt && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              <span className="font-medium">{bigsellerPrompt.sheetName}</span>
              {bigsellerPrompt.rowLabel ? ` · ${bigsellerPrompt.rowLabel}` : ""}
              {bigsellerPrompt.colHeader ? ` · ${bigsellerPrompt.colHeader}` : ""}
              {bigsellerPrompt.value !== "" ? ` → ${bigsellerPrompt.value}` : ""}
            </p>
            <CopyableField
              label="Link"
              value={bigsellerPrompt.url}
              href={bigsellerHref(bigsellerPrompt.url)}
            />
            <CopyableField label="Username" value={bigsellerPrompt.username} />
            <CopyableField label="Password" value={bigsellerPrompt.password} secret />
            <div className="flex justify-end pt-1">
              <Button type="button" onClick={() => setBigsellerPrompt(null)}>
                Done
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
