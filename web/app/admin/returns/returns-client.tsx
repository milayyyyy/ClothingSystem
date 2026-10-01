"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { peso, cn } from "@/lib/utils";
import { PackageX, RotateCcw, Search, Copy, ExternalLink, Eye, EyeOff, ShoppingBag, Music2, Heart, Calendar } from "lucide-react";
import { CsvExportDialog } from "@/components/csv-export-dialog";
import { BigSellerReturnExcelImportButton } from "@/components/bigseller-return-excel-import-button";
import { forwardReturnToCheck, forwardReturnToSeller, markReturnStatusChecked, parseStoredReturnImport, pendingReturnStatusChange, RETURN_ORDER_SELECT, type BigSellerReturnExcelRow } from "@/lib/bigseller-return-excel";
import { parseBigSellerDateTimeLabel } from "@/lib/bigseller-datetime";
import { BIGSELLER_KNOWN_STORE_NAMES, normalizeBigSellerStoreName } from "@/lib/bigseller-store-labels";

type Order = {
  id: string;
  order_no: number;
  customer_name: string;
  kind?: string;
  order_type?: string;
  source?: string | null;
  stage?: string | null;
  status?: string | null;
  total?: number | null;
  down_payment?: number | null;
  return_status?: "returning" | "returned" | null;
  return_reason?: string | null;
  return_inventory_type?: "inventory" | "ready_made" | null;
  return_inventory_ref?: Record<string, unknown> | null;
  return_import?: unknown;
  notes?: string | null;
  waybill_no?: string | null;
  external_order_no?: string | null;
  sku_code?: string | null;
  customer_social?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type InvItem = { id: string; name: string; category?: string | null; quantity?: number | null; unit?: string | null };
type RmGroup = { id: string; name: string; sort_order: number };
type RmBoard = { id: string; name: string; group_id?: string | null; sort_order: number };
type RmRow = { id: string; board_id: string; row_label: string; sort_order: number };
type RmCol = { id: string; board_id: string; header_name: string; sort_order: number };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function orderLabel(o: Order) {
  return `#${o.order_no} — ${o.customer_name}`;
}
function orderKindLabel(o: Order) {
  const k = String(o.kind || o.order_type || "").toLowerCase();
  if (k === "online" || k === "bigseller") return "Online";
  if (k === "local") return "Walk-in";
  if (k === "services") return "Services";
  if (k === "sublimation") return "Sublimation";
  return k || "—";
}
function formatDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

const RETURN_PLATFORMS = ["Shopee", "TikTok", "Lazada", "BigShop", "Manual After-Sales Order"] as const;
const SHOPEE_AFTER_SALES_TYPES = ["Return and Refund", "Refund Only", "Abnormal Return"] as const;
const TIKTOK_AFTER_SALES_TYPES = ["Return and Refund", "Refund Only", "Exchange", "Abnormal Return"] as const;
const SHOPEE_RETURN_STATUSES = [
  "To Return",
  "Returning",
  "Returned",
  "Return Failed",
  "Lost",
  "Not Pickup",
  "Other",
] as const;
const TIKTOK_RETURN_STATUSES = [
  "To Return",
  "Returning",
  "Returned",
  "Return Failed",
  "No Need to Return",
  "Lost",
  "Not Pickup",
  "Other",
] as const;

function afterSalesTypesForPlatform(platform: string): string[] {
  if (platform === "TikTok") return [...TIKTOK_AFTER_SALES_TYPES];
  return [...SHOPEE_AFTER_SALES_TYPES];
}

function returnStatusesForPlatform(platform: string): string[] {
  if (platform === "TikTok") return [...TIKTOK_RETURN_STATUSES];
  return [...SHOPEE_RETURN_STATUSES];
}

function normFilter(s: string) {
  return s.trim().toLowerCase();
}

function mergeFilterOptions(base: string[], extra: string[]): string[] {
  const seen = new Set(base.map(normFilter));
  const out = [...base];
  for (const s of extra) {
    const t = s.trim();
    if (!t || seen.has(normFilter(t))) continue;
    seen.add(normFilter(t));
    out.push(t);
  }
  return out;
}

function primaryImport(o: Order): BigSellerReturnExcelRow | null {
  return parseStoredReturnImport(o.return_import)?.rows[0] ?? null;
}

function orderPlatform(o: Order): string {
  const p = (primaryImport(o)?.platform || "").trim();
  if (!p) return "Manual After-Sales Order";
  const n = p.toLowerCase();
  if (n.includes("tiktok")) return "TikTok";
  if (n.includes("shopee")) return "Shopee";
  if (n.includes("lazada")) return "Lazada";
  if (n.includes("bigshop") || n.includes("big shop")) return "BigShop";
  return p;
}

function orderStore(o: Order): string {
  return normalizeBigSellerStoreName(primaryImport(o)?.bigsellerStore || "");
}

function orderAfterSalesType(o: Order): string {
  return (primaryImport(o)?.afterSalesType || "").trim();
}

function orderBsReturnStatus(o: Order): string {
  return (primaryImport(o)?.returnStatus || "").trim();
}

function restockTabStatus(o: Order): "returning" | "returned" {
  if (o.return_status === "returned") return "returned";
  const excel = orderBsReturnStatus(o).toLowerCase();
  if (excel.includes("returned")) return "returned";
  if (excel.includes("returning")) return "returning";
  return "returning";
}

function storesForPlatform(platform: string, extra: string[]): string[] {
  const known = BIGSELLER_KNOWN_STORE_NAMES.filter((n) => {
    if (platform === "Shopee") return /shopee/i.test(n);
    if (platform === "TikTok") return /tiktok/i.test(n);
    if (platform === "Lazada") return /lazada/i.test(n);
    if (platform === "BigShop") return /bigshop/i.test(n);
    return false;
  });
  const seen = new Set(known.map(normFilter));
  const out: string[] = [...known];
  for (const s of extra) {
    const t = s.trim();
    if (!t || seen.has(normFilter(t))) continue;
    seen.add(normFilter(t));
    out.push(t);
  }
  return out;
}

function FilterChip({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-sm transition-colors",
        selected
          ? "bg-violet-100 font-medium text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
          : "text-foreground hover:bg-muted/60",
      )}
    >
      {label}
      {count != null && (
        <span className={cn(selected ? "text-violet-700 dark:text-violet-300" : "text-muted-foreground")}>
          ({count})
        </span>
      )}
    </button>
  );
}

function PlatformGlyph({ platform }: { platform: string }) {
  if (platform === "Shopee") return <ShoppingBag className="h-3.5 w-3.5 text-orange-500" />;
  if (platform === "TikTok") return <Music2 className="h-3.5 w-3.5" />;
  if (platform === "Lazada") return <Heart className="h-3.5 w-3.5 text-pink-500" />;
  return null;
}

function MetaLine({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value?: string | null;
  valueClassName?: string;
}) {
  const v = (value || "").trim();
  if (!v) return null;
  return (
    <div className="min-w-0 text-xs leading-5">
      <span className="text-muted-foreground">{label}</span>
      <div className={cn("break-all text-foreground", valueClassName)}>{v}</div>
    </div>
  );
}

function daysUntilDue(dueTime: string): number | null {
  const iso = parseBigSellerDateTimeLabel(dueTime);
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
}

const RETURNS_BS_URL = "returns_bigseller_url";
const RETURNS_BS_USER = "returns_bigseller_username";
const RETURNS_BS_PASS = "returns_bigseller_password";

function bigsellerHref(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

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

function ReturnImportDetails({ raw }: { raw: unknown }) {
  const stored = parseStoredReturnImport(raw);
  if (!stored) return null;
  const changedTo = pendingReturnStatusChange(raw)?.to;
  return (
    <div className="mt-2 space-y-2">
      {stored.rows.map((row, i) => (
        <BigSellerReturnProductInfo
          key={row.afterSalesId || `${row.orderNo}:${i}`}
          row={row}
          changedTo={changedTo}
        />
      ))}
    </div>
  );
}

function BigSellerReturnProductInfo({
  row,
  changedTo,
}: {
  row: BigSellerReturnExcelRow;
  changedTo?: string;
}) {
  const pendingStock = /pending/i.test(row.stockInStatus);
  const refund = row.refunds > 0 ? row.refunds : 0;
  const price = row.sellingPrice > 0 ? row.sellingPrice : 0;
  const qty = row.qty || 1;
  const orderValue =
    row.orderValue && row.orderValue > 0 ? row.orderValue : price > 0 ? price * qty : 0;
  const pay = (row.paymentMethod || "").trim();
  const title = (row.productName || "").trim() || (row.variation || "").trim() || "—";
  const subtitle =
    row.variation && row.variation.trim() && row.variation.trim() !== (row.productName || "").trim()
      ? row.variation.trim()
      : "";
  const returning = /returning/i.test(row.returnStatus);
  const daysLeft = returning && row.dueTime ? daysUntilDue(row.dueTime) : null;

  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 bg-muted/30 px-3 py-2 text-xs">
        {row.orderNo && (
          <span>
            <span className="text-muted-foreground">Order No:</span>
            <span className="font-medium">{row.orderNo}</span>
          </span>
        )}
        {row.stockInStatus && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              pendingStock
                ? "bg-red-500/15 text-red-600 dark:text-red-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {pendingStock && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
            {row.stockInStatus}
          </span>
        )}
        {row.packageNo && (
          <span>
            <span className="text-muted-foreground">Package No:</span>
            {row.packageNo}
          </span>
        )}
        {row.afterSalesId && (
          <span>
            <span className="text-muted-foreground">After Sales ID:</span>
            {row.afterSalesId}
          </span>
        )}
        {row.dueTime && (
          <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            Deadline: <span className="text-foreground">{row.dueTime}</span>
          </span>
        )}
      </div>

      <div className="hidden border-b border-border/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground lg:grid lg:grid-cols-6 lg:gap-3">
        <div>Product Information</div>
        <div>Value</div>
        <div>After Sales</div>
        <div>Status</div>
        <div>Return</div>
        <div>Orders</div>
      </div>

      <div className="grid grid-cols-1 gap-4 px-3 py-3 sm:grid-cols-2 lg:grid-cols-6 lg:gap-3">
        <div className="min-w-0">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground lg:hidden">Product Information</div>
          <div className="truncate text-sm font-medium" title={title}>
            {title}
          </div>
          {subtitle && (
            <div className="truncate text-xs text-muted-foreground" title={subtitle}>
              {subtitle}
            </div>
          )}
          {price > 0 && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              {peso(price)} <span className="text-orange-500">× {qty}</span>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground lg:hidden">Value</div>
          {refund > 0 ? (
            <>
              <div className="text-[11px] text-muted-foreground">Refund Value:</div>
              <div className="text-sm font-medium">{peso(refund)}</div>
            </>
          ) : orderValue > 0 ? (
            <>
              <div className="text-[11px] text-muted-foreground">Order Value:</div>
              <div className="text-sm font-medium">{peso(orderValue)}</div>
            </>
          ) : null}
          {pay && (
            <span className="mt-1 inline-block rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {pay}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground lg:hidden">After Sales</div>
          <div className="text-sm">{row.afterSalesType || "—"}</div>
          {daysLeft != null && daysLeft > 0 && (
            <div className="mt-1 text-sm font-medium text-red-500">{daysLeft} Days</div>
          )}
        </div>

        <div className="min-w-0 space-y-1.5">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground lg:hidden">Status</div>
          <MetaLine label="Order Status:" value={row.orderStatus} />
          <MetaLine label="After Sales Status:" value={row.afterSalesStatus} />
          <MetaLine
            label="Return Status:"
            value={row.returnStatus}
            valueClassName={
              changedTo && normFilter(row.returnStatus) === normFilter(changedTo)
                ? "font-semibold text-amber-700 dark:text-amber-300"
                : undefined
            }
          />
        </div>

        <div className="min-w-0 space-y-1.5">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground lg:hidden">Return</div>
          <MetaLine label="After Sales Application:" value={row.afterSalesRequestingTime} />
          <MetaLine label="Warehouse Arrival:" value={row.warehouseArrival} />
          <MetaLine label="Return Tracking No:" value={row.returnTrackingNo} valueClassName="text-primary" />
          <MetaLine label="Return Logistics Status:" value={row.returnLogisticsStatus} />
        </div>

        <div className="min-w-0 space-y-1.5">
          <div className="mb-1 text-[11px] font-medium text-muted-foreground lg:hidden">Orders</div>
          <MetaLine label="Order:" value={row.orderTime} />
          <MetaLine label="Ship:" value={row.shippingTime} />
          <MetaLine label="Tracking No.:" value={row.trackingNo} valueClassName="text-primary" />
          <MetaLine label="Shipping Logistics Status:" value={row.shippingLogisticsStatus} />
        </div>
      </div>

      {row.returnReason && (
        <div className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          Return Reason: <span className="text-foreground">{row.returnReason}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Return Dialog: browse completed orders → initiate return
// ---------------------------------------------------------------------------
function NewReturnDialog({
  completedOrders,
  onClose,
  onCreated,
}: {
  completedOrders: Order[];
  onClose: () => void;
  onCreated: (updated: Order) => void;
}) {
  const supabase = createClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return completedOrders;
    return completedOrders.filter((o) =>
      [o.order_no, o.customer_name, o.notes, o.waybill_no, o.external_order_no, o.sku_code, o.customer_social]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [completedOrders, search]);

  async function confirm() {
    if (!selected) { setErr("Select an order first."); return; }
    setSaving(true);
    setErr(null);
    const { data, error } = await supabase
      .from("orders")
      .update({ return_status: "returning", return_reason: reason.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", selected.id)
      .select(RETURN_ORDER_SELECT)
      .single();
    if (error) { setErr(error.message); setSaving(false); return; }
    onCreated(data as Order);
  }

  return (
    <Dialog open onClose={onClose} title="Initiate return" size="lg">
      <div className="space-y-4">
        {!selected ? (
          <>
            <p className="text-sm text-muted-foreground">
              Search and select the completed order being returned by the buyer.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-9"
                placeholder="Order #, customer name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border">
              {filtered.length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">No completed orders found.</p>
              )}
              {filtered.map((o) => {
                const total = Number(o.total || 0);
                const paid = Number(o.down_payment || 0);
                return (
                  <button
                    key={o.id}
                    className="flex w-full items-center justify-between border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-muted/40"
                    onClick={() => setSelected(o)}
                  >
                    <div>
                      <div className="font-semibold">#{o.order_no} — {o.customer_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {orderKindLabel(o)} · {formatDate(o.updated_at)}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div className="font-mono font-semibold">{peso(total)}</div>
                      {paid > 0 && <div className="text-muted-foreground">Paid: {peso(paid)}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
            </div>
          </>
        ) : (
          <>
            {/* Selected order */}
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">#{selected.order_no} — {selected.customer_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {orderKindLabel(selected)} · Total: {peso(Number(selected.total || 0))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setSelected(null)}
                >
                  Change
                </Button>
              </div>
            </div>

            <div>
              <Label>Return reason <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
              <Input
                className="mt-1"
                placeholder="e.g. Wrong size, defective item, buyer changed mind…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
            </div>

            {err && <p className="text-sm text-destructive">{err}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={confirm} disabled={saving} className="gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Mark as returning to seller"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Restock Dialog: when order is "returned to seller" → add to inventory
// ---------------------------------------------------------------------------
function RestockDialog({
  order,
  invItems,
  rmGroups,
  rmBoards,
  onClose,
  onRestocked,
}: {
  order: Order;
  invItems: InvItem[];
  rmGroups: RmGroup[];
  rmBoards: RmBoard[];
  onClose: () => void;
  onRestocked: (updated: Order) => void;
}) {
  const supabase = createClient();

  const [invType, setInvType] = useState<"inventory" | "ready_made">("inventory");
  // Inventory
  const [invSearch, setInvSearch] = useState("");
  const [selectedItem, setSelectedItem] = useState<InvItem | null>(null);
  const [qtyToAdd, setQtyToAdd] = useState("1");
  // Ready-made
  const [selectedBoardId, setSelectedBoardId] = useState(rmBoards[0]?.id ?? "");
  const [rmRows, setRmRows] = useState<RmRow[]>([]);
  const [rmCols, setRmCols] = useState<RmCol[]>([]);
  const [selectedRowId, setSelectedRowId] = useState("");
  const [selectedColId, setSelectedColId] = useState("");
  const [rmQtyToAdd, setRmQtyToAdd] = useState("1");
  const [loadingGrid, setLoadingGrid] = useState(false);

  const [step, setStep] = useState<"choose" | "inventory" | "ready_made">("choose");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadBoard(boardId: string) {
    setLoadingGrid(true);
    const [{ data: rows }, { data: cols }] = await Promise.all([
      supabase.from("ready_made_rows").select("id,board_id,row_label,sort_order").eq("board_id", boardId).order("sort_order"),
      supabase.from("ready_made_columns").select("id,board_id,header_name,sort_order").eq("board_id", boardId).order("sort_order"),
    ]);
    setRmRows((rows as RmRow[]) || []);
    setRmCols((cols as RmCol[]) || []);
    setSelectedRowId((rows as RmRow[])?.[0]?.id ?? "");
    setSelectedColId((cols as RmCol[])?.[0]?.id ?? "");
    setLoadingGrid(false);
  }

  function chooseType(t: "inventory" | "ready_made") {
    setInvType(t);
    setStep(t);
    if (t === "ready_made" && selectedBoardId) {
      void loadBoard(selectedBoardId);
    }
  }

  const filteredInvItems = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    if (!q) return invItems;
    return invItems.filter((i) => `${i.name} ${i.category || ""}`.toLowerCase().includes(q));
  }, [invItems, invSearch]);

  async function saveInventory() {
    if (!selectedItem) { setErr("Select an inventory item."); return; }
    const qty = Number(qtyToAdd);
    if (!qty || qty <= 0) { setErr("Enter a valid quantity."); return; }
    setSaving(true);
    setErr(null);

    // Add quantity to existing inventory item
    const newQty = (Number(selectedItem.quantity) || 0) + qty;
    const { error: ie } = await supabase
      .from("inventory")
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq("id", selectedItem.id);
    if (ie) { setErr(ie.message); setSaving(false); return; }

    // Update order
    const ref = { item_id: selectedItem.id, item_name: selectedItem.name, quantity: qty };
    const checkedImport = markReturnStatusChecked(order.return_import);
    const { data, error: oe } = await supabase
      .from("orders")
      .update({
        return_status: "returned",
        return_inventory_type: "inventory",
        return_inventory_ref: ref,
        updated_at: new Date().toISOString(),
        ...(checkedImport ? { return_import: checkedImport } : {}),
      })
      .eq("id", order.id)
      .select(RETURN_ORDER_SELECT)
      .single();
    if (oe) { setErr(oe.message); setSaving(false); return; }
    onRestocked(data as Order);
  }

  async function saveReadyMade() {
    if (!selectedBoardId || !selectedRowId || !selectedColId) { setErr("Select a sheet, row, and column."); return; }
    const qty = Number(rmQtyToAdd);
    if (!qty || qty <= 0) { setErr("Enter a valid quantity."); return; }
    setSaving(true);
    setErr(null);

    // Read current cell value, add qty
    const { data: cellData } = await supabase
      .from("ready_made_cells")
      .select("id,value")
      .eq("row_id", selectedRowId)
      .eq("column_id", selectedColId)
      .maybeSingle();

    const currentVal = parseFloat(cellData?.value ?? "0") || 0;
    const newVal = String(currentVal + qty);

    if (cellData?.id) {
      const { error: ce } = await supabase.from("ready_made_cells").update({ value: newVal }).eq("id", cellData.id);
      if (ce) { setErr(ce.message); setSaving(false); return; }
    } else {
      const { error: ce } = await supabase.from("ready_made_cells").insert({
        row_id: selectedRowId,
        column_id: selectedColId,
        board_id: selectedBoardId,
        value: newVal,
      });
      if (ce) { setErr(ce.message); setSaving(false); return; }
    }

    const board = rmBoards.find((b) => b.id === selectedBoardId);
    const row = rmRows.find((r) => r.id === selectedRowId);
    const col = rmCols.find((c) => c.id === selectedColId);
    const ref = {
      board_id: selectedBoardId,
      board_name: board?.name,
      row_id: selectedRowId,
      row_label: row?.row_label,
      col_id: selectedColId,
      col_name: col?.header_name,
      quantity: qty,
    };

    const checkedImport = markReturnStatusChecked(order.return_import);
    const { data, error: oe } = await supabase
      .from("orders")
      .update({
        return_status: "returned",
        return_inventory_type: "ready_made",
        return_inventory_ref: ref,
        updated_at: new Date().toISOString(),
        ...(checkedImport ? { return_import: checkedImport } : {}),
      })
      .eq("id", order.id)
      .select(RETURN_ORDER_SELECT)
      .single();
    if (oe) { setErr(oe.message); setSaving(false); return; }
    onRestocked(data as Order);
  }

  const boardsByGroup = useMemo(() => {
    const map = new Map<string | null, RmBoard[]>();
    for (const b of rmBoards) {
      const key = b.group_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(b);
    }
    return map;
  }, [rmBoards]);

  return (
    <Dialog open onClose={onClose} title="Restock returned item" size="lg">
      <div className="space-y-4">
        {/* Order summary */}
        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <div className="font-semibold">#{order.order_no} — {order.customer_name}</div>
          {order.return_reason && (
            <div className="mt-0.5 text-xs text-muted-foreground">Reason: {order.return_reason}</div>
          )}
          <div className="mt-0.5 text-xs text-muted-foreground">
            Total sale: {peso(Number(order.total || 0))}
          </div>
        </div>

        {/* Step 1: choose inventory type */}
        {step === "choose" && (
          <div>
            <p className="mb-3 text-sm font-medium">Where will the returned item be restocked?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className="flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
                onClick={() => chooseType("inventory")}
              >
                <span className="text-sm font-semibold">Inventory</span>
                <span className="text-xs text-muted-foreground">
                  Regular supplies, materials, and stock items
                </span>
              </button>
              <button
                className="flex flex-col items-start gap-1.5 rounded-lg border p-4 text-left transition-colors hover:bg-accent"
                onClick={() => chooseType("ready_made")}
              >
                <span className="text-sm font-semibold">Ready-made inventory</span>
                <span className="text-xs text-muted-foreground">
                  Shirts, jerseys, and finished products by sheet
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Step 2a: regular inventory */}
        {step === "inventory" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Select inventory item to restock</p>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setStep("choose")}>
                ← Change
              </Button>
            </div>

            {!selectedItem ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    className="pl-9"
                    placeholder="Search items…"
                    value={invSearch}
                    onChange={(e) => setInvSearch(e.target.value)}
                  />
                </div>
                <div className="max-h-52 overflow-y-auto rounded-md border">
                  {filteredInvItems.length === 0 && (
                    <p className="p-3 text-center text-sm text-muted-foreground">No items found.</p>
                  )}
                  {filteredInvItems.map((item) => (
                    <button
                      key={item.id}
                      className="flex w-full items-center justify-between border-b px-3 py-2.5 text-left text-sm last:border-0 hover:bg-muted/40"
                      onClick={() => setSelectedItem(item)}
                    >
                      <div>
                        <div className="font-medium">{item.name}</div>
                        {item.category && <div className="text-xs text-muted-foreground">{item.category}</div>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.quantity ?? 0} {item.unit || "pcs"}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
                  <div>
                    <div className="font-semibold">{selectedItem.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Current stock: {selectedItem.quantity ?? 0} {selectedItem.unit || "pcs"}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedItem(null)}>
                    Change
                  </Button>
                </div>
                <div>
                  <Label>Quantity to add back</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={qtyToAdd}
                    onChange={(e) => { setQtyToAdd(e.target.value); setErr(null); }}
                    className="mt-1 w-36"
                    autoFocus
                  />
                  {Number(qtyToAdd) > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      New stock: {(Number(selectedItem.quantity) || 0) + Number(qtyToAdd)} {selectedItem.unit || "pcs"}
                    </p>
                  )}
                </div>
                {err && <p className="text-sm text-destructive">{err}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                  <Button onClick={saveInventory} disabled={saving}>
                    {saving ? "Saving…" : "Confirm restock"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 2b: ready-made inventory */}
        {step === "ready_made" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Select sheet, row, and column</p>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setStep("choose")}>
                ← Change
              </Button>
            </div>

            <div>
              <Label>Sheet</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedBoardId}
                onChange={(e) => {
                  setSelectedBoardId(e.target.value);
                  void loadBoard(e.target.value);
                }}
              >
                {rmGroups.length > 0
                  ? rmGroups.map((g) => (
                      <optgroup key={g.id} label={g.name}>
                        {(boardsByGroup.get(g.id) ?? []).map((b) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </optgroup>
                    ))
                  : rmBoards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)
                }
                {(boardsByGroup.get(null) ?? []).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {loadingGrid ? (
              <p className="text-sm text-muted-foreground">Loading sheet…</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Row (item / product)</Label>
                    <select
                      className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={selectedRowId}
                      onChange={(e) => setSelectedRowId(e.target.value)}
                    >
                      {rmRows.map((r) => <option key={r.id} value={r.id}>{r.row_label}</option>)}
                      {rmRows.length === 0 && <option value="">— no rows —</option>}
                    </select>
                  </div>
                  <div>
                    <Label>Column (size / variant)</Label>
                    <select
                      className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={selectedColId}
                      onChange={(e) => setSelectedColId(e.target.value)}
                    >
                      {rmCols.map((c) => <option key={c.id} value={c.id}>{c.header_name}</option>)}
                      {rmCols.length === 0 && <option value="">— no columns —</option>}
                    </select>
                  </div>
                </div>

                <div>
                  <Label>Quantity to add back</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={rmQtyToAdd}
                    onChange={(e) => { setRmQtyToAdd(e.target.value); setErr(null); }}
                    className="mt-1 w-36"
                  />
                </div>
              </>
            )}

            {err && <p className="text-sm text-destructive">{err}</p>}

            {!loadingGrid && (
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>Cancel</Button>
                <Button onClick={saveReadyMade} disabled={saving || loadingGrid}>
                  {saving ? "Saving…" : "Confirm restock"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------
export function ReturnsClient({
  returnOrders: initialReturnOrders,
  completedOrders: initialCompleted,
  canEdit = true,
}: {
  returnOrders: Order[];
  completedOrders: Order[];
  invItems: InvItem[];
  rmGroups: RmGroup[];
  rmBoards: RmBoard[];
  canEdit?: boolean;
}) {
  const supabase = createClient();
  const [returnOrders, setReturnOrders] = useState<Order[]>(initialReturnOrders);
  const [completedOrders, setCompletedOrders] = useState<Order[]>(initialCompleted);
  const [tab, setTab] = useState<"returning" | "to_check" | "returned">("returning");
  const [platform, setPlatform] = useState<string>("Shopee");
  const [store, setStore] = useState<string>("all");
  const [afterType, setAfterType] = useState<string>("all");
  const [bsStatus, setBsStatus] = useState<string>("all");
  const [newReturnOpen, setNewReturnOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [forwardingId, setForwardingId] = useState<string | null>(null);
  const [bsUrl, setBsUrl] = useState("");
  const [bsUser, setBsUser] = useState("");
  const [bsPass, setBsPass] = useState("");
  const [showBsPass, setShowBsPass] = useState(false);
  const [bsSaving, setBsSaving] = useState(false);

  // Re-fetch on mount so navigating back always shows the latest persisted state
  useEffect(() => {
    async function refresh() {
      const [{ data: ro }, { data: co }] = await Promise.all([
        supabase
          .from("orders")
          .select(RETURN_ORDER_SELECT)
          .in("return_status", ["returning", "returned"])
          .order("updated_at", { ascending: false }),
        supabase
          .from("orders")
          .select("id,order_no,customer_name,kind,order_type,source,stage,status,total,down_payment,return_status,notes,waybill_no,external_order_no,sku_code,customer_social,updated_at,created_at")
          .or("stage.eq.completed,stage.eq.for_pickup,status.eq.delivered,status.eq.ready")
          .is("return_status", null)
          .order("updated_at", { ascending: false })
          .limit(200),
      ]);
      if (ro) setReturnOrders(ro as Order[]);
      if (co) setCompletedOrders(co as Order[]);
      const { data: settings } = await supabase
        .from("app_settings")
        .select("key,value")
        .in("key", [RETURNS_BS_URL, RETURNS_BS_USER, RETURNS_BS_PASS]);
      if (settings) {
        const map = new Map((settings as { key: string; value: string }[]).map((r) => [r.key, r.value ?? ""]));
        setBsUrl(map.get(RETURNS_BS_URL) ?? "");
        setBsUser(map.get(RETURNS_BS_USER) ?? "");
        setBsPass(map.get(RETURNS_BS_PASS) ?? "");
      }
    }
    void refresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toCheck = useMemo(
    () => returnOrders.filter((o) => pendingReturnStatusChange(o.return_import)),
    [returnOrders],
  );
  const returning = useMemo(
    () =>
      returnOrders.filter(
        (o) => !pendingReturnStatusChange(o.return_import) && restockTabStatus(o) === "returning",
      ),
    [returnOrders],
  );
  const returned = useMemo(
    () =>
      returnOrders.filter(
        (o) => !pendingReturnStatusChange(o.return_import) && restockTabStatus(o) === "returned",
      ),
    [returnOrders],
  );
  const tabList = tab === "to_check" ? toCheck : tab === "returning" ? returning : returned;

  const platformCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of tabList) m.set(orderPlatform(o), (m.get(orderPlatform(o)) || 0) + 1);
    return m;
  }, [tabList]);

  const platformList = useMemo(
    () => tabList.filter((o) => orderPlatform(o) === platform),
    [tabList, platform],
  );

  const storeNames = useMemo(() => {
    const extra = platformList.map(orderStore).filter(Boolean);
    return storesForPlatform(platform, extra);
  }, [platform, platformList]);

  const storeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of platformList) {
      const s = orderStore(o);
      if (!s) continue;
      m.set(normFilter(s), (m.get(normFilter(s)) || 0) + 1);
    }
    return m;
  }, [platformList]);

  const afterStoreList = useMemo(() => {
    if (store === "all") return platformList;
    return platformList.filter((o) => normFilter(orderStore(o)) === normFilter(store));
  }, [platformList, store]);

  const afterTypeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of afterStoreList) {
      const t = orderAfterSalesType(o);
      if (!t) continue;
      m.set(normFilter(t), (m.get(normFilter(t)) || 0) + 1);
    }
    return m;
  }, [afterStoreList]);

  const afterTypeNames = useMemo(() => {
    const extra = afterStoreList.map(orderAfterSalesType).filter(Boolean);
    return mergeFilterOptions(afterSalesTypesForPlatform(platform), extra);
  }, [platform, afterStoreList]);

  const afterTypeList = useMemo(() => {
    if (afterType === "all") return afterStoreList;
    return afterStoreList.filter((o) => normFilter(orderAfterSalesType(o)) === normFilter(afterType));
  }, [afterStoreList, afterType]);

  const bsStatusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of afterTypeList) {
      const s = orderBsReturnStatus(o);
      if (!s) continue;
      m.set(normFilter(s), (m.get(normFilter(s)) || 0) + 1);
    }
    return m;
  }, [afterTypeList]);

  const bsStatusNames = useMemo(() => {
    const extra = afterTypeList.map(orderBsReturnStatus).filter(Boolean);
    return mergeFilterOptions(returnStatusesForPlatform(platform), extra);
  }, [platform, afterTypeList]);

  const displayList = useMemo(() => {
    if (bsStatus === "all") return afterTypeList;
    return afterTypeList.filter((o) => normFilter(orderBsReturnStatus(o)) === normFilter(bsStatus));
  }, [afterTypeList, bsStatus]);

  function handleNewReturn(updated: Order) {
    setReturnOrders((prev) => [updated, ...prev]);
    setCompletedOrders((prev) => prev.filter((o) => o.id !== updated.id));
    setNewReturnOpen(false);
  }

  function handleImported(rows: Record<string, unknown>[]) {
    const incoming = rows as Order[];
    if (!incoming.length) return;
    setReturnOrders((prev) => {
      const map = new Map(prev.map((o) => [o.id, o]));
      for (const o of incoming) {
        if (o.return_status === "returning" || o.return_status === "returned") map.set(o.id, o);
        else map.delete(o.id);
      }
      return [...map.values()].sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    });
    setCompletedOrders((prev) => prev.filter((o) => !incoming.some((x) => x.id === o.id)));
    if (incoming.some((o) => pendingReturnStatusChange(o.return_import))) setTab("to_check");
  }

  async function revertToCompleted(order: Order) {
    setErr(null);
    const { error } = await supabase
      .from("orders")
      .update({ return_status: null, return_reason: null, updated_at: new Date().toISOString() })
      .eq("id", order.id);
    if (error) { setErr(error.message); return; }
    setReturnOrders((prev) => prev.filter((o) => o.id !== order.id));
    setCompletedOrders((prev) => [{ ...order, return_status: null, return_reason: null }, ...prev]);
  }

  async function markStatusChecked(order: Order) {
    const next = markReturnStatusChecked(order.return_import);
    if (!next) return;
    setErr(null);
    const { error } = await supabase
      .from("orders")
      .update({ return_import: next, updated_at: new Date().toISOString() })
      .eq("id", order.id);
    if (error) { setErr(error.message); return; }
    setReturnOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, return_import: next } : o)));
  }

  async function forwardTo(order: Order, dest: "to_check" | "returned") {
    setErr(null);
    setForwardingId(order.id);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updated_at: now };
    let nextOrder: Order = { ...order, updated_at: now };
    if (dest === "to_check") {
      const nextImport = forwardReturnToCheck(order.return_import, order.waybill_no || "");
      patch.return_status = "returning";
      patch.return_import = nextImport;
      nextOrder = { ...nextOrder, return_status: "returning", return_import: nextImport };
    } else {
      const nextImport = forwardReturnToSeller(order.return_import);
      patch.return_status = "returned";
      if (nextImport) patch.return_import = nextImport;
      nextOrder = {
        ...nextOrder,
        return_status: "returned",
        return_import: nextImport ?? order.return_import,
      };
    }
    let { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    if (error && /return_import/i.test(error.message) && dest === "returned") {
      const { return_import: _omit, ...rest } = patch;
      ({ error } = await supabase.from("orders").update(rest).eq("id", order.id));
    }
    setForwardingId(null);
    if (error) { setErr(error.message); return; }
    setReturnOrders((prev) => prev.map((o) => (o.id === order.id ? nextOrder : o)));
    setTab(dest === "to_check" ? "to_check" : "returned");
  }

  async function saveBsSetting(key: string, raw: string) {
    const value = raw.trim();
    setBsSaving(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) throw error;
      if (key === RETURNS_BS_URL) setBsUrl(value);
      if (key === RETURNS_BS_USER) setBsUser(value);
      if (key === RETURNS_BS_PASS) setBsPass(value);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save BigSeller login");
    } finally {
      setBsSaving(false);
    }
  }

  return (
    <>
      {newReturnOpen && (
        <NewReturnDialog
          completedOrders={completedOrders}
          onClose={() => setNewReturnOpen(false)}
          onCreated={handleNewReturn}
        />
      )}

      {/* Header actions + tabs */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
          {([
            { id: "returning" as const, label: "Returning to seller", count: returning.length },
            { id: "to_check" as const, label: "To be checked", count: toCheck.length },
            { id: "returned" as const, label: "Returned to seller", count: returned.length },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                  tab === t.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <BigSellerReturnExcelImportButton canEdit={canEdit} onImported={handleImported} />
          <CsvExportDialog
            label="Export CSV"
            filename="returns"
            columns={[
              { header: "Order #",       value: (r: any) => r.order_no },
              { header: "Customer",      value: (r: any) => r.customer_name ?? "" },
              { header: "Channel",       value: (r: any) => r.kind ?? "" },
              { header: "Return Status", value: (r: any) => r.return_status ?? "" },
              { header: "Return Reason", value: (r: any) => r.return_reason ?? "" },
              { header: "Total",         value: (r: any) => r.total ?? 0 },
              { header: "Updated",       value: (r: any) => String(r.updated_at ?? "").slice(0, 10) },
            ]}
            fetchRows={(from, to) => {
              const all = [...returnOrders, ...completedOrders.filter((o: any) => o.return_status)];
              return all.filter((r: any) => {
                const d = String(r.updated_at ?? "").slice(0, 10);
                if (from && d < from) return false;
                if (to && d > to) return false;
                return true;
              });
            }}
          />
          {canEdit && (
            <Button className="gap-1.5" onClick={() => setNewReturnOpen(true)}>
              <PackageX className="h-4 w-4" />
              New return
            </Button>
          )}
        </div>
      </div>

      <details open className="mb-4 rounded-lg border bg-card px-3 py-2 text-sm">
        <summary className="cursor-pointer list-none font-medium text-foreground [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span>BigSeller login</span>
            <span className="text-[11px] font-normal text-muted-foreground">
              Open BigSeller to check return details
            </span>
          </span>
        </summary>
        <div className="mt-2 space-y-2.5 border-t border-border/50 pt-2">
          <CopyableField label="Link" value={bsUrl} href={bigsellerHref(bsUrl)} />
          <div className="grid gap-2 sm:grid-cols-2">
            <CopyableField label="Username" value={bsUser} />
            <CopyableField label="Password" value={bsPass} secret />
          </div>
          {canEdit && (
            <div className="grid gap-2 border-t border-border/50 pt-2 sm:grid-cols-2">
              <p className="text-[11px] text-muted-foreground sm:col-span-2">Edit login</p>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="returns-bs-url" className="text-[11px] text-muted-foreground">
                  Link
                </Label>
                <Input
                  id="returns-bs-url"
                  type="url"
                  disabled={bsSaving}
                  className="h-10 sm:h-8"
                  key={`bsurl:${bsUrl}`}
                  defaultValue={bsUrl}
                  placeholder="https://www.bigseller.com/"
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next === bsUrl.trim()) return;
                    void saveBsSetting(RETURNS_BS_URL, e.target.value);
                  }}
                  aria-label="BigSeller link"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="returns-bs-user" className="text-[11px] text-muted-foreground">
                  Username
                </Label>
                <Input
                  id="returns-bs-user"
                  type="text"
                  autoComplete="off"
                  disabled={bsSaving}
                  className="h-10 sm:h-8"
                  key={`bsuser:${bsUser}`}
                  defaultValue={bsUser}
                  placeholder="BigSeller username"
                  onBlur={(e) => {
                    const next = e.target.value.trim();
                    if (next === bsUser.trim()) return;
                    void saveBsSetting(RETURNS_BS_USER, e.target.value);
                  }}
                  aria-label="BigSeller username"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="returns-bs-pass" className="text-[11px] text-muted-foreground">
                  Password
                </Label>
                <div className="flex items-center gap-1">
                  <Input
                    id="returns-bs-pass"
                    type={showBsPass ? "text" : "password"}
                    autoComplete="new-password"
                    disabled={bsSaving}
                    className="h-10 sm:h-8"
                    key={`bspass:${bsPass}`}
                    defaultValue={bsPass}
                    placeholder="BigSeller password"
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next === bsPass.trim()) return;
                      void saveBsSetting(RETURNS_BS_PASS, e.target.value);
                    }}
                    aria-label="BigSeller password"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 w-10 shrink-0 px-0 sm:h-8 sm:w-8"
                    onClick={() => setShowBsPass((v) => !v)}
                    aria-label={showBsPass ? "Hide password" : "Show password"}
                  >
                    {showBsPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </details>

      <div className="mb-4 space-y-2.5 rounded-lg border bg-card px-3 py-3">
        <div className="flex flex-wrap gap-1 border-b border-border/60 pb-1">
          {RETURN_PLATFORMS.map((p) => {
            const count = platformCounts.get(p) || 0;
            const selected = platform === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setPlatform(p);
                  setStore("all");
                  setAfterType("all");
                  setBsStatus("all");
                }}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                  selected
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <PlatformGlyph platform={p} />
                {p}
                <span className="text-muted-foreground">({count})</span>
              </button>
            );
          })}
        </div>

        {platform !== "Manual After-Sales Order" && (
        <>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-32 shrink-0 text-sm text-muted-foreground">Store</span>
          <div className="flex min-w-0 flex-wrap gap-1">
            <FilterChip
              label="All"
              selected={store === "all"}
              onClick={() => { setStore("all"); setAfterType("all"); setBsStatus("all"); }}
            />
            {storeNames.map((name) => (
              <FilterChip
                key={name}
                label={name}
                count={storeCounts.get(normFilter(name)) || 0}
                selected={normFilter(store) === normFilter(name)}
                onClick={() => { setStore(name); setAfterType("all"); setBsStatus("all"); }}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-32 shrink-0 text-sm text-muted-foreground">After Sales Type</span>
          <div className="flex min-w-0 flex-wrap gap-1">
            <FilterChip
              label="All"
              selected={afterType === "all"}
              onClick={() => { setAfterType("all"); setBsStatus("all"); }}
            />
            {afterTypeNames.map((t) => (
              <FilterChip
                key={t}
                label={t}
                count={afterTypeCounts.get(normFilter(t)) || 0}
                selected={normFilter(afterType) === normFilter(t)}
                onClick={() => { setAfterType(t); setBsStatus("all"); }}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-32 shrink-0 text-sm text-muted-foreground">Return Status</span>
          <div className="flex min-w-0 flex-wrap gap-1">
            <FilterChip
              label="All"
              selected={bsStatus === "all"}
              onClick={() => setBsStatus("all")}
            />
            {bsStatusNames.map((s) => (
              <FilterChip
                key={s}
                label={s}
                count={bsStatusCounts.get(normFilter(s)) || 0}
                selected={normFilter(bsStatus) === normFilter(s)}
                onClick={() => setBsStatus(s)}
              />
            ))}
          </div>
        </div>
        </>
        )}
      </div>

      {err && (
        <div className="mb-3 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{err}</div>
      )}

      {tab === "returning" && (
        <p className="mb-3 text-sm text-muted-foreground">
          These orders are in transit back to you. Their sales are excluded from totals until resolved.
        </p>
      )}
      {tab === "to_check" && (
        <p className="mb-3 text-sm text-muted-foreground">
          Same tracking number, but return status changed since the last BigSeller import (for example the courier
          marked it Returned). Ask staff if the item really arrived. If it did not, report it to the courier.
        </p>
      )}
      {tab === "returned" && (
        <p className="mb-3 text-sm text-muted-foreground">
          These orders have been received back.
        </p>
      )}

      {/* Summary bar for returning tab */}
      {tab === "returning" && returning.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-4 rounded-lg border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-800 dark:bg-amber-900/10">
          <div>
            <div className="text-xs font-medium text-amber-700 dark:text-amber-400">Returns in transit</div>
            <div className="text-xl font-bold text-amber-700 dark:text-amber-400">{returning.length}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-amber-700 dark:text-amber-400">Sales withdrawn</div>
            <div className="text-xl font-bold text-amber-700 dark:text-amber-400">
              {peso(returning.reduce((s, o) => s + Number(o.total || 0), 0))}
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {displayList.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <PackageX className="mx-auto h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">
              {tabList.length === 0
                ? tab === "returning"
                  ? "No orders currently returning. Click \"New return\" to start one."
                  : tab === "to_check"
                    ? "No returns to check. Re-import BigSeller Excel when a tracking number's return status changes."
                    : "No orders marked as returned yet."
                : "No returns match these filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {displayList.map((o) => {
            const total = Number(o.total || 0);
            const paid = Number(o.down_payment || 0);
            const ref = o.return_inventory_ref as Record<string, unknown> | null;
            const statusChange = pendingReturnStatusChange(o.return_import);
            return (
              <Card key={o.id} className={statusChange ? "border-amber-400 dark:border-amber-700" : undefined}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">#{o.order_no}</span>
                        <span className="text-sm font-medium">{o.customer_name}</span>
                        <Badge variant="outline" className="text-xs">{orderKindLabel(o)}</Badge>
                        {tab !== "to_check" && restockTabStatus(o) === "returning" && (
                          <Badge variant="amber" className="text-xs">Returning to seller</Badge>
                        )}
                        {tab !== "to_check" && restockTabStatus(o) === "returned" && (
                          <Badge variant="green" className="text-xs">Returned ✓</Badge>
                        )}
                        {statusChange && (
                          <Badge variant="amber" className="text-xs">
                            To be checked: {statusChange.to}
                          </Badge>
                        )}
                      </div>
                      {statusChange && (
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs dark:border-amber-800 dark:bg-amber-900/20">
                          <div className="min-w-0 text-amber-950 dark:text-amber-100">
                            <div className="font-medium">
                              Return status changed to {statusChange.to} on this tracking number. Confirm with staff
                              if it really arrived. If the courier marked it returned but it did not, report it.
                            </div>
                            <div className="mt-0.5 text-amber-800 dark:text-amber-200">
                              {statusChange.from} → {statusChange.to}
                              {statusChange.trackingNo ? ` · Tracking ${statusChange.trackingNo}` : ""}
                            </div>
                          </div>
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 shrink-0 text-xs"
                              onClick={() => void markStatusChecked(o)}
                            >
                              Mark as checked
                            </Button>
                          )}
                        </div>
                      )}
                      {o.return_reason && !primaryImport(o) && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Reason: {o.return_reason}
                        </div>
                      )}
                      <ReturnImportDetails raw={o.return_import} />
                      {ref && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Restocked to:{" "}
                          {o.return_inventory_type === "inventory"
                            ? `Inventory — ${String(ref.item_name || "")} (+${ref.quantity})`
                            : `Ready-made — ${String(ref.board_name || "")} › ${String(ref.row_label || "")} › ${String(ref.col_name || "")} (+${ref.quantity})`
                          }
                        </div>
                      )}
                      <div className="mt-1 text-xs text-muted-foreground">
                        Updated: {formatDate(o.updated_at)}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-right">
                      <div className="text-sm">
                        <div className="font-mono font-semibold">{peso(total)}</div>
                        {paid > 0 && (
                          <div className="text-xs text-muted-foreground">Paid: {peso(paid)}</div>
                        )}
                      </div>

                      {tab === "returning" && canEdit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs text-muted-foreground"
                          onClick={() => revertToCompleted(o)}
                        >
                          Undo
                        </Button>
                      )}
                      {canEdit && tab !== "returned" && (
                        <>
                          {tab === "returning" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              disabled={forwardingId === o.id}
                              onClick={() => void forwardTo(o, "to_check")}
                            >
                              {forwardingId === o.id ? "Moving…" : "To be checked"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={forwardingId === o.id}
                            onClick={() => void forwardTo(o, "returned")}
                          >
                            {forwardingId === o.id ? "Moving…" : "Returned to seller"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
