"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { peso } from "@/lib/utils";
import { formatSalesDateTime, orderTypeLabel, type SalesChannel } from "@/lib/sales";
import { defaultSalesListDateRange, unifiedRowsFromOrders, type UnifiedSaleListRow } from "@/lib/sales-list";

type Props = { orders: any[] };

const CHANNELS: Array<"all" | SalesChannel> = ["all", "local", "online", "sublimation", "services"];

function inDateRange(dateKey: string, from: string, to: string, allTime: boolean) {
  if (allTime) return true;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
}

export function SalesListClient({ orders }: Props) {
  const defaults = defaultSalesListDateRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [allTime, setAllTime] = useState(false);
  const [channel, setChannel] = useState<"all" | SalesChannel>("all");
  const [search, setSearch] = useState("");

  const baseRows = useMemo(() => unifiedRowsFromOrders(orders), [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return baseRows.filter((r) => {
      if (!inDateRange(r.dateKey, from, to, allTime)) return false;
      if (channel !== "all" && r.channel !== channel) return false;
      if (q) {
        const blob = [r.customerOrTitle, r.storeOrNotes, r.orderNo != null ? String(r.orderNo) : ""].join(" ").toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [baseRows, from, to, allTime, channel, search]);

  const total = filtered.reduce((s, r) => s + r.amount, 0);

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
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Quick range</span>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("month")}>
              This month
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("30")}>
              Last 30 days
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("7")}>
              Last 7 days
            </Button>
            <Button type="button" size="sm" variant={allTime ? "default" : "outline"} onClick={() => applyPreset("all")}>
              All time
            </Button>
          </div>

          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className={allTime ? "pointer-events-none opacity-50" : ""}>
              <Label htmlFor="sl-from">From</Label>
              <Input
                id="sl-from"
                type="date"
                value={from}
                onChange={(e) => {
                  setAllTime(false);
                  setFrom(e.target.value);
                }}
                className="mt-1"
                disabled={allTime}
              />
            </div>
            <div className={allTime ? "pointer-events-none opacity-50" : ""}>
              <Label htmlFor="sl-to">To</Label>
              <Input
                id="sl-to"
                type="date"
                value={to}
                onChange={(e) => {
                  setAllTime(false);
                  setTo(e.target.value);
                }}
                className="mt-1"
                disabled={allTime}
              />
            </div>
            <div>
              <Label htmlFor="sl-ch">Channel</Label>
              <select
                id="sl-ch"
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                value={channel}
                onChange={(e) => setChannel(e.target.value as typeof channel)}
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c === "all" ? "All channels" : orderTypeLabel(c)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="sl-search">Search</Label>
            <Input
              id="sl-search"
              placeholder="Customer, order #, store / platform…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1 max-w-md"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Orders: <span className="font-medium text-foreground">Ready</span> or{" "}
            <span className="font-medium text-foreground">Delivered</span> only; date uses last update.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          Showing <span className="font-medium text-foreground">{filtered.length}</span> line{filtered.length !== 1 ? "s" : ""}
        </span>
        <span>
          Filtered total: <span className="font-semibold text-foreground">{peso(total)}</span>
        </span>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="font-medium">Order</th>
                <th className="font-medium">Customer</th>
                <th className="font-medium">Channel</th>
                <th className="font-medium">Store / platform</th>
                <th className="px-4 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <SalesRow key={r.key} row={r} />
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
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

function SalesRow({ row }: { row: UnifiedSaleListRow }) {
  const ch =
    row.channel === "online"
      ? "purple"
      : row.channel === "sublimation"
        ? "teal"
        : row.channel === "services"
          ? "amber"
          : "blue";
  const dateLabel = formatSalesDateTime(new Date(row.atMs).toISOString());

  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{dateLabel}</td>
      <td className="py-3 font-mono text-xs">
        {row.orderNo != null ? (
          <Link href="/admin/orders" className="text-primary hover:underline">
            #{row.orderNo}
          </Link>
        ) : (
          "—"
        )}
      </td>
      <td className="max-w-[220px] truncate py-3 font-medium" title={row.customerOrTitle}>
        {row.customerOrTitle}
      </td>
      <td className="py-3">
        <Badge variant={ch as "purple" | "teal" | "blue" | "amber"}>{orderTypeLabel(row.channel)}</Badge>
      </td>
      <td className="max-w-[200px] truncate py-3 text-muted-foreground" title={row.storeOrNotes}>
        {row.storeOrNotes}
      </td>
      <td className="px-4 py-3 text-right font-medium">{peso(row.amount)}</td>
    </tr>
  );
}
