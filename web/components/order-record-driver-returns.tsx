"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DriverReturnPick } from "@/lib/order-records";
import { PackageX } from "lucide-react";

type Props = {
  selected: DriverReturnPick[];
  onChange: (next: DriverReturnPick[]) => void;
  readOnly?: boolean;
};

export function OrderRecordDriverReturns({ selected, onChange, readOnly }: Props) {
  const [available, setAvailable] = useState<DriverReturnPick[]>([]);
  const [loading, setLoading] = useState(!readOnly);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (readOnly) return;
    const include = selected.map((s) => s.orderId).join(",");
    const url = include
      ? `/api/order-records/driver-returns?include=${encodeURIComponent(include)}`
      : "/api/order-records/driver-returns";
    let cancelled = false;
    setLoading(true);
    fetch(url)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Could not load returns");
        return json as { available?: DriverReturnPick[]; selected?: DriverReturnPick[] };
      })
      .then((json) => {
        if (cancelled) return;
        setAvailable(json.available || []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load returns");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Load once when opening the form; selected is snapshotted locally after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.orderId)), [selected]);

  const list = useMemo(() => {
    const byId = new Map<string, DriverReturnPick>();
    for (const row of available) byId.set(row.orderId, row);
    for (const row of selected) {
      if (!byId.has(row.orderId)) byId.set(row.orderId, row);
    }
    const q = query.trim().toLowerCase();
    return [...byId.values()]
      .filter((row) => {
        if (!q) return true;
        return `${row.trackingNo} ${row.orderNo} ${row.productName} ${row.customerName}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const aOn = selectedIds.has(a.orderId) ? 0 : 1;
        const bOn = selectedIds.has(b.orderId) ? 0 : 1;
        if (aOn !== bOn) return aOn - bOn;
        return a.trackingNo.localeCompare(b.trackingNo) || a.orderNo.localeCompare(b.orderNo);
      });
  }, [available, selected, query, selectedIds]);

  function toggle(row: DriverReturnPick) {
    if (readOnly) return;
    if (selectedIds.has(row.orderId)) {
      onChange(selected.filter((s) => s.orderId !== row.orderId));
      return;
    }
    onChange([...selected, row]);
  }

  return (
    <div className="space-y-2">
      <div>
        <Label>Returns (driver)</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Select a return the driver marked returned. Tracking number is shown. After manager or admin
          approval it moves to Returned to seller.
        </p>
      </div>

      {readOnly ? (
        selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">No driver returns on this record.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {selected.map((row) => (
              <li key={row.orderId} className="px-3 py-2 text-sm">
                <ReturnRow row={row} />
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <Input
            className="h-8"
            placeholder="Search tracking no, order no…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading returns…</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : list.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border px-3 py-4 text-sm text-muted-foreground">
              <PackageX className="h-4 w-4 opacity-50" />
              {query.trim()
                ? "No returns match that tracking number."
                : "No returns marked returned by the driver right now."}
            </div>
          ) : (
            <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
              {list.map((row) => {
                const on = selectedIds.has(row.orderId);
                return (
                  <li key={row.orderId}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-muted/40">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-primary"
                        checked={on}
                        onChange={() => toggle(row)}
                      />
                      <ReturnRow row={row} />
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {selected.length > 0 && (
            <p className="text-xs text-muted-foreground">{selected.length} selected</p>
          )}
        </>
      )}
    </div>
  );
}

function ReturnRow({ row }: { row: DriverReturnPick }) {
  return (
    <div className="min-w-0">
      <div className="font-medium">
        {row.trackingNo ? `Tracking ${row.trackingNo}` : "No tracking number"}
      </div>
      <div className="text-xs text-muted-foreground">
        {row.orderNo ? `#${row.orderNo}` : "Return"}
        {row.customerName ? ` · ${row.customerName}` : ""}
        {row.productName ? ` · ${row.productName}` : ""}
      </div>
      {(row.from || row.to) && (
        <div className="text-xs text-muted-foreground">
          {row.from || "—"} → {row.to || "Returned"}
        </div>
      )}
    </div>
  );
}
