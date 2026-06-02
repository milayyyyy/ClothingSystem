import { BIGSELLER_KNOWN_STORES_SORTED } from "@/lib/bigseller-store-labels";

/** One row parsed from BigSeller Summary List or Pick List PDF. */
export type ParsedBigSellerPickRow = {
  bigsellerCode?: string;
  externalOrderNo?: string;
  orderSuffix: string;
  quantity: number;
  title: string;
  storeNameFromPdf?: string;
  variation?: string;
  shirtType?: "White shirt" | "Black shirt";
  shirtSize?: "small" | "medium" | "large" | "xlarge" | "2xlarge" | "3xlarge";
  unitPrice?: number;
  waybillNo?: string;
};

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
  if (x.includes("white shirt") || (x.includes("white") && !x.includes("black"))) return "White shirt";
  if (x.includes("black shirt") || x.includes("black")) return "Black shirt";
  return undefined;
}

function normalizeShirtSize(raw: string): ParsedBigSellerPickRow["shirtSize"] | undefined {
  const x = raw.toLowerCase().replace(/\s+/g, "");
  if (/(^|[^a-z0-9])s($|[^a-z0-9])/.test(raw.toLowerCase()) || (x.includes("small") && !x.includes("x-small")))
    return "small";
  if (x.includes("medium")) return "medium";
  if (x.includes("3x-large") || x.includes("3xlarge") || x.includes("xxxl")) return "3xlarge";
  if (x.includes("2x-large") || x.includes("2xlarge") || x.includes("xxl")) return "2xlarge";
  if (x.includes("x-large") || x.includes("xlarge") || x === "xl") return "xlarge";
  if (x.includes("large")) return "large";
  return undefined;
}

function splitTypeSize(variation: string | undefined) {
  if (!variation) return {};
  return {
    shirtType: normalizeShirtType(variation),
    shirtSize: normalizeShirtSize(variation),
  };
}

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

function pickRowQualityScore(r: ParsedBigSellerPickRow): number {
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

function dedupeBigSellerRows(rows: ParsedBigSellerPickRow[]): ParsedBigSellerPickRow[] {
  const m = new Map<string, ParsedBigSellerPickRow>();
  for (const r of rows) {
    const key = (r.externalOrderNo && String(r.externalOrderNo).trim()) || `sfx-${r.orderSuffix}`;
    const prev = m.get(key);
    if (!prev || pickRowQualityScore(r) > pickRowQualityScore(prev)) m.set(key, r);
  }
  return [...m.values()];
}

/** TikTok-style numeric IDs and Shopee-style alphanumeric IDs (e.g. 2606021795YS2F). */
const PICK_LIST_ORDER_NO = "([A-Z0-9]{8,})";

function pickListHeaderPattern(flags: string) {
  return new RegExp(
    `\\b([A-Z0-9]{6,})\\s+Order\\s+No\\.?\\s*:?\\s*${PICK_LIST_ORDER_NO}\\s+.*?\\(#([^)]+)\\)`,
    flags,
  );
}

function tryMatchPickHeader(chunk: string) {
  const c = chunk.replace(/\s+/g, " ").trim();
  return c.match(pickListHeaderPattern("i"));
}

function countPickListOrderHeaders(rawText: string): number {
  const flat = rawText.replace(/\s+/g, " ");
  return [...flat.matchAll(pickListHeaderPattern("gi"))].length;
}

function extractVariationFromPickSegment(segment: string): string | undefined {
  const commaVar = segment.match(/((?:Black|White)\s+Shirt\s*,\s*[\w-]+)/i);
  if (commaVar) return commaVar[1].replace(/\s+/g, " ").trim();

  const skuHyphen = segment.match(/-(Black|White)\s+Shirt-([\w-]+)/i);
  if (skuHyphen) return `${skuHyphen[1]} Shirt, ${skuHyphen[2].replace(/-/g, "-")}`;

  const shirtBeforePrice = segment.match(/((?:Black|White)\s+Shirt[\w\s,.-]*?)\s*--\s*PHP/i);
  if (shirtBeforePrice) return shirtBeforePrice[1].replace(/\s+/g, " ").trim();

  return undefined;
}

function extractTitleFromPickSegment(segment: string): string {
  const firstQuote = segment.match(/"([^"]{4,})"/);
  if (!firstQuote) return "";
  let title = firstQuote[1].trim();
  const afterQuote = segment.slice((firstQuote.index ?? 0) + firstQuote[0].length);
  const continuation = afterQuote.match(
    /^\s*([^"]+?)(?=\s+(?:[A-Z0-9]*APPAREL|(?:Black|White)\s+Shirt|-(?:Black|White)\s+Shirt|PHP\s|Buyer Message:|Total:))/i,
  );
  if (continuation) {
    const extra = continuation[1]
      .split("|")[0]
      .replace(/\s+/g, " ")
      .trim();
    if (extra.length > 2 && !/^Genders$/i.test(extra)) title = `${title} ${extra}`.trim();
  }
  return title.replace(/\s+/g, " ").trim();
}

function parsePickListCollapsed(rawText: string): ParsedBigSellerPickRow[] {
  const flat = rawText.replace(/\s+/g, " ").trim();
  const headers = [...flat.matchAll(pickListHeaderPattern("gi"))];
  const out: ParsedBigSellerPickRow[] = [];
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

    const title = extractTitleFromPickSegment(segment);
    const variation = extractVariationFromPickSegment(segment);

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

/** Parse BigSeller Summary List or Pick List PDF text into order rows. */
export function parseBigSellerRowsFromText(rawText: string): ParsedBigSellerPickRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const isPickListDoc = /\bPICK\s+LIST\b/i.test(rawText);

  if (!isPickListDoc) {
    const summaryOut: ParsedBigSellerPickRow[] = [];
    let titleParts: string[] = [];

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

  if (isPickListDoc) {
    const collapsed = parsePickListCollapsed(rawText);
    const expectedHeaders = countPickListOrderHeaders(rawText);
    const lineParsed = parsePickListLineByLine(lines);
    if (collapsed.length > 0 && expectedHeaders > 0 && collapsed.length >= expectedHeaders) {
      return dedupeBigSellerRows(collapsed);
    }
    if (lineParsed.length > 0 && lineParsed.length >= collapsed.length) {
      return dedupeBigSellerRows(lineParsed);
    }
    if (collapsed.length > 0) return dedupeBigSellerRows(collapsed);
    if (lineParsed.length > 0) return dedupeBigSellerRows(lineParsed);
  }

  return parsePickListLineByLine(lines);
}

function parsePickListLineByLine(lines: string[]): ParsedBigSellerPickRow[] {
  const pickOut: ParsedBigSellerPickRow[] = [];
  let inRow = false;
  let current: ParsedBigSellerPickRow = { orderSuffix: "", quantity: 1, title: "" };
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
    if (/-(Black|White)\s+Shirt-/i.test(line)) continue;
    if (/^[A-Z0-9]*APPAREL\b/i.test(line)) continue;

    currentTitleParts.push(line);
  }
  flushPickRow();
  return dedupeBigSellerRows(pickOut);
}
