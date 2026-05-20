"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table2, Trash2 } from "lucide-react";
import { peso } from "@/lib/utils";
import { useConfirmAction } from "@/components/confirm-dialog";
import { formatSalesDateTime, orderTypeLabel } from "@/lib/sales";
import { CsvExportDialog } from "@/components/csv-export-dialog";
import {
  defaultSalesListDateRange,
  rowMatchesTab,
  unifiedRowsFromOrders,
  type SalesTab,
  type UnifiedSaleListRow,
} from "@/lib/sales-list";

type Props = { orders: any[] };

const TABS: Array<{ key: SalesTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "walkin_online", label: "Walk-in & Online" },
  { key: "services", label: "Services" },
  { key: "sublimation", label: "Sublimation" },
];

function inDateRange(dateKey: string, from: string, to: string, allTime: boolean) {
  if (allTime) return true;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
}

export function SalesListClient({ orders: initialOrders }: Props) {
  const supabase = createClient();
  const { ask, dialog: confirmDialog } = useConfirmAction();
  const [orders, setOrders] = useState(initialOrders);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const defaults = defaultSalesListDateRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [allTime, setAllTime] = useState(false);
  const [tab, setTab] = useState<SalesTab>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setOrders(initialOrders);
  }, [initialOrders]);

  const baseRows = useMemo(() => unifiedRowsFromOrders(orders), [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseRows.filter((r) => {
      if (!inDateRange(r.dateKey, from, to, allTime)) return false;
      if (!rowMatchesTab(r, tab)) return false;
      if (q) {
        const blob = [
          r.customerOrTitle,
          r.storeOrNotes,
          r.designRef,
          r.description,
          r.waybillNo,
          r.externalOrderNo,
          r.skuCode,
          r.orderNo != null ? `#${r.orderNo}` : "",
          r.orderNo != null ? String(r.orderNo) : "",
        ].join(" ").toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [baseRows, from, to, allTime, tab, search]);

  /** Per-tab totals for the summary bar */
  const tabTotals = useMemo(() => {
    const inRange = baseRows.filter((r) => inDateRange(r.dateKey, from, to, allTime));
    return Object.fromEntries(
      TABS.map(({ key }) => [key, inRange.filter((r) => rowMatchesTab(r, key)).reduce((s, r) => s + r.amount, 0)]),
    ) as Record<SalesTab, number>;
  }, [baseRows, from, to, allTime]);

  const total = filtered.reduce((s, r) => s + r.amount, 0);

  const visibleKeys = useMemo(() => filtered.map((r) => r.key), [filtered]);

  const selectedOrderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of filtered) {
      if (selectedKeys.has(r.key) && r.orderId) ids.add(r.orderId);
    }
    return [...ids];
  }, [filtered, selectedKeys]);

  function toggleRowSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedKeys((prev) => {
      const allOn = visibleKeys.length > 0 && visibleKeys.every((k) => prev.has(k));
      if (allOn) return new Set();
      return new Set(visibleKeys);
    });
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  function bulkDeleteSelected() {
    const ids = selectedOrderIds;
    if (ids.length === 0) return;
    ask({
      title: ids.length === 1 ? "Delete order?" : `Delete ${ids.length} orders?`,
      description:
        ids.length === 1
          ? "Permanently delete this order from the system? This cannot be undone."
          : `Permanently delete ${ids.length} selected orders? This cannot be undone.`,
      confirmLabel: ids.length === 1 ? "Delete order" : `Delete ${ids.length} orders`,
      onConfirm: async () => {
        const { error } = await supabase.from("orders").delete().in("id", ids);
        if (error) {
          alert(error.message);
          return;
        }
        setOrders((prev) => prev.filter((o) => !ids.includes(String(o.id))));
        clearSelection();
      },
    });
  }

  function applyPreset(p: "month" | "30" | "7" | "all") {
    setAllTime(p === "all");
    if (p === "all") return;
    const now = new Date();
    const toK = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (p === "month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const fromK = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-${String(first.getDate()).padStart(2, "0")}`;
      setFrom(fromK);
      setTo(toK);
      return;
    }
    const days = p === "30" ? 30 : 7;
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    const fromK = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    setFrom(fromK);
    setTo(toK);
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      {/* Date range controls */}
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Quick range</span>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("month")}>This month</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("30")}>Last 30 days</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("7")}>Last 7 days</Button>
            <Button type="button" size="sm" variant={allTime ? "default" : "outline"} onClick={() => applyPreset("all")}>All time</Button>
          </div>

          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className={allTime ? "pointer-events-none opacity-50" : ""}>
              <Label htmlFor="sl-from">From</Label>
              <Input
                id="sl-from" type="date" value={from} className="mt-1" disabled={allTime}
                onChange={(e) => { setAllTime(false); setFrom(e.target.value); }}
              />
            </div>
            <div className={allTime ? "pointer-events-none opacity-50" : ""}>
              <Label htmlFor="sl-to">To</Label>
              <Input
                id="sl-to" type="date" value={to} className="mt-1" disabled={allTime}
                onChange={(e) => { setAllTime(false); setTo(e.target.value); }}
              />
            </div>
            <div>
              <Label htmlFor="sl-search">Search</Label>
              <Input
                id="sl-search" placeholder="Customer, order #…" value={search}
                onChange={(e) => setSearch(e.target.value)} className="mt-1"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Completed orders show the full amount. Pending orders with a recorded{" "}
            <span className="font-medium text-foreground">down payment</span> appear as{" "}
            <span className="font-medium text-amber-600 dark:text-amber-400">Deposit</span> rows.
          </p>
          <div className="flex justify-end">
            <CsvExportDialog
              label="Export CSV"
              filename="sales_list"
              columns={[
                { header: "Date",        value: (r: any) => r.dateKey },
                { header: "Order #",     value: (r: any) => r.order_no },
                { header: "Customer",    value: (r: any) => r.customer_name ?? "" },
                { header: "Channel",     value: (r: any) => r.kind ?? "" },
                { header: "Type",        value: (r: any) => r.rowType ?? "" },
                { header: "Amount",      value: (r: any) => r.amount },
                { header: "Description", value: (r: any) => r.description ?? "" },
              ]}
              fetchRows={(from, to) => {
                return filtered.filter((r) => {
                  if (!from && !to) return true;
                  if (from && r.dateKey < from) return false;
                  if (to && r.dateKey > to) return false;
                  return true;
                });
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Channel tabs with mini-totals */}
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-1 rounded-lg border bg-muted/30 p-1">
          {TABS.map(({ key, label }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={
                  "flex flex-col items-center rounded-md px-4 py-2 text-xs font-medium transition-colors " +
                  (active
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground")
                }
              >
                <span>{label}</span>
                <span className={`mt-0.5 font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}>
                  {peso(tabTotals[key] ?? 0)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary line */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          Showing <span className="font-medium text-foreground">{filtered.length}</span> row{filtered.length !== 1 ? "s" : ""}
        </span>
        <span>
          Filtered total: <span className="font-semibold text-foreground">{peso(total)}</span>
        </span>
      </div>

      {selectedKeys.size > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="destructive" size="sm" onClick={bulkDeleteSelected}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Delete selected ({selectedOrderIds.length} order{selectedOrderIds.length !== 1 ? "s" : ""})
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={clearSelection}>
            Clear selection
          </Button>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-2 py-3 text-center">
                  <input
                    type="checkbox"
                    disabled={visibleKeys.length === 0}
                    className="h-4 w-4 cursor-pointer rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Select all visible rows"
                    checked={visibleKeys.length > 0 && visibleKeys.every((k) => selectedKeys.has(k))}
                    ref={(el) => {
                      if (!el) return;
                      const n = visibleKeys.filter((k) => selectedKeys.has(k)).length;
                      el.indeterminate = n > 0 && n < visibleKeys.length;
                    }}
                    onChange={toggleSelectAllVisible}
                  />
                </th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="font-medium">Order</th>
                <th className="font-medium">Customer</th>
                <th className="font-medium">Channel</th>
                <th className="font-medium">Store / platform</th>
                <th className="font-medium">Description</th>
                <th className="px-4 text-right font-medium">Amount</th>
                <th className="w-10 px-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <SalesRow
                  key={r.key}
                  row={r}
                  selected={selectedKeys.has(r.key)}
                  onToggleSelect={() => toggleRowSelected(r.key)}
                />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    No rows match. Widen the date range or clear filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function SalesRow({
  row,
  selected,
  onToggleSelect,
}: {
  row: UnifiedSaleListRow;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const ch =
    row.isBigSeller
      ? "purple"
      : row.channel === "online"
        ? "purple"
        : row.channel === "sublimation"
          ? "teal"
          : row.channel === "services"
            ? "amber"
            : "blue";

  const channelLabel = row.isBigSeller ? "BigSeller" : orderTypeLabel(row.channel);
  const dateLabel = formatSalesDateTime(new Date(row.atMs).toISOString());

  return (
    <tr
      className={`border-t hover:bg-muted/30 ${row.isDeposit ? "bg-amber-50/30 dark:bg-amber-900/10" : ""} ${selected ? "bg-primary/5" : ""}`}
    >
      <td className="w-10 px-2 py-3 text-center align-top">
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
          checked={selected}
          aria-label={row.orderNo != null ? `Select order #${row.orderNo}` : "Select row"}
          onChange={onToggleSelect}
        />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{dateLabel}</td>
      <td className="py-3 font-mono text-xs">
        <div>
          {row.orderNo != null ? (
            <Link href="/admin/orders" className="text-primary hover:underline">
              #{row.orderNo}
            </Link>
          ) : "—"}
        </div>
        {row.isBigSeller && (
          <div className="mt-0.5 space-y-px text-[10px] text-muted-foreground">
            {row.externalOrderNo && <div title="External order no">{row.externalOrderNo}</div>}
            {row.waybillNo && <div title="Waybill no">Waybill: {row.waybillNo}</div>}
            {row.skuCode && <div title="BigSeller code">BS: {row.skuCode}</div>}
          </div>
        )}
      </td>
      <td className="max-w-[200px] truncate py-3 font-medium" title={row.customerOrTitle}>
        {row.customerOrTitle}
      </td>
      <td className="py-3">
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant={ch as "purple" | "teal" | "blue" | "amber"}>{channelLabel}</Badge>
          {row.isDeposit && (
            <Badge variant="amber" className="text-[10px]">Deposit</Badge>
          )}
        </div>
      </td>
      <td className="max-w-[160px] truncate py-3 text-muted-foreground" title={row.storeOrNotes}>
        {row.storeOrNotes}
      </td>
      <td className="max-w-[220px] py-3 text-xs text-muted-foreground" title={row.description}>
        {row.description ? (
          <span className="line-clamp-2">{row.description}</span>
        ) : (
          <span className="italic opacity-40">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="font-medium">{peso(row.amount)}</div>
        {row.isDeposit && row.orderTotal > 0 && (
          <div className="text-[11px] text-muted-foreground">
            of {peso(row.orderTotal)} total
          </div>
        )}
      </td>
      <td className="px-2 py-3 text-center">
        {row.hasTeamsSheet && row.orderId && (
          <Link
            href={`/admin/orders/${row.orderId}/teams`}
            className="inline-flex rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="View teams & jerseys sheet"
          >
            <Table2 className="h-4 w-4" />
          </Link>
        )}
      </td>
    </tr>
  );
}
