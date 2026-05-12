"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { peso, formatDate, formatDateTime, formatSupabaseError } from "@/lib/utils";
import { parseBigSellerPrintedTimeFromPdfText } from "@/lib/bigseller-printed-time";
import { Eye, FileUp, Pencil, Plus, Table2, Trash2, ArrowRight } from "lucide-react";
import { BIGSELLER_KNOWN_STORES_SORTED } from "@/lib/bigseller-store-labels";
import { ADMIN_ORDERS_SELECT } from "@/lib/admin-orders-select";
import {
  ORDER_SERVICE_LABEL,
  ORDER_SERVICE_STAGES,
  defaultServiceStageFromSubStage,
  normalizeOrderServiceStage,
  nextOrderServiceStage,
} from "@/lib/order-services";

/** Local calendar day `YYYY-MM-DD` for date-range filters on `bigseller_printed_at`. */
function localDayKeyFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeOrderAssigneesRow(o: any) {
  const list = o.assignees;
  if (!Array.isArray(list)) return { ...o, assignees: o.assignees || [] };
  return {
    ...o,
    assignees: list.map((a: any) => ({
      user_id: a.user_id,
      profiles: Array.isArray(a.profiles) ? a.profiles[0] ?? null : a.profiles ?? null,
    })),
  };
}

function orderAssigneeNames(o: any): string {
  const parts = (o.assignees || []).map((a: any) => a.profiles?.full_name?.trim() || a.profiles?.email).filter(Boolean);
  if (parts.length) return parts.join(", ");
  return o.assigned?.full_name?.trim() || o.assigned?.email || "";
}

type Order = any;
type Emp = { id: string; full_name: string; email: string };
type ParsedBigSellerRow = {
  /** BigSeller pick-list line: first token (e.g. BSZG0B015124). Stored in `sku_code`. */
  bigsellerCode?: string;
  externalOrderNo?: string;
  orderSuffix: string;
  quantity: number;
  /** Item title from PDF (quoted product name block). Stored in `design_ref`. */
  title: string;
  /** Store / channel label after buyer message (e.g. "Likha. Tiktok") — matched to `stores`. */
  storeNameFromPdf?: string;
  variation?: string;
  shirtType?: "White shirt" | "Black shirt";
  shirtSize?: "small" | "medium" | "large" | "xlarge" | "2xlarge" | "3xlarge";
  unitPrice?: number;
  waybillNo?: string;
};

const KINDS = [
  { v: "local", label: "Walk-in", hint: "In-store purchases", variant: "blue" },
  {
    v: "online",
    label: "Online marketplace",
    hint: "Facebook Marketplace or Page (shop imports → BigSeller)",
    variant: "purple",
  },
  { v: "services", label: "Services", hint: "Embroidery, DTF, vinyl, numbering, other add-ons", variant: "amber" },
  { v: "sublimation", label: "Sublimation Order", hint: "Full sublimation pipeline", variant: "teal" },
] as const;

/** New / edit order dialog: three groups; DB still uses `local` | `online` under Walk In & Online. */
const ORDER_FORM_PRIMARY_KINDS = [
  {
    key: "walkin_online",
    label: "Walk In & Online",
    hint: "Walk-in (in-store) or online marketplace (Facebook) — separate channels; shop imports use BigSeller",
  },
  {
    key: "services",
    label: "Services",
    hint: "Embroidery, DTF, vinyl, numbering, other add-ons",
  },
  {
    key: "sublimation",
    label: "Sublimation order",
    hint: "Full sublimation production",
  },
] as const;

function orderFormPrimaryKey(kind: string): (typeof ORDER_FORM_PRIMARY_KINDS)[number]["key"] {
  if (kind === "local" || kind === "online") return "walkin_online";
  if (kind === "services") return "services";
  return "sublimation";
}

const ORDER_TOP_TABS = [
  { href: "/admin/orders?type=walkin_online", kind: "walkin_online" as const, label: "Walk In & Online" },
  { href: "/admin/orders?type=services", kind: "services" as const, label: "Services" },
  { href: "/admin/orders?type=sublimation", kind: "sublimation" as const, label: "Sublimation" },
  { href: "/admin/orders/bigseller", kind: "bigseller" as const, label: "BigSeller" },
] as const;

const SUB_STAGES = [
  { v: "design_layout", label: "Design & Layout" },
  { v: "printing", label: "Printing" },
  { v: "heatpress", label: "Heatpress" },
  { v: "cut_sew", label: "Cut & Sew" },
  { v: "reprint_error", label: "Reprint Error" },
  { v: "quality_control", label: "Packaging & Quality Control" },
] as const;

/** DB `sublimation_stage` order for admin “forward” (includes `for_pickup` after QC). */
const SUB_STAGE_FORWARD_ORDER = [
  "design_layout",
  "printing",
  "heatpress",
  "cut_sew",
  "reprint_error",
  "quality_control",
  "for_pickup",
] as const;

/** Sublimation sub-stages for bulk “set to status” (includes terminal `for_pickup`). */
const SUBLIMATION_BULK_TARGET_OPTIONS: { v: string; label: string }[] = [
  ...SUB_STAGES.map((s) => ({ v: s.v, label: s.label })),
  { v: "for_pickup", label: "For pick up" },
];

const LOCAL_STAGES = ORDER_SERVICE_STAGES;
/** Main orders: walk-in + non-BigSeller online in one list. BigSeller page uses `online` internally. */
type OrdersTabKind = "walkin_online" | "services" | "sublimation" | "online";
const VALID_ORDERS_TAB_KINDS = new Set<string>(["walkin_online", "services", "sublimation"]);

function normalizeOrdersTabKind(
  raw: string | null | undefined,
  initial: string | undefined,
  pathname: string | null | undefined,
): OrdersTabKind {
  if (pathname?.includes("/admin/orders/bigseller")) return "online";
  const fromParam = String(raw ?? "").trim().toLowerCase();
  if (fromParam === "local" || fromParam === "online") return "walkin_online";
  if (fromParam && VALID_ORDERS_TAB_KINDS.has(fromParam)) return fromParam as OrdersTabKind;
  const ini = String(initial ?? "").trim().toLowerCase();
  if (ini === "local" || ini === "online") return "walkin_online";
  if (ini && VALID_ORDERS_TAB_KINDS.has(ini)) return ini as OrdersTabKind;
  return "walkin_online";
}

function stageOptions(kind: OrdersTabKind) {
  if (kind === "sublimation") return [] as const;
  if (kind === "walkin_online" || kind === "online" || kind === "services") return LOCAL_STAGES;
  return [] as const;
}

function getOrderKind(order: any): "local" | "online" | "sublimation" | "services" {
  const raw = String(order?.kind ?? order?.order_type ?? "local").toLowerCase().trim();
  if (raw === "online" || raw === "sublimation" || raw === "services") return raw;
  return "local";
}

function orderStatusHighlightVariant(order: any): "outline" | "amber" | "blue" | "green" | "red" | "teal" {
  if (String(order?.status || "").toLowerCase() === "cancelled") return "red";
  const kind = getOrderKind(order);
  if (kind === "sublimation") {
    const sub = String(order?.sub_stage || "").toLowerCase().trim();
    if (sub === "for_pickup") return "green";
    if (sub === "quality_control") return "teal";
    if (sub === "reprint_error") return "red";
    if (sub === "printing" || sub === "heatpress" || sub === "cut_sew") return "blue";
    if (sub === "design_layout") return "amber";
    return "outline";
  }
  const stage = normalizeOrderServiceStage(order?.stage);
  if (stage === "completed") return "green";
  if (stage === "for_pickup") return "teal";
  if (stage === "printing" || stage === "qc_packaging") return "blue";
  if (stage === "design_layout") return "amber";
  return "outline";
}

function mergedServiceStageForSub(currentStage: string | null | undefined, nextSub: string) {
  const cur = normalizeOrderServiceStage(currentStage);
  const fromSub = defaultServiceStageFromSubStage(nextSub);
  const i1 = ORDER_SERVICE_STAGES.indexOf(cur);
  const i2 = ORDER_SERVICE_STAGES.indexOf(fromSub);
  return ORDER_SERVICE_STAGES[Math.max(i1, i2)];
}

type OrderForwardPatch = { stage: string; sub_stage?: string | null };

function computeOrderForwardUpdate(order: Order): OrderForwardPatch | null {
  if (String(order?.status || "").toLowerCase() === "cancelled") return null;
  const kind = getOrderKind(order);
  if (kind === "sublimation") {
    const curSub = String(order.sub_stage || "design_layout");
    let idx = (SUB_STAGE_FORWARD_ORDER as readonly string[]).indexOf(curSub);
    if (idx < 0) idx = 0;
    if (idx < SUB_STAGE_FORWARD_ORDER.length - 1) {
      const nextSub = SUB_STAGE_FORWARD_ORDER[idx + 1]!;
      return {
        sub_stage: nextSub,
        stage: mergedServiceStageForSub(order.stage, nextSub),
      };
    }
    const nextStage = nextOrderServiceStage(order.stage);
    if (!nextStage) return null;
    return { stage: nextStage, sub_stage: SUB_STAGE_FORWARD_ORDER[0] };
  }
  const nextStage = nextOrderServiceStage(order.stage);
  if (!nextStage) return null;
  return { stage: nextStage };
}

/** Set pipeline to a chosen step (bulk forward). Allows moving to any listed stage, not only “next”. */
function computeOrderTargetUpdate(order: Order, target: string): OrderForwardPatch | null {
  if (String(order?.status || "").toLowerCase() === "cancelled") return null;
  const t = String(target || "").trim();
  if (!t) return null;
  const kind = getOrderKind(order);
  if (kind === "sublimation") {
    if (!(SUB_STAGE_FORWARD_ORDER as readonly string[]).includes(t)) return null;
    return {
      sub_stage: t,
      stage: mergedServiceStageForSub(order.stage, t),
    };
  }
  const normalized = normalizeOrderServiceStage(t);
  if (!(ORDER_SERVICE_STAGES as readonly string[]).includes(normalized)) return null;
  return { stage: normalized, sub_stage: null };
}

function canForwardOrder(order: Order): boolean {
  return computeOrderForwardUpdate(order) != null;
}

/** BigSeller PDF imports (same rule as /admin/orders/bigseller server query). */
function isBigSellerOnlineOrder(order: any): boolean {
  if (getOrderKind(order) !== "online") return false;
  const src = String(order?.source || "").toLowerCase();
  if (src.includes("bigseller")) return true;
  const notes = String(order?.notes || "").toLowerCase();
  if (notes.includes("imported from bigseller pdf")) return true;
  // Broader match if notes wording changes slightly but still mentions BigSeller + PDF import.
  if (notes.includes("bigseller") && notes.includes("pdf") && notes.includes("import")) return true;
  return false;
}

function isBigSellerNoiseLine(line: string) {
  const x = line.trim();
  if (!x) return true;
  if (x === "--") return true;
  if (/^no\.$/i.test(x)) return true;
  if (/^\d+$/.test(x)) return true;
  if (/^item\b/i.test(x)) return true;
  if (/^sku\b/i.test(x)) return true;
  if (/^shelf\b/i.test(x)) return true;
  if (/^qty\b/i.test(x)) return true;
  if (/^summary list\b/i.test(x)) return true;
  if (/^package qty:/i.test(x)) return true;
  if (/^print:/i.test(x)) return true;
  if (/^https?:\/\//i.test(x)) return true;
  if (/^-- \d+ of \d+ --$/i.test(x)) return true;
  if (/^5\/\d+\/\d+,\s*\d+:\d+/i.test(x)) return true;
  if (/^bigseller\s*-\s*orders/i.test(x)) return true;
  if (/^\*abcd/i.test(x)) return true;
  return false;
}

function parsePesoLikeNumber(line: string): number | null {
  const m = line.match(/PHP\s*([0-9][0-9,]*(?:\.[0-9]+)?)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function normalizeShirtType(raw: string): "White shirt" | "Black shirt" | undefined {
  const x = raw.toLowerCase();
  if (x.includes("white shirt")) return "White shirt";
  if (x.includes("black shirt")) return "Black shirt";
  return undefined;
}

function normalizeShirtSize(raw: string): "small" | "medium" | "large" | "xlarge" | "2xlarge" | "3xlarge" | undefined {
  const x = raw.toLowerCase().replace(/\s+/g, "");
  if (/(^|[^a-z0-9])s($|[^a-z0-9])/.test(raw.toLowerCase()) || x.includes("small")) return "small";
  if (x.includes("medium")) return "medium";
  if (x.includes("3x-large") || x.includes("3xlarge") || x.includes("xxxl")) return "3xlarge";
  if (x.includes("2x-large") || x.includes("2xlarge") || x.includes("xxl")) return "2xlarge";
  if (x.includes("x-large") || x.includes("xlarge") || x.includes("xl")) return "xlarge";
  if (x.includes("large")) return "large";
  return undefined;
}

function splitTypeSize(variation: string | undefined): Pick<ParsedBigSellerRow, "shirtType" | "shirtSize"> {
  if (!variation) return {};
  return {
    shirtType: normalizeShirtType(variation),
    shirtSize: normalizeShirtSize(variation),
  };
}

/**
 * Footer / segment: `Buyer Message: …  Likha. Tiktok`
 * Prefers known store labels (longest match first); otherwise last tab- or wide-space chunk.
 */
function parseStoreNameFromBuyerMessageLine(line: string): string | undefined {
  const m = line.match(/^Buyer Message:\s*(.+)$/i);
  if (!m) return undefined;
  const rest = m[1].trim();
  const lower = rest.toLowerCase();
  for (const name of BIGSELLER_KNOWN_STORES_SORTED) {
    if (lower.includes(name.toLowerCase())) return name;
  }
  const byWide = rest.split(/\s{2,}|\t+/).map((s) => s.trim()).filter(Boolean);
  if (byWide.length >= 2) return byWide[byWide.length - 1];
  return undefined;
}

type StoreOption = { id: string; name: string; pdf_label?: string | null };

function resolveStoreId(stores: StoreOption[], pdfName: string | undefined): { id: string | null; matchedName: string | null } {
  if (!pdfName?.trim() || stores.length === 0) return { id: null, matchedName: null };
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const target = norm(pdfName);

  type Labeled = { s: StoreOption; pn: string };
  const labeled: Labeled[] = [];
  for (const s of stores) {
    const pl = s.pdf_label?.trim();
    if (!pl) continue;
    labeled.push({ s, pn: norm(pl) });
  }
  for (const { s, pn } of labeled) {
    if (pn === target) return { id: s.id, matchedName: s.name };
  }
  const containedInTarget = labeled
    .filter((x) => target.includes(x.pn))
    .sort((a, b) => b.pn.length - a.pn.length);
  if (containedInTarget[0]) return { id: containedInTarget[0].s.id, matchedName: containedInTarget[0].s.name };
  const targetInLabel = labeled
    .filter((x) => x.pn.includes(target))
    .sort((a, b) => b.pn.length - a.pn.length);
  if (targetInLabel[0]) return { id: targetInLabel[0].s.id, matchedName: targetInLabel[0].s.name };

  let canonical = pdfName.trim();
  for (const name of BIGSELLER_KNOWN_STORES_SORTED) {
    if (target.includes(name.toLowerCase())) {
      canonical = name;
      break;
    }
  }
  const cnorm = norm(canonical);

  for (const s of stores) {
    if (norm(s.name) === cnorm) return { id: s.id, matchedName: s.name };
  }
  for (const s of stores) {
    const n = norm(s.name);
    if (n === cnorm || n.includes(cnorm) || cnorm.includes(n)) return { id: s.id, matchedName: s.name };
  }
  return { id: null, matchedName: null };
}

function pickRowQualityScore(r: ParsedBigSellerRow): number {
  let s = 0;
  if (r.waybillNo) s += 20;
  if (r.bigsellerCode) s += 10;
  if (r.unitPrice && r.unitPrice > 0) s += 8;
  const t = (r.title || "").trim();
  if (t.length > 15) s += 5;
  if (t && !/^BigSeller item\s+\d{4}$/i.test(t)) s += 6;
  if (r.variation) s += 2;
  if (r.storeNameFromPdf) s += 1;
  return s;
}

/** One row per marketplace order no.; keeps the parse with the most real fields. */
function dedupeBigSellerRows(rows: ParsedBigSellerRow[]): ParsedBigSellerRow[] {
  const m = new Map<string, ParsedBigSellerRow>();
  for (const r of rows) {
    const key = (r.externalOrderNo && String(r.externalOrderNo).trim()) || `sfx-${r.orderSuffix}`;
    const prev = m.get(key);
    if (!prev || pickRowQualityScore(r) > pickRowQualityScore(prev)) m.set(key, r);
  }
  return [...m.values()];
}

function tryMatchPickHeader(chunk: string) {
  const c = chunk.replace(/\s+/g, " ").trim();
  return (
    c.match(/^([A-Z0-9]{6,})\s+Order No\.?\s*:?\s*(\d{8,})\b.*?\(#([^)]+)\)/i) ||
    c.match(/\b([A-Z0-9]{6,})\s+Order No\.?\s*:?\s*(\d{8,})\b.*?\(#([^)]+)\)/i)
  );
}

/**
 * pdf.js often emits one text item per word; line-based joins miss pick headers.
 * Collapse whitespace and find each header + following block up to the next header.
 */
function parsePickListCollapsed(rawText: string): ParsedBigSellerRow[] {
  const flat = rawText.replace(/\s+/g, " ").trim();
  const headerRe = /\b([A-Z0-9]{6,})\s+Order No\.?\s*:?\s*(\d{8,})\b.*?\(#([^)]+)\)/gi;
  const headers = [...flat.matchAll(headerRe)];
  const out: ParsedBigSellerRow[] = [];
  const seenOrder = new Set<string>();

  for (let i = 0; i < headers.length; i++) {
    const m = headers[i];
    const bigsellerCode = m[1];
    const orderNo = m[2];
    const waybillNo = m[3];
    if (seenOrder.has(orderNo)) continue;
    seenOrder.add(orderNo);
    const headerEnd = (m.index ?? 0) + m[0].length;
    const nextStart = i + 1 < headers.length ? (headers[i + 1].index ?? flat.length) : flat.length;
    const segment = flat.slice(headerEnd, nextStart);

    const quotes = [...segment.matchAll(/"([^"]{4,})"/g)].map((x) => x[1].trim());
    const title = quotes.join(" ").trim();

    let variation: string | undefined;
    const vm = segment.match(/--\s*([\s\S]*?)\s*--\s*PHP/i);
    if (vm) variation = vm[1].replace(/\s+--\s*$/g, "").trim();

    const unit = parsePesoLikeNumber(segment) ?? undefined;
    const ttl = segment.match(/Total:\s*(\d+)/i);
    const quantity = ttl ? Number(ttl[1]) || 1 : 1;

    let storeNameFromPdf: string | undefined;
    const bm = segment.match(/Buyer Message:\s*(.+?)(?=Total:|$)/i);
    if (bm) storeNameFromPdf = parseStoreNameFromBuyerMessageLine(`Buyer Message: ${bm[1].trim()}`);

    const ts = splitTypeSize(variation);

    out.push({
      orderSuffix: orderNo.slice(-4),
      externalOrderNo: orderNo,
      quantity,
      title: title || `BigSeller item ${orderNo.slice(-4)}`,
      bigsellerCode,
      waybillNo,
      variation,
      shirtType: ts.shirtType,
      shirtSize: ts.shirtSize,
      unitPrice: unit,
      storeNameFromPdf,
    });
  }
  return out;
}

function parseBigSellerRowsFromText(rawText: string): ParsedBigSellerRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const isPickListDoc = /\bPICK\s+LIST\b/i.test(rawText);

  if (!isPickListDoc) {
    const summaryOut: ParsedBigSellerRow[] = [];
    let titleParts: string[] = [];

    // Format A: "Summary list" where marker is "*1234 : 1".
    for (const line of lines) {
      const marker = line.match(/^\*(\d{4})\s*:\s*(\d+)$/);
      if (marker) {
        const suffix = marker[1];
        const qty = Number(marker[2] || 1) || 1;
        const title = titleParts.join(" ").replace(/\s+/g, " ").trim();
        summaryOut.push({
          orderSuffix: suffix,
          quantity: qty,
          title: title || `BigSeller item ${suffix}`,
        });
        titleParts = [];
        continue;
      }
      if (isBigSellerNoiseLine(line)) continue;
      titleParts.push(line);
    }

    if (summaryOut.length > 0) return dedupeBigSellerRows(summaryOut);
  }

  // Format B: PICK LIST — prefer collapsed scan (works with pdf.js per-word lines).
  if (isPickListDoc) {
    const collapsed = parsePickListCollapsed(rawText);
    if (collapsed.length > 0) return dedupeBigSellerRows(collapsed);
  }

  // Format B (fallback): line-by-line when collapsed scan finds nothing.
  //   <BigSeller code>  Order No. <marketplace order no>  <Courier> (#<waybill>)
  const pickOut: ParsedBigSellerRow[] = [];
  let inRow = false;
  let current: ParsedBigSellerRow = {
    orderSuffix: "",
    quantity: 1,
    title: "",
  };
  let currentTitleParts: string[] = [];

  function flushPickRow() {
    if (!inRow || !current.orderSuffix) return;
    const title = currentTitleParts.join(" ").replace(/\s+/g, " ").trim();
    pickOut.push({ ...current, title: title || `BigSeller item ${current.orderSuffix}` });
    inRow = false;
    current = { orderSuffix: "", quantity: 1, title: "" };
    currentTitleParts = [];
  }

  let waitingPrice = false;
  let lastEmittedOrderNo = "";
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const prev = lines[i - 1] || "";
    const next = lines[i + 1] || "";
    const joinedBack1 = `${prev} ${line}`.trim();
    const joinedFwd1 = `${line} ${next}`.trim();
    const joined3 = `${prev} ${line} ${next}`.trim();

    // Only join 1–2 lines: a 3-line forward window can see the *next* order header while still
    // on the current item title and open duplicate rows.
    const pickHeader =
      tryMatchPickHeader(line) ||
      tryMatchPickHeader(joinedFwd1) ||
      tryMatchPickHeader(joinedBack1) ||
      tryMatchPickHeader(joined3);

    if (pickHeader) {
      const orderNo = pickHeader[2];
      if (orderNo === lastEmittedOrderNo) continue;
      lastEmittedOrderNo = orderNo;
      const bigsellerCode = pickHeader[1];
      const waybillNo = pickHeader[3];
      flushPickRow();
      inRow = true;
      current = {
        orderSuffix: orderNo.slice(-4),
        externalOrderNo: orderNo,
        quantity: 1,
        title: "",
        bigsellerCode: bigsellerCode || undefined,
        waybillNo,
      };
      continue;
    }
    if (!inRow) continue;

    const qtyLine = line.match(/^Total:\s*(\d+)$/i);
    if (qtyLine) {
      current.quantity = Number(qtyLine[1] || 1) || 1;
      flushPickRow();
      continue;
    }

    const priceNum = parsePesoLikeNumber(line);
    if (priceNum != null) {
      current.unitPrice = priceNum;
      waitingPrice = false;
      continue;
    }
    if (/PHP\s*$/i.test(line)) {
      waitingPrice = true;
      continue;
    }
    if (waitingPrice && /^\d+(?:\.\d+)?$/.test(line)) {
      current.unitPrice = Number(line);
      waitingPrice = false;
      continue;
    }

    if (/^Buyer Message:/i.test(line)) {
      const storeName = parseStoreNameFromBuyerMessageLine(line);
      if (storeName) current.storeNameFromPdf = storeName;
      continue;
    }

    if (/^--\s*$/.test(line)) continue;
    if (/^--\s*PHP\b/i.test(line)) continue;

    // Variation lines often look like "-- Black Shirt, 3X-Large"
    if (line.includes(",") && !line.includes("Order No.") && !line.startsWith("\"")) {
      current.variation = line.replace(/^\s*--\s*/, "").replace(/\s+--\s*$/g, "").trim();
      const split = splitTypeSize(current.variation);
      current.shirtType = split.shirtType;
      current.shirtSize = split.shirtSize;
      continue;
    }

    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line)) continue;
    if (/^Item\b/i.test(line)) continue;
    if (/^PICK LIST\b/i.test(line)) continue;
    if (/^SKU Qty:/i.test(line)) continue;
    if (/^Package Qty:/i.test(line)) continue;
    if (/^Total Items:/i.test(line)) continue;
    if (/^Printed Time:/i.test(line)) continue;
    if (/^PHP\b/i.test(line)) continue;
    if (/^\d+(\.\d+)?$/.test(line)) continue;
    if (/^\d+$/.test(line)) continue;
    if (/\bJ&T Express\b/i.test(line)) continue;
    if (/^[A-Z0-9]{8,}\b/.test(line)) continue;

    currentTitleParts.push(line);
  }
  flushPickRow();
  return dedupeBigSellerRows(pickOut);
}

export function OrdersClient({
  initialOrders,
  employees,
  initialKind,
  defaultSearch,
  hideKindTabs = false,
}: {
  initialOrders: Order[];
  employees: Emp[];
  initialKind?: OrdersTabKind;
  defaultSearch?: string;
  hideKindTabs?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>(() => (initialOrders || []).map(normalizeOrderAssigneesRow));
  const [stageFilter, setStageFilter] = useState<"all" | string>("all");
  const [kindFilter, setKindFilter] = useState<OrdersTabKind>(() =>
    normalizeOrdersTabKind(params.get("type"), initialKind, pathname),
  );
  const [search, setSearch] = useState(defaultSearch || "");
  const [printedFrom, setPrintedFrom] = useState("");
  const [printedTo, setPrintedTo] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [selectedOnlineIds, setSelectedOnlineIds] = useState<Set<string>>(() => new Set());
  /** Walk In & Online, Services, Sublimation tables (not BigSeller / online-only tab). */
  const [selectedListOrderIds, setSelectedListOrderIds] = useState<Set<string>>(() => new Set());
  const [onlineIdentifiersOrder, setOnlineIdentifiersOrder] = useState<Order | null>(null);
  /** Bulk “Forward selected”: pipeline step to apply (services stages or sublimation `sub_stage`). */
  const [bulkForwardTarget, setBulkForwardTarget] = useState("");

  useEffect(() => {
    setBulkForwardTarget("");
  }, [kindFilter]);

  useEffect(() => {
    const raw = params.get("type");
    const normalized = normalizeOrdersTabKind(raw ?? undefined, initialKind, pathname);
    if (raw != null && String(raw).trim() !== "" && String(raw).trim().toLowerCase() !== normalized) {
      if (pathname?.includes("/admin/orders/bigseller")) router.replace("/admin/orders/bigseller");
      else router.replace(`/admin/orders?type=${normalized}`);
    }
    setKindFilter(normalized);
    setStageFilter("all");
  }, [params, initialKind, pathname, router]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const k = getOrderKind(o);

      if (kindFilter === "walkin_online") {
        if (k !== "local" && k !== "online") return false;
        if (k === "online" && isBigSellerOnlineOrder(o)) return false;
      } else if (kindFilter === "online") {
        if (k !== "online") return false;
        if (!isBigSellerOnlineOrder(o)) return false;
      } else if (k !== kindFilter) {
        return false;
      }

      if (stageFilter !== "all") {
        if (k === "sublimation") {
          if (String(o.sub_stage || "") !== stageFilter) return false;
        } else {
          if (normalizeOrderServiceStage(o.stage) !== stageFilter) return false;
        }
      }

      if (search) {
        const s = search.toLowerCase();
        const printed = o.bigseller_printed_at ? formatDateTime(o.bigseller_printed_at).toLowerCase() : "";
        const blob = [
          o.customer_name,
          String(o.order_no),
          o.external_order_no,
          o.waybill_no,
          o.sku_code,
          o.variation,
          o.shirt_type,
          o.shirt_size,
          o.source,
          o.notes,
          o.store?.name,
          printed,
          String(o.bigseller_printed_at || ""),
        ]
          .map((x) => String(x || ""))
          .join(" ")
          .toLowerCase();
        if (!blob.includes(s)) return false;
      }

      if (hideKindTabs && (printedFrom || printedTo)) {
        const pk = localDayKeyFromIso(o.bigseller_printed_at);
        // Rows without a parsed printed time still count as BigSeller orders — do not hide them when filtering by date.
        if (pk) {
          if (printedFrom && pk < printedFrom) return false;
          if (printedTo && pk > printedTo) return false;
        }
      }

      return true;
    });
  }, [orders, kindFilter, stageFilter, search, hideKindTabs, printedFrom, printedTo]);

  useEffect(() => {
    if (kindFilter === "online") setSelectedListOrderIds(new Set());
    else setSelectedOnlineIds(new Set());
  }, [kindFilter]);

  const visibleOnlineIds = useMemo(
    () => (kindFilter === "online" ? filtered.map((o) => o.id) : []),
    [kindFilter, filtered],
  );

  useEffect(() => {
    if (kindFilter !== "online") return;
    const allowed = new Set(visibleOnlineIds);
    setSelectedOnlineIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (allowed.has(id)) next.add(id);
      }
      if (next.size === prev.size && [...prev].every((id) => next.has(id))) return prev;
      return next;
    });
  }, [kindFilter, visibleOnlineIds]);

  const visibleListOrderIds = useMemo(
    () => (kindFilter !== "online" ? filtered.map((o) => o.id) : []),
    [kindFilter, filtered],
  );

  useEffect(() => {
    if (kindFilter === "online") return;
    const allowed = new Set(visibleListOrderIds);
    setSelectedListOrderIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (allowed.has(id)) next.add(id);
      }
      if (next.size === prev.size && [...prev].every((id) => next.has(id))) return prev;
      return next;
    });
  }, [kindFilter, visibleListOrderIds]);

  async function refresh() {
    const onBigSellerPage = hideKindTabs && pathname?.includes("/admin/orders/bigseller");
    // BigSeller: fetch recent rows and filter in-app (server list uses `BIGSELLER_ORDERS_OR_FILTER` in bigseller/page).
    const q = supabase.from("orders").select(ADMIN_ORDERS_SELECT).order("created_at", { ascending: false }).limit(8000);
    const { data, error } = await q;
    if (error) {
      console.error(error);
      alert(`Could not reload orders: ${error.message}`);
      return;
    }
    let list = ((data as any[]) || []).map(normalizeOrderAssigneesRow);
    if (onBigSellerPage) {
      list = list.filter((o) => isBigSellerOnlineOrder(o));
    }
    setOrders(list);
  }
  async function remove(id: string) {
    if (!confirm("Delete this order?")) return;
    await supabase.from("orders").delete().eq("id", id);
    setSelectedOnlineIds((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    setSelectedListOrderIds((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
    refresh();
  }

  function toggleOnlineRowSelected(id: string) {
    setSelectedOnlineIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleSelectAllVisibleOnline() {
    if (kindFilter !== "online") return;
    const ids = visibleOnlineIds;
    const allOn = ids.length > 0 && ids.every((id) => selectedOnlineIds.has(id));
    if (allOn) setSelectedOnlineIds(new Set());
    else setSelectedOnlineIds(new Set(ids));
  }

  async function removeSelectedOnline() {
    const ids = [...selectedOnlineIds];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected order(s)? This cannot be undone.`)) return;
    const { error } = await supabase.from("orders").delete().in("id", ids);
    if (error) {
      alert(error.message);
      return;
    }
    setSelectedOnlineIds(new Set());
    refresh();
  }

  function toggleListRowSelected(id: string) {
    setSelectedListOrderIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleSelectAllVisibleList() {
    if (kindFilter === "online") return;
    const ids = visibleListOrderIds;
    const allOn = ids.length > 0 && ids.every((id) => selectedListOrderIds.has(id));
    if (allOn) setSelectedListOrderIds(new Set());
    else setSelectedListOrderIds(new Set(ids));
  }

  async function removeSelectedListOrders() {
    const ids = [...selectedListOrderIds];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected order(s)? This cannot be undone.`)) return;
    const { error } = await supabase.from("orders").delete().in("id", ids);
    if (error) {
      alert(error.message);
      return;
    }
    setSelectedListOrderIds(new Set());
    refresh();
  }

  async function forwardOrdersByIds(ids: string[], target: string) {
    const trimmed = String(target || "").trim();
    if (!trimmed) {
      alert("Choose a status in the dropdown, then click Forward selected.");
      return;
    }
    const updates: Array<{ id: string; patch: OrderForwardPatch }> = [];
    for (const id of ids) {
      const o = orders.find((x) => x.id === id);
      if (!o) continue;
      const patch = computeOrderTargetUpdate(o, trimmed);
      if (patch) updates.push({ id, patch });
    }
    if (updates.length === 0) {
      alert("None of the selected orders could be set to that status (e.g. cancelled rows are skipped).");
      return;
    }
    for (const { id, patch } of updates) {
      const { error } = await supabase.from("orders").update(patch).eq("id", id);
      if (error) {
        alert(formatSupabaseError(error));
        void refresh();
        return;
      }
    }
    setBulkForwardTarget("");
    await refresh();
  }

  async function forwardOrderRow(o: Order) {
    const patch = computeOrderForwardUpdate(o);
    if (!patch) return;
    const { error } = await supabase.from("orders").update(patch).eq("id", o.id);
    if (error) {
      alert(formatSupabaseError(error));
      return;
    }
    await refresh();
  }

  async function forwardSelectedListOrders() {
    const ids = [...selectedListOrderIds];
    if (ids.length === 0) return;
    await forwardOrdersByIds(ids, bulkForwardTarget);
    setSelectedListOrderIds(new Set());
  }

  async function forwardSelectedOnline() {
    const ids = [...selectedOnlineIds];
    if (ids.length === 0) return;
    await forwardOrdersByIds(ids, bulkForwardTarget);
    setSelectedOnlineIds(new Set());
  }

  function openEditSelectedListOrder() {
    const ids = [...selectedListOrderIds];
    if (ids.length !== 1) return;
    const o = filtered.find((x) => x.id === ids[0]);
    if (!o) return;
    setEditing(o);
    setOpen(true);
  }

  function openEditSelectedOnlineOrder() {
    const ids = [...selectedOnlineIds];
    if (ids.length !== 1) return;
    const o = filtered.find((x) => x.id === ids[0]);
    if (!o) return;
    setEditing(o);
    setOpen(true);
  }

  const bulkForwardStatusSelect = (
    <select
      className="h-9 max-w-[min(100%,14rem)] rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      value={bulkForwardTarget}
      onChange={(e) => setBulkForwardTarget(e.target.value)}
      aria-label="Target status for selected orders"
    >
      <option value="">Choose status…</option>
      {kindFilter === "sublimation"
        ? SUBLIMATION_BULK_TARGET_OPTIONS.map(({ v, label }) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))
        : ORDER_SERVICE_STAGES.map((v) => (
            <option key={v} value={v}>
              {ORDER_SERVICE_LABEL[v] || v}
            </option>
          ))}
    </select>
  );

  return (
    <>
      <div className="mb-4 border-b">
        <div className="flex flex-wrap items-end gap-1">
          {ORDER_TOP_TABS.map((t) => {
            const onBigSeller = pathname?.includes("/admin/orders/bigseller") ?? false;
            const active =
              t.kind === "bigseller" ? onBigSeller : !onBigSeller && kindFilter === t.kind;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={
                  "relative inline-flex px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2 " +
                  (active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground")
                }
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(() => {
            const k = kindFilter;
            const pills: Array<{ v: string; label: string }> = [{ v: "all", label: "All" }];
            if (k === "sublimation") {
              SUB_STAGES.forEach((s) => pills.push({ v: s.v, label: s.label }));
            } else {
              stageOptions(k).forEach((v) => pills.push({ v, label: ORDER_SERVICE_LABEL[v] || v }));
            }
            return (
              <>
                {k !== "sublimation" && (
                  <span className="text-xs font-medium text-muted-foreground">Status</span>
                )}
                {pills.map((p) => (
                  <button
                    key={p.v}
                    onClick={() => setStageFilter(p.v)}
                    className={
                      "rounded-full border px-3 py-1 text-xs transition-colors " +
                      (stageFilter === p.v ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-accent")
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </>
            );
          })()}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder={hideKindTabs ? "Search orders, printed time, waybill…" : "Search customer or #"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          {hideKindTabs && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="whitespace-nowrap">Printed</span>
              <Input
                type="date"
                className="h-9 w-[148px]"
                value={printedFrom}
                onChange={(e) => setPrintedFrom(e.target.value)}
                aria-label="Printed from date"
              />
              <span>–</span>
              <Input
                type="date"
                className="h-9 w-[148px]"
                value={printedTo}
                onChange={(e) => setPrintedTo(e.target.value)}
                aria-label="Printed to date"
              />
            </div>
          )}
          {kindFilter === "online" && selectedOnlineIds.size > 0 && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={selectedOnlineIds.size !== 1}
                title={
                  selectedOnlineIds.size === 1
                    ? "Edit selected order"
                    : "Select exactly one order to edit here, or use the row pencil."
                }
                onClick={() => openEditSelectedOnlineOrder()}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit selected
              </Button>
              {bulkForwardStatusSelect}
              <Button
                type="button"
                variant="outline"
                disabled={!bulkForwardTarget.trim()}
                title="Set each selected order to the status chosen in the dropdown"
                onClick={() => void forwardSelectedOnline()}
              >
                <ArrowRight className="h-3.5 w-3.5" /> Forward selected
              </Button>
              <Button type="button" variant="destructive" onClick={() => void removeSelectedOnline()}>
                <Trash2 className="h-3.5 w-3.5" /> Delete selected ({selectedOnlineIds.size})
              </Button>
            </>
          )}
          {kindFilter !== "online" && selectedListOrderIds.size > 0 && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={selectedListOrderIds.size !== 1}
                title={
                  selectedListOrderIds.size === 1
                    ? "Edit selected order"
                    : "Select exactly one order to edit here, or use the row pencil."
                }
                onClick={() => openEditSelectedListOrder()}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit selected
              </Button>
              {bulkForwardStatusSelect}
              <Button
                type="button"
                variant="outline"
                disabled={!bulkForwardTarget.trim()}
                title="Set each selected order to the status chosen in the dropdown"
                onClick={() => void forwardSelectedListOrders()}
              >
                <ArrowRight className="h-3.5 w-3.5" /> Forward selected
              </Button>
              <Button type="button" variant="destructive" onClick={() => void removeSelectedListOrders()}>
                <Trash2 className="h-3.5 w-3.5" /> Delete selected ({selectedListOrderIds.size})
              </Button>
            </>
          )}
          {hideKindTabs && (
            <BigSellerPdfImportButton
              onImported={(inserted) => {
                setStageFilter("all");
                setPrintedFrom("");
                setPrintedTo("");
                if (inserted.length > 0) {
                  setOrders((prev) => {
                    const mapped = inserted.map(normalizeOrderAssigneesRow);
                    const byId = new Map<string, any>();
                    for (const o of mapped) {
                      if (o?.id) byId.set(o.id, o);
                    }
                    for (const o of prev) {
                      if (o?.id && !byId.has(o.id)) byId.set(o.id, o);
                    }
                    return [...byId.values()].sort(
                      (a, b) =>
                        new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
                    );
                  });
                }
                void refresh();
                router.refresh();
              }}
            />
          )}
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> New Order
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {kindFilter === "online" ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1024px] table-fixed text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-2 py-3 text-center font-medium">
                    <span className="sr-only">Select all visible</span>
                    <input
                      type="checkbox"
                      disabled={visibleOnlineIds.length === 0}
                      className="h-4 w-4 cursor-pointer rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Select all visible online orders"
                      checked={
                        visibleOnlineIds.length > 0 &&
                        visibleOnlineIds.every((id) => selectedOnlineIds.has(id))
                      }
                      ref={(el) => {
                        if (!el || kindFilter !== "online") return;
                        const ids = visibleOnlineIds;
                        const n = ids.filter((id) => selectedOnlineIds.has(id)).length;
                        el.indeterminate = n > 0 && n < ids.length;
                      }}
                      onChange={toggleSelectAllVisibleOnline}
                    />
                  </th>
                  <th className="w-[36%] min-w-[16rem] px-3 py-3 text-left font-medium">Item name</th>
                  <th className="w-[11%] min-w-[6.5rem] px-2 py-3 text-left font-medium">Type</th>
                  <th className="w-[7%] min-w-[4.5rem] px-2 py-3 text-left font-medium">Size</th>
                  <th className="w-[15%] min-w-[10rem] px-2 py-3 text-left font-medium">Store</th>
                  <th className="w-12 px-1 py-3 text-center font-medium">Qty</th>
                  <th className="w-[8%] min-w-[5rem] px-1 py-3 text-left font-medium">Status</th>
                  <th className="w-[9%] min-w-[5rem] px-2 py-3 text-right font-medium">Unit price</th>
                  <th className="w-[10%] min-w-[9rem] px-2 py-3 text-left font-medium">Printed (PDF)</th>
                  <th className="w-[7.25rem] shrink-0 whitespace-nowrap px-2 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const stageLabel =
                    ORDER_SERVICE_LABEL[normalizeOrderServiceStage(o.stage)] || normalizeOrderServiceStage(o.stage);
                  return (
                    <tr key={o.id} className="border-t row-hover hover:bg-muted/30">
                      <td className="w-10 px-2 py-3 text-center align-top">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                          checked={selectedOnlineIds.has(o.id)}
                          aria-label={`Select order ${o.external_order_no || o.order_no}`}
                          onChange={() => toggleOnlineRowSelected(o.id)}
                        />
                      </td>
                      <td className="w-[36%] min-w-[16rem] px-3 py-3 align-top">
                        <div className="line-clamp-5 break-words text-foreground">{o.design_ref || "—"}</div>
                      </td>
                      <td className="w-[11%] min-w-[6.5rem] px-2 py-3 align-top text-xs leading-snug">
                        <div className="break-words">{o.shirt_type || "—"}</div>
                      </td>
                      <td className="w-[7%] min-w-[4.5rem] px-2 py-3 align-top text-xs">
                        <div className="break-words">{o.shirt_size || "—"}</div>
                      </td>
                      <td className="w-[15%] min-w-[10rem] px-2 py-3 align-top text-xs">
                        <div className="break-words font-medium leading-snug">{o.store?.name || "—"}</div>
                      </td>
                      <td className="w-12 px-1 py-3 text-center align-top tabular-nums">{o.quantity}</td>
                      <td className="w-[8%] min-w-[5rem] px-1 py-3 align-top text-xs">
                        <Badge variant={orderStatusHighlightVariant(o) as any} className="line-clamp-2 break-words">
                          {stageLabel}
                        </Badge>
                      </td>
                      <td className="w-[9%] min-w-[5rem] whitespace-nowrap px-2 py-3 text-right align-top">
                        {peso(Number(o.unit_price || 0))}
                      </td>
                      <td
                        className="w-[10%] min-w-[9rem] px-2 py-3 align-top text-xs text-muted-foreground"
                        title={o.bigseller_printed_at ? formatDateTime(o.bigseller_printed_at) : undefined}
                      >
                        <div className="line-clamp-2 break-words leading-snug pr-1">{formatDateTime(o.bigseller_printed_at)}</div>
                      </td>
                      <td className="w-[7.25rem] shrink-0 align-middle pr-2">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            disabled={!canForwardOrder(o)}
                            className={
                              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors " +
                              (canForwardOrder(o)
                                ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                                : "cursor-not-allowed opacity-40")
                            }
                            title={canForwardOrder(o) ? "Forward one status step" : "Already at final step or cancelled"}
                            aria-label="Forward order status"
                            onClick={() => void forwardOrderRow(o)}
                          >
                            <ArrowRight className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            title="Waybill, order no., BigSeller code"
                            aria-label="View waybill, order number, and BigSeller code"
                            onClick={() => setOnlineIdentifiersOrder(o)}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            title="Edit order"
                            aria-label="Edit order"
                            onClick={() => {
                              setEditing(o);
                              setOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            title="Delete order"
                            aria-label="Delete order"
                            onClick={() => remove(o.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                      {hideKindTabs ? "No BigSeller orders match." : "No online orders match (BigSeller imports are on the BigSeller page)."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-2 py-3 text-center font-medium">
                    <span className="sr-only">Select all visible</span>
                    <input
                      type="checkbox"
                      disabled={visibleListOrderIds.length === 0}
                      className="h-4 w-4 cursor-pointer rounded border-input accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Select all visible orders"
                      checked={
                        visibleListOrderIds.length > 0 &&
                        visibleListOrderIds.every((id) => selectedListOrderIds.has(id))
                      }
                      ref={(el) => {
                        if (!el) return;
                        const ids = visibleListOrderIds;
                        const n = ids.filter((id) => selectedListOrderIds.has(id)).length;
                        el.indeterminate = n > 0 && n < ids.length;
                      }}
                      onChange={toggleSelectAllVisibleList}
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium">#</th>
                  <th className="text-left font-medium">Customer</th>
                  <th className="text-left font-medium">Type</th>
                  <th className="text-left font-medium">Status</th>
                  <th className="text-left font-medium">Qty</th>
                  <th className="text-left font-medium">Total</th>
                  <th className="text-left font-medium">Balance</th>
                  <th className="text-left font-medium">Assigned</th>
                  <th className="text-left font-medium">Due</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const balance = Number(o.total) - Number(o.down_payment || 0);
                  const k = KINDS.find((x) => x.v === getOrderKind(o)) || KINDS[0];
                  const isSub = getOrderKind(o) === "sublimation";
                  const stage = isSub ? SUB_STAGES.find((s) => s.v === o.sub_stage) : null;
                  const svc =
                    o.stage != null && String(o.stage).trim() !== ""
                      ? ORDER_SERVICE_LABEL[normalizeOrderServiceStage(o.stage)]
                      : null;
                  const stageLabel = isSub
                    ? [svc, stage?.label].filter(Boolean).join(" · ") || stage?.label || "—"
                    : ORDER_SERVICE_LABEL[normalizeOrderServiceStage(o.stage)] ||
                      normalizeOrderServiceStage(o.stage);
                  return (
                    <tr key={o.id} className="border-t row-hover hover:bg-muted/30">
                      <td className="w-10 px-2 py-3 text-center align-top">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
                          checked={selectedListOrderIds.has(o.id)}
                          aria-label={`Select order #${o.order_no}`}
                          onChange={() => toggleListRowSelected(o.id)}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">#{o.order_no}</td>
                      <td>
                        <div className="font-medium">{o.customer_name}</div>
                        <div className="mt-0.5 space-y-0.5 text-[11px] text-muted-foreground">
                          {o.customer_social && <div>{o.customer_social}</div>}
                          {o.customer_phone && <div>{o.customer_phone}</div>}
                          {o.customer_email && <div>{o.customer_email}</div>}
                        </div>
                      </td>
                      <td>
                        <span className="text-xs text-muted-foreground">
                          {k.label.replace(/\s+Order\s*$/i, "").trim() || k.label}
                        </span>
                      </td>
                      <td>
                        <Badge variant={orderStatusHighlightVariant(o) as any}>{stageLabel}</Badge>
                      </td>
                      <td>{o.quantity}</td>
                      <td>{peso(o.total)}</td>
                      <td>{peso(balance)}</td>
                      <td className="max-w-[200px] text-xs text-muted-foreground">
                        <span className="line-clamp-2">{orderAssigneeNames(o) || "—"}</span>
                      </td>
                      <td className="text-xs">{formatDate(o.due_date)}</td>
                      <td className="pr-3 text-right">
                        {isSub && (
                          <Link
                            href={`/admin/orders/${o.id}/teams`}
                            className="mr-1 inline-flex rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Teams & jerseys (sheet)"
                          >
                            <Table2 className="h-3.5 w-3.5" />
                          </Link>
                        )}
                        <button
                          type="button"
                          disabled={!canForwardOrder(o)}
                          className={
                            "mr-1 inline-flex rounded p-1 transition-colors " +
                            (canForwardOrder(o)
                              ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                              : "cursor-not-allowed opacity-40")
                          }
                          title={canForwardOrder(o) ? "Forward one status step" : "Already at final step or cancelled"}
                          aria-label="Forward order status"
                          onClick={() => void forwardOrderRow(o)}
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(o);
                            setOpen(true);
                          }}
                          className="mr-1 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Edit order"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(o.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Delete order"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={11}
                      className="p-8 text-center text-muted-foreground"
                    >
                      No orders match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <OrderForm open={open} onClose={() => setOpen(false)} order={editing} employees={employees} onSaved={refresh} />

      <Dialog
        open={!!onlineIdentifiersOrder}
        onClose={() => setOnlineIdentifiersOrder(null)}
        title="Waybill & order codes"
        size="md"
      >
        {onlineIdentifiersOrder && (
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Waybill</div>
              <div className="mt-1 break-all font-mono text-foreground">{onlineIdentifiersOrder.waybill_no || "—"}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Order no.</div>
              <div className="mt-1 break-all font-mono text-foreground">
                {onlineIdentifiersOrder.external_order_no || `#${onlineIdentifiersOrder.order_no}`}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">BigSeller code</div>
              <div className="mt-1 break-all font-mono text-foreground">{onlineIdentifiersOrder.sku_code || "—"}</div>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

function BigSellerPdfImportButton({ onImported }: { onImported: (insertedRows: any[]) => void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedBigSellerRow[]>([]);
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [printedFromPdf, setPrintedFromPdf] = useState<{ iso: string | null; raw: string | null }>({
    iso: null,
    raw: null,
  });

  useEffect(() => {
    if (open) return;
    setRows([]);
    setRawText("");
    setFileName("");
    setPrintedFromPdf({ iso: null, raw: null });
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("stores").select("id,name,pdf_label").order("name");
      if (!cancelled) setStores((data as StoreOption[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  async function parseFile(file: File) {
    setParsing(true);
    setError("");
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      // Avoid bundling pdf.worker as a minified asset (Next/Terser breaks `import.meta` in that file → blank app / failed build).
      const pdfVersion = (pdfjs as { version?: string }).version ?? "5.7.284";
      pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfVersion}/build/pdf.worker.min.mjs`;

      const data = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data }).promise;
      const chunks: string[] = [];
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
        const page = await pdf.getPage(pageNo);
        const text = await page.getTextContent();
        const pageText = text.items
          .map((it: any) => String(it.str || "").trim())
          .filter(Boolean)
          .join("\n");
        chunks.push(pageText);
      }
      const joined = chunks.join("\n");
      setRawText(joined);
      const { at, raw } = parseBigSellerPrintedTimeFromPdfText(joined);
      setPrintedFromPdf({ iso: at ? at.toISOString() : null, raw });
      const parsed = parseBigSellerRowsFromText(joined);
      setRows(parsed);
      if (parsed.length === 0) {
        setError("No order rows were found. Use BigSeller Summary List or Pick List PDF format.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to parse PDF";
      setError(msg);
      setRows([]);
      setPrintedFromPdf({ iso: null, raw: null });
    } finally {
      setParsing(false);
    }
  }

  async function importRows() {
    if (rows.length === 0) return;
    setSaving(true);
    setError("");
    try {
      let storeList = stores;
      if (storeList.length === 0) {
        const { data } = await supabase.from("stores").select("id,name,pdf_label").order("name");
        storeList = (data as StoreOption[]) || [];
        setStores(storeList);
      }

      const payload = rows.map((row) => {
        const { id: storeId } = resolveStoreId(storeList, row.storeNameFromPdf);
        let notes = `Imported from BigSeller PDF (${fileName || "file"}).`;
        if (row.storeNameFromPdf && !storeId) {
          notes += ` PDF store "${row.storeNameFromPdf}" — under Admin → Stores, set PDF label (or store name) to match.`;
        }
        const qty = Math.max(1, Math.min(2_147_483_647, Math.round(Number(row.quantity) || 1)));
        const unit = Math.round(Number(row.unitPrice || 0) * 100) / 100;
        return {
          customer_name: `BigSeller #${row.orderSuffix}`,
          customer_social: `BS-${row.orderSuffix}`,
          external_order_no: row.externalOrderNo || null,
          waybill_no: row.waybillNo || null,
          sku_code: row.bigsellerCode || null,
          variation: row.variation || null,
          shirt_type: row.shirtType || null,
          shirt_size: row.shirtSize || null,
          ...(storeId ? { store_id: storeId } : {}),
          /** DB default `kind` is local; UI uses kind before order_type — must set both for Online + BigSeller pages. */
          kind: "online",
          order_type: "online",
          source: "BigSeller",
          stage: "design_layout",
          quantity: qty,
          unit_price: unit,
          down_payment: 0,
          status: "pending",
          design_ref: row.title || null,
          notes,
          bigseller_printed_at: printedFromPdf.iso,
        };
      });
      // Prefer minimal RETURNING first: some PostgREST setups choke on bulk insert + heavy embedded select.
      const { data: idRows, error: insertError } = await supabase.from("orders").insert(payload).select("id");
      if (insertError) {
        setError(formatSupabaseError(insertError));
        return;
      }
      const ids = (idRows ?? []).map((r: { id: string }) => r.id).filter(Boolean);
      if (payload.length > 0 && ids.length === 0) {
        setError(
          "Import may have succeeded but no row ids were returned. Refresh the BigSeller page before importing again.",
        );
        onImported([]);
        return;
      }
      let inserted: any[] = [];
      if (ids.length > 0) {
        const { data: fullRows, error: loadError } = await supabase
          .from("orders")
          .select(ADMIN_ORDERS_SELECT)
          .in("id", ids);
        if (loadError) {
          console.error("BigSeller import: rows inserted but full reload failed:", loadError);
          setError(
            `${formatSupabaseError(loadError)} — Orders may have been created. Close this dialog and refresh the page (do not import again).`,
          );
          onImported([]);
          return;
        }
        inserted = fullRows ?? [];
      }

      setOpen(false);
      onImported(inserted);
    } catch (e: unknown) {
      setError(formatSupabaseError(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <FileUp className="mr-1 h-4 w-4" /> Import BigSeller PDF
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Import BigSeller Summary PDF" size="xl">
        <div className="space-y-4">
          <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
            Pick list: <span className="font-medium text-foreground">BigSeller code</span>,{" "}
            <span className="font-medium text-foreground">Order no.</span> (<code className="text-xs">Order No.</code> or{" "}
            <code className="text-xs">Order No:</code>), <span className="font-medium text-foreground">Waybill</span> (#…).{" "}
            <span className="font-medium text-foreground">Item name</span> from the product title.{" "}
            <span className="font-medium text-foreground">Store</span> from the line after buyer message (e.g. Likha. Tiktok).{" "}
            <span className="font-medium text-foreground">Admin → Stores</span>: set <span className="font-medium text-foreground">PDF store label</span> (or store name) to match so imports get <code className="text-xs">store_id</code>.{" "}
            Pick lists: <span className="font-medium text-foreground">Printed Time</span> from the PDF header is saved on each imported order for filtering on the BigSeller page.
          </div>
          <div>
            <Label>PDF file</Label>
            <Input
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setFileName(f.name);
                parseFile(f);
              }}
            />
            {fileName && <p className="mt-1 text-xs text-muted-foreground">Selected: {fileName}</p>}
          </div>
          {parsing && <p className="text-sm text-muted-foreground">Reading PDF...</p>}
          {!!error && <p className="text-sm text-destructive">{error}</p>}
          {!!printedFromPdf.raw && (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Printed time (PDF):</span> {printedFromPdf.raw}
              {printedFromPdf.iso ? (
                <span> — saved as {formatDateTime(printedFromPdf.iso)} on each order.</span>
              ) : (
                <span className="text-amber-800 dark:text-amber-400">
                  {" "}
                  — could not parse as a date; orders will import without this timestamp.
                </span>
              )}
            </p>
          )}
          {rows.length > 0 && (
            <div className="max-h-[320px] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2">BigSeller code</th>
                    <th className="px-3 py-2">Order no.</th>
                    <th className="px-3 py-2">Waybill</th>
                    <th className="px-3 py-2">Item name</th>
                    <th className="px-3 py-2">Store</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Unit price</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => {
                    const match = resolveStoreId(stores, row.storeNameFromPdf);
                    return (
                      <tr key={`${row.orderSuffix}-${idx}`} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{row.bigsellerCode || "—"}</td>
                        <td className="px-3 py-2 font-mono">{row.externalOrderNo || `#${row.orderSuffix}`}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.waybillNo || "—"}</td>
                        <td className="px-3 py-2">{row.title}</td>
                        <td className="max-w-[140px] px-3 py-2 text-xs">
                          {match.id ? (
                            <span className="font-medium text-emerald-700 dark:text-emerald-400">{match.matchedName}</span>
                          ) : row.storeNameFromPdf ? (
                            <span className="text-muted-foreground" title="Admin → Stores: set PDF store label or name to match this text">
                              {row.storeNameFromPdf}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">{row.shirtType || "—"}</td>
                        <td className="px-3 py-2">{row.shirtSize || "—"}</td>
                        <td className="px-3 py-2">{row.quantity}</td>
                        <td className="px-3 py-2">{peso(Number(row.unitPrice || 0))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {rawText && rows.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Parsed {rows.length} row(s). Green = linked via Stores (PDF label or name); gray = no matching row yet.
            </p>
          )}
          <div className="sticky bottom-0 z-[1] -mx-6 mt-4 flex justify-end gap-2 border-t border-border bg-card px-6 py-3 shadow-[0_-8px_16px_-8px_rgba(0,0,0,0.12)]">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void importRows()} disabled={saving || parsing || rows.length === 0}>
              {saving ? "Importing..." : `Import ${rows.length || ""} Orders`}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

function OrderForm({
  open,
  onClose,
  order,
  employees,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  order: Order | null;
  employees: Emp[];
  onSaved: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const empty = useMemo(
    () => ({
      customer_name: "",
      customer_phone: "",
      customer_email: "",
      customer_social: "",
      kind: "local",
      source: "",
      stage: "design_layout",
      sub_stage: null,
      quantity: 1,
      unit_price: 0,
      down_payment: 0,
      status: "pending",
      due_date: "",
      design_ref: "",
      notes: "",
      assigned_to: "",
    }),
    [],
  );

  const [form, setForm] = useState<any>(() => order || empty);
  const [saving, setSaving] = useState(false);
  function set(k: string, v: any) {
    setForm((f: any) => ({ ...f, [k]: v }));
  }

  useEffect(() => {
    if (!open) return;
    if (order) {
      const k = getOrderKind(order);
      const base = { ...order, kind: k };
      if (k === "sublimation") {
        base.stage =
          order.stage != null && String(order.stage).trim() !== ""
            ? normalizeOrderServiceStage(order.stage)
            : defaultServiceStageFromSubStage(order.sub_stage);
      } else {
        base.stage = normalizeOrderServiceStage(order.stage);
      }
      setForm(base);
    }
    else setForm(empty);
  }, [open, order, empty]);

  useEffect(() => {
    if (!open) return;
    if (order) {
      const ids = Array.isArray(order.assignees)
        ? order.assignees.map((a: any) => a.user_id).filter(Boolean)
        : [];
      setAssigneeIds(ids.length ? ids : order.assigned_to ? [String(order.assigned_to)] : []);
    } else {
      setAssigneeIds([]);
    }
  }, [open, order]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const kind = getOrderKind(form);
      const primaryAssignee = assigneeIds[0] || null;
      const payload: any = {
        ...form,
        assigned_to: primaryAssignee,
        due_date: form.due_date || null,
        stage: normalizeOrderServiceStage(form.stage),
        sub_stage: kind === "sublimation" ? (form.sub_stage || "design_layout") : null,
        order_type: kind,
      };
      delete payload.assigned;
      delete payload.assignees;
      delete payload.total;

      let targetId: string | undefined = order?.id;
      if (order) {
        const { error } = await supabase.from("orders").update(payload).eq("id", order.id);
        if (error) throw error;
        targetId = order.id;
      } else {
        delete payload.id;
        const { data: ins, error } = await supabase.from("orders").insert(payload).select("id").single();
        if (error) throw error;
        targetId = ins?.id;
      }

      if (targetId && kind !== "sublimation") {
        await supabase.from("sublimation_teams").delete().eq("order_id", targetId);
      }

      if (targetId) {
        await supabase.from("order_assignees").delete().eq("order_id", targetId);
        if (assigneeIds.length) {
          const { error: ae } = await supabase
            .from("order_assignees")
            .insert(assigneeIds.map((user_id) => ({ order_id: targetId, user_id })));
          if (ae) throw ae;
        }
      }

      onClose();
      onSaved();
      if (!order && kind === "sublimation" && targetId) {
        router.push(`/admin/orders/${targetId}/teams`);
      }
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Save failed";
      alert(msg);
    } finally {
      setSaving(false);
    }
  }

  const total = Number(form.quantity || 0) * Number(form.unit_price || 0);
  const balance = total - Number(form.down_payment || 0);

  return (
    <Dialog open={open} onClose={onClose} title={order ? `Edit Order #${order.order_no}` : "New Order"} size="xl">
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Order type</Label>
          <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {ORDER_FORM_PRIMARY_KINDS.map((pk) => {
              const active = orderFormPrimaryKey(form.kind) === pk.key;
              return (
                <button
                  type="button"
                  key={pk.key}
                  onClick={() => {
                    if (pk.key === "walkin_online") {
                      setForm((f: any) => ({ ...f, kind: f.kind === "online" ? "online" : "local" }));
                    } else if (pk.key === "services") {
                      set("kind", "services");
                    } else {
                      setForm((f: any) => ({
                        ...f,
                        kind: "sublimation",
                        sub_stage: f.sub_stage || "design_layout",
                      }));
                    }
                  }}
                  className={
                    "rounded-md border p-3 text-left text-xs " +
                    (active ? "border-primary bg-primary/5" : "hover:bg-accent")
                  }
                >
                  <div className="text-sm font-medium">{pk.label}</div>
                  <div className="text-[11px] text-muted-foreground">{pk.hint}</div>
                </button>
              );
            })}
          </div>
          {(form.kind === "local" || form.kind === "online") && (
            <div className="mt-3 rounded-md border bg-muted/20 p-3">
              <Label className="text-xs font-medium text-muted-foreground">Channel</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Walk-in (in-store) and online marketplace (Facebook) are two separate channels. Shopee / TikTok /
                Lazada pick lists belong on BigSeller, not here.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => set("kind", "local")}
                  className={
                    "rounded-md border px-3 py-2 text-left text-xs " +
                    (form.kind === "local" ? "border-primary bg-primary/5" : "hover:bg-accent")
                  }
                >
                  <div className="text-sm font-medium">Walk-in / in-store</div>
                  <div className="text-[11px] text-muted-foreground">In-store purchases at your counter only.</div>
                </button>
                <button
                  type="button"
                  onClick={() => set("kind", "online")}
                  className={
                    "rounded-md border px-3 py-2 text-left text-xs " +
                    (form.kind === "online" ? "border-primary bg-primary/5" : "hover:bg-accent")
                  }
                >
                  <div className="text-sm font-medium">Online marketplace</div>
                  <div className="text-[11px] text-muted-foreground">
                    Facebook Marketplace or a Facebook Page — not in-store walk-in, and not shop channels (use
                    BigSeller).
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>

        {form.kind !== "local" && (
          <div className="col-span-2">
            <Label>
              {form.kind === "online"
                ? "Marketplace / page"
                : form.kind === "services"
                  ? "Job type / details"
                  : "Source"}
            </Label>
            <Input
              placeholder={
                form.kind === "online"
                  ? "e.g. Facebook Marketplace, Page name"
                  : form.kind === "services"
                    ? "e.g. DTF print, jersey numbers, embroidery"
                    : "Facebook / Walk-in / Referral"
              }
              value={form.source || ""}
              onChange={(e) => set("source", e.target.value)}
            />
          </div>
        )}

        <div className="col-span-2">
          <Label>Status</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {form.kind === "local" || form.kind === "online" ? (
              <>
                Design & Layout through Completed — where this order is in your workflow. Walk-in (in-store) and online
                marketplace (Facebook) are separate; use BigSeller for Shopee / TikTok / Lazada imports.
              </>
            ) : form.kind === "services" ? (
              <>
                Design & Layout through Completed — where this add-on / service job is in your workflow (same steps as
                Walk In & Online and BigSeller orders).
              </>
            ) : (
              <>
                Design & Layout through Completed — where this sublimation order is in your shop workflow.
                {order && " Adjust the detailed sublimation stage below for production-floor steps."}
              </>
            )}
          </p>
          <select
            className="mt-1 h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            value={normalizeOrderServiceStage(form.stage)}
            onChange={(e) => set("stage", e.target.value)}
          >
            {ORDER_SERVICE_STAGES.map((v) => (
              <option key={v} value={v}>
                {ORDER_SERVICE_LABEL[v] || v}
              </option>
            ))}
          </select>
        </div>

        {form.kind === "sublimation" && order && (
          <div className="col-span-2">
            <Label>Sublimation stage</Label>
            <select
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              value={form.sub_stage || "design_layout"}
              onChange={(e) => set("sub_stage", e.target.value)}
            >
              {SUB_STAGES.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="col-span-2 mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer</div>
        <div>
          <Label>Customer name</Label>
          <Input required value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={form.customer_phone || ""} onChange={(e) => set("customer_phone", e.target.value)} />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.customer_email || ""} onChange={(e) => set("customer_email", e.target.value)} />
        </div>
        <div>
          <Label>Social media</Label>
          <Input placeholder="@username / FB profile" value={form.customer_social || ""} onChange={(e) => set("customer_social", e.target.value)} />
        </div>

        <div className="col-span-2 mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order details</div>
        <div className="col-span-2">
          <Label>Assigned to (group — optional)</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">Select one or more staff; the first is also stored as the primary assignee for legacy views.</p>
          <div className="mt-1 max-h-44 overflow-y-auto rounded-md border">
            {employees.map((e) => (
              <label
                key={e.id}
                className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-0 hover:bg-muted/30"
              >
                <input
                  type="checkbox"
                  checked={assigneeIds.includes(e.id)}
                  onChange={() =>
                    setAssigneeIds((prev) =>
                      prev.includes(e.id) ? prev.filter((x) => x !== e.id) : [...prev, e.id],
                    )
                  }
                />
                <span className="flex-1">{e.full_name || e.email}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label>Quantity</Label>
          <Input type="number" min={1} value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} />
        </div>
        <div>
          <Label>Unit price (₱)</Label>
          <Input type="number" min={0} step="0.01" value={form.unit_price} onChange={(e) => set("unit_price", Number(e.target.value))} />
        </div>
        <div>
          <Label>Down payment (₱)</Label>
          <Input type="number" min={0} step="0.01" value={form.down_payment} onChange={(e) => set("down_payment", Number(e.target.value))} />
        </div>
        <div>
          <Label>Due date</Label>
          <Input type="date" value={form.due_date || ""} onChange={(e) => set("due_date", e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label>Design reference</Label>
          <Input value={form.design_ref || ""} onChange={(e) => set("design_ref", e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label>Notes</Label>
          <textarea className="min-h-[60px] w-full rounded-md border bg-transparent px-3 py-2 text-sm" value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
        </div>

        {getOrderKind(form) === "sublimation" && order?.id && (
          <div className="col-span-2 rounded-md border border-dashed bg-muted/15 px-3 py-2 text-sm text-muted-foreground">
            Teams & jerseys: use the{" "}
            <Link className="font-medium text-primary underline-offset-4 hover:underline" href={`/admin/orders/${order.id}/teams`}>
              sheet view
            </Link>{" "}
            (table icon on the order row).
          </div>
        )}

        <div className="col-span-2 rounded-md bg-muted/40 p-3 text-sm">
          Total: <b>{peso(total)}</b> &nbsp;·&nbsp; Balance: <b>{peso(balance)}</b>
        </div>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
