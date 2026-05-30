"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import {
  emptyUsageSheet,
  newSheetId,
  type ManualUsageSheet,
} from "@/lib/order-records";

type Props = {
  sheets: ManualUsageSheet[];
  onChange: (sheets: ManualUsageSheet[]) => void;
  readOnly?: boolean;
};

export function OrderRecordManualSheet({ sheets, onChange, readOnly }: Props) {
  function updateSheet(sheetId: string, patch: Partial<ManualUsageSheet>) {
    onChange(sheets.map((s) => (s.id === sheetId ? { ...s, ...patch } : s)));
  }

  function removeSheet(sheetId: string) {
    onChange(sheets.filter((s) => s.id !== sheetId));
  }

  function addSheet() {
    onChange([...sheets, emptyUsageSheet(`Sheet ${sheets.length + 1}`)]);
  }

  function addColumn(sheet: ManualUsageSheet) {
    const col = { id: newSheetId(), label: "Column" };
    const rows = sheet.rows.map((r) => ({ ...r, cells: { ...r.cells, [col.id]: "" } }));
    updateSheet(sheet.id, { columns: [...sheet.columns, col], rows });
  }

  function updateColumnLabel(sheet: ManualUsageSheet, colId: string, label: string) {
    updateSheet(sheet.id, {
      columns: sheet.columns.map((c) => (c.id === colId ? { ...c, label } : c)),
    });
  }

  function removeColumn(sheet: ManualUsageSheet, colId: string) {
    if (sheet.columns.length <= 1) return;
    const rows = sheet.rows.map((r) => {
      const cells = { ...r.cells };
      delete cells[colId];
      return { ...r, cells };
    });
    updateSheet(sheet.id, {
      columns: sheet.columns.filter((c) => c.id !== colId),
      rows,
    });
  }

  function addRow(sheet: ManualUsageSheet) {
    const cells: Record<string, string> = {};
    for (const c of sheet.columns) cells[c.id] = "";
    updateSheet(sheet.id, {
      rows: [...sheet.rows, { id: newSheetId(), cells }],
    });
  }

  function updateCell(sheet: ManualUsageSheet, rowId: string, colId: string, value: string) {
    updateSheet(sheet.id, {
      rows: sheet.rows.map((r) =>
        r.id === rowId ? { ...r, cells: { ...r.cells, [colId]: value } } : r,
      ),
    });
  }

  function removeRow(sheet: ManualUsageSheet, rowId: string) {
    updateSheet(sheet.id, { rows: sheet.rows.filter((r) => r.id !== rowId) });
  }

  if (readOnly) {
    if (!sheets.length) {
      return <p className="text-sm text-muted-foreground">No usage sheets.</p>;
    }
    return (
      <div className="space-y-4">
        {sheets.map((sheet) => (
          <div key={sheet.id} className="rounded-md border">
            <div className="border-b bg-muted/30 px-3 py-2 text-sm font-medium">{sheet.name}</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/20">
                    {sheet.columns.map((c) => (
                      <th key={c.id} className="px-2 py-1.5 text-left font-medium">
                        {c.label || "—"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.length === 0 ? (
                    <tr>
                      <td colSpan={sheet.columns.length} className="px-2 py-3 text-muted-foreground">
                        No rows
                      </td>
                    </tr>
                  ) : (
                    sheet.rows.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        {sheet.columns.map((c) => (
                          <td key={c.id} className="px-2 py-1.5 align-top">
                            {row.cells[c.id] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label>Stock usage sheets</Label>
          <p className="text-xs text-muted-foreground">
            Add sheets and type row/column labels yourself. Admin will deduct inventory manually.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1 shrink-0" onClick={addSheet}>
          <Plus className="h-3.5 w-3.5" /> Add sheet
        </Button>
      </div>

      {sheets.length === 0 && (
        <Button type="button" variant="outline" className="w-full" onClick={addSheet}>
          Create first sheet
        </Button>
      )}

      {sheets.map((sheet) => (
        <div key={sheet.id} className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-8 max-w-xs flex-1 font-medium"
              value={sheet.name}
              onChange={(e) => updateSheet(sheet.id, { name: e.target.value })}
              placeholder="Sheet name"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-destructive"
              onClick={() => removeSheet(sheet.id)}
              disabled={sheets.length === 1 && sheet.rows.length === 0}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove sheet
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  {sheet.columns.map((col) => (
                    <th key={col.id} className="min-w-[100px] p-1">
                      <div className="flex items-center gap-1">
                        <Input
                          className="h-7 text-xs font-medium"
                          value={col.label}
                          onChange={(e) => updateColumnLabel(sheet, col.id, e.target.value)}
                          placeholder="Column header"
                        />
                        {sheet.columns.length > 1 && (
                          <button
                            type="button"
                            className="rounded p-1 text-muted-foreground hover:text-destructive"
                            onClick={() => removeColumn(sheet, col.id)}
                            aria-label="Remove column"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="w-8 p-1" />
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    {sheet.columns.map((col) => (
                      <td key={col.id} className="p-1">
                        <Input
                          className="h-8 text-xs"
                          value={row.cells[col.id] ?? ""}
                          onChange={(e) => updateCell(sheet, row.id, col.id, e.target.value)}
                          placeholder="…"
                        />
                      </td>
                    ))}
                    <td className="p-1">
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground hover:text-destructive"
                        onClick={() => removeRow(sheet, row.id)}
                        aria-label="Remove row"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => addRow(sheet)}>
              <Plus className="h-3 w-3" /> Add row
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => addColumn(sheet)}>
              <Plus className="h-3 w-3" /> Add column
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
