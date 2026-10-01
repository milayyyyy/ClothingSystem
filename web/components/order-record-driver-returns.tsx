"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DriverReturnPick, ReturnListTab } from "@/lib/order-records";
import { PackageX } from "lucide-react";

type Props = {
  selected: DriverReturnPick[];
  onChange: (next: DriverReturnPick[]) => void;
  readOnly?: boolean;
};

const TABS: { id: ReturnListTab; label: string }[] = [
  { id: "returning", label: "Returning to seller" },
  { id: "to_check", label: "To be checked" },
  { id: "returned", label: "Returned to seller" },
];

function haystack(row: DriverReturnPick) {
  return `${row.trackingNo} ${row.orderNo} ${row.externalOrderNo || ""} ${row.packageNo || ""} ${row.productName} ${row.customerName}`.toLowerCase();
}

function displayTab(row: DriverReturnPick): ReturnListTab {
  return row.tab || "returning";
}

export function OrderRecordDriverReturns({ selected, onChange, readOnly }: Props) {
  const [items, setItems] = useState<DriverReturnPick[]>([]);
  const [loading, setLoading] = useState(!readOnly);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ReturnListTab>("returning");
  const [markingId, setMarkingId] = useState<string | null>(null);

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
        if (!res.ok) throw new Error(json.error || `Could not load returns (${res.status})`);
        return json as { items?: DriverReturnPick[] };
      })
      .then((json) => {
        if (cancelled) return;
        setItems(json.items || []);
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

  const merged = useMemo(() => {
    const byId = new Map<string, DriverReturnPick>();
    for (const row of items) byId.set(row.orderId, row);
    for (const row of selected) {
      if (!byId.has(row.orderId)) byId.set(row.orderId, row);
    }
    return [...byId.values()];
  }, [items, selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter((row) => haystack(row).includes(q));
  }, [merged, query]);

  const counts = useMemo(() => {
    const m: Record<ReturnListTab, number> = { returning: 0, to_check: 0, returned: 0 };
    for (const row of filtered) m[displayTab(row)] += 1;
    return m;
  }, [filtered]);

  useEffect(() => {
    if (!query.trim()) return;
    if (counts[tab] > 0) return;
    const next = TABS.find((t) => counts[t.id] > 0);
    if (next) setTab(next.id);
  }, [query, counts, tab]);

  const list = useMemo(
    () =>
      filtered
        .filter((row) => displayTab(row) === tab)
        .sort((a, b) => a.trackingNo.localeCompare(b.trackingNo) || a.orderNo.localeCompare(b.orderNo)),
    [filtered, tab],
  );

  async function markReturned(row: DriverReturnPick) {
    if (readOnly || displayTab(row) === "returned") return;
    setMarkingId(row.orderId);
    setError(null);
    const res = await fetch("/api/order-records/driver-returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: row.orderId }),
    });
    const json = await res.json().catch(() => ({}));
    setMarkingId(null);
    if (!res.ok) {
      setError(json.error || "Could not mark as returned to seller");
      return;
    }
    const next: DriverReturnPick = { ...row, tab: "returned" };
    setItems((prev) => {
      const has = prev.some((p) => p.orderId === row.orderId);
      if (!has) return [...prev, next];
      return prev.map((p) => (p.orderId === row.orderId ? next : p));
    });
    if (!selectedIds.has(row.orderId)) onChange([...selected, next]);
    else onChange(selected.map((p) => (p.orderId === row.orderId ? next : p)));
    setTab("returned");
  }

  return (
    <div className="space-y-2">
      <div>
        <Label>Returns</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Search by tracking ID or order ID. When you find a match, mark it as Returned to seller.
        </p>
      </div>

      {readOnly ? (
        selected.length === 0 ? (
          <p className="text-sm text-muted-foreground">No returns on this record.</p>
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
            placeholder="Search tracking ID or order ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex flex-wrap gap-1 rounded-lg border p-0.5">
            {TABS.map((t) => (
              <Button
                key={t.id}
                type="button"
                size="sm"
                variant={tab === t.id ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => setTab(t.id)}
              >
                {t.label}
                <Badge variant={tab === t.id ? "default" : "outline"} className="ml-1 h-5 px-1.5 text-[10px]">
                  {counts[t.id]}
                </Badge>
              </Button>
            ))}
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading returns…</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : list.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border px-3 py-4 text-sm text-muted-foreground">
              <PackageX className="h-4 w-4 opacity-50" />
              {query.trim()
                ? counts.returning + counts.to_check + counts.returned === 0
                  ? "No returns match that tracking ID or order ID."
                  : `No ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} matches. Check the other tabs.`
                : tab === "returning"
                  ? "No orders currently returning to seller."
                  : tab === "to_check"
                    ? "No returns to be checked."
                    : "No orders marked as returned to seller."}
            </div>
          ) : (
            <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
              {list.map((row) => {
                const done = displayTab(row) === "returned";
                return (
                  <li key={row.orderId} className="flex items-start justify-between gap-3 px-3 py-2">
                    <ReturnRow row={row} />
                    {done ? (
                      <Badge variant="green" className="mt-0.5 shrink-0 text-[10px]">
                        Returned to seller
                      </Badge>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 shrink-0 text-xs"
                        disabled={markingId === row.orderId}
                        onClick={() => void markReturned(row)}
                      >
                        {markingId === row.orderId ? "Marking…" : "Mark as returned to seller"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {selected.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {selected.length} marked on this record
            </p>
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
        {row.orderNo ? `Order ${row.orderNo}` : "Return"}
        {row.externalOrderNo && row.externalOrderNo !== row.orderNo ? ` · ${row.externalOrderNo}` : ""}
        {row.customerName ? ` · ${row.customerName}` : ""}
        {row.productName ? ` · ${row.productName}` : ""}
      </div>
      {(row.from || row.to) && displayTab(row) === "to_check" && (
        <div className="text-xs text-muted-foreground">
          {row.from || "—"} → {row.to || "Returned"}
        </div>
      )}
    </div>
  );
}
