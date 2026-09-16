import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EXPENSE_RECEIPTS_BUCKET,
  JERSEY_DESIGNS_BUCKET,
  storagePathFromPublicUrl,
} from "@/lib/media-storage";
import { ORDER_RECORD_BUCKET } from "@/lib/order-records";

export type MediaArchiveRange = { from: string | null; to: string | null };

export type MediaArchiveCategory = "receipts" | "screenshots" | "designs";

export type MediaArchiveItem = {
  category: MediaArchiveCategory;
  dateYmd: string;
  name: string;
  isPdf: boolean;
  bucket: string | null;
  path: string | null;
  publicUrl: string | null;
};

const ID_CHUNK = 80;

function ymd(value: unknown): string {
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(t));
}

function formatYmdLabel(value: string): string {
  const s = ymd(value);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s || "—";
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function pesoPdf(n: number): string {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "-PHP " : "PHP ") + formatted;
}

function inRange(date: string, range: MediaArchiveRange): boolean {
  if (!date) return false;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

function orderCreatedBounds(range: MediaArchiveRange): { startIso?: string; endIso?: string } {
  const out: { startIso?: string; endIso?: string } = {};
  if (range.from) out.startIso = `${range.from}T00:00:00+08:00`;
  if (range.to) out.endIso = `${range.to}T23:59:59.999+08:00`;
  return out;
}

async function chunkedIn<T>(
  ids: string[],
  load: (slice: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const slice = ids.slice(i, i + ID_CHUNK);
    if (!slice.length) continue;
    out.push(...(await load(slice)));
  }
  return out;
}

function isPdfPath(path: string, mime?: string | null, fileName?: string | null): boolean {
  const m = (mime || "").toLowerCase();
  const n = `${path} ${fileName || ""}`.toLowerCase();
  return m === "application/pdf" || n.includes(".pdf");
}

export async function fetchMediaArchiveItems(
  supabase: SupabaseClient,
  range: MediaArchiveRange,
): Promise<MediaArchiveItem[]> {
  const items: MediaArchiveItem[] = [];

  let expensesQuery = supabase
    .from("expenses")
    .select("id, expense_date, category, description, amount, receipt_path")
    .not("receipt_path", "is", null)
    .order("expense_date", { ascending: true });
  if (range.from) expensesQuery = expensesQuery.gte("expense_date", range.from);
  if (range.to) expensesQuery = expensesQuery.lte("expense_date", range.to);
  const { data: expenses, error: expErr } = await expensesQuery;
  if (expErr) throw new Error(expErr.message);
  for (const row of expenses || []) {
    const path = String((row as { receipt_path?: string | null }).receipt_path || "").trim();
    if (!path) continue;
    const dateYmd = ymd((row as { expense_date?: string }).expense_date);
    const desc = String((row as { description?: string | null }).description || "").trim();
    const category = String((row as { category?: string | null }).category || "Expense").trim();
    const amount = Number((row as { amount?: number }).amount || 0);
    items.push({
      category: "receipts",
      dateYmd,
      name: `${desc || category} · ${pesoPdf(amount)}`,
      isPdf: isPdfPath(path),
      bucket: EXPENSE_RECEIPTS_BUCKET,
      path,
      publicUrl: null,
    });
  }

  let recordsQuery = supabase
    .from("order_records")
    .select("id, record_date, title")
    .order("record_date", { ascending: true });
  if (range.from) recordsQuery = recordsQuery.gte("record_date", range.from);
  if (range.to) recordsQuery = recordsQuery.lte("record_date", range.to);
  const { data: records, error: recErr } = await recordsQuery;
  if (recErr) throw new Error(recErr.message);
  const recordById = new Map(
    (records || []).map((r) => [
      String((r as { id: string }).id),
      r as { id: string; record_date: string; title: string | null },
    ]),
  );
  const recordIds = [...recordById.keys()];
  if (recordIds.length) {
    const atts = await chunkedIn(recordIds, async (slice) => {
      const { data, error } = await supabase
        .from("order_record_attachments")
        .select("id, record_id, path, file_name, mime_type, kind")
        .in("record_id", slice);
      if (error) throw new Error(error.message);
      return data || [];
    });
    for (const att of atts) {
      const rec = recordById.get(String((att as { record_id: string }).record_id));
      if (!rec) continue;
      const path = String((att as { path?: string }).path || "").trim();
      if (!path) continue;
      const title = String(rec.title || "").trim() || "Order record";
      const fileName = String((att as { file_name?: string }).file_name || "").trim();
      items.push({
        category: "screenshots",
        dateYmd: ymd(rec.record_date),
        name: fileName ? `${title} · ${fileName}` : title,
        isPdf: isPdfPath(path, (att as { mime_type?: string | null }).mime_type, fileName),
        bucket: ORDER_RECORD_BUCKET,
        path,
        publicUrl: null,
      });
    }
  }

  let ordersQuery = supabase
    .from("orders")
    .select("id, order_no, customer_name, created_at")
    .order("created_at", { ascending: true });
  const bounds = orderCreatedBounds(range);
  if (bounds.startIso) ordersQuery = ordersQuery.gte("created_at", bounds.startIso);
  if (bounds.endIso) ordersQuery = ordersQuery.lte("created_at", bounds.endIso);
  const { data: orders, error: ordErr } = await ordersQuery;
  if (ordErr) throw new Error(ordErr.message);
  const orderById = new Map(
    (orders || []).map((o) => [
      String((o as { id: string }).id),
      o as { id: string; order_no: number | null; customer_name: string | null; created_at: string },
    ]),
  );
  const orderIds = [...orderById.keys()];
  if (orderIds.length) {
    const teams = await chunkedIn(orderIds, async (slice) => {
      const { data, error } = await supabase
        .from("sublimation_teams")
        .select("id, order_id, name, design_image_urls")
        .in("order_id", slice);
      if (error) throw new Error(error.message);
      return data || [];
    });
    const teamIds = teams.map((t) => String((t as { id: string }).id));
    const players = teamIds.length
      ? await chunkedIn(teamIds, async (slice) => {
          const { data, error } = await supabase
            .from("sublimation_team_players")
            .select("id, team_id, design_image_url")
            .in("team_id", slice)
            .not("design_image_url", "is", null);
          if (error) throw new Error(error.message);
          return data || [];
        })
      : [];
    const playerUrlsByTeam = new Map<string, string[]>();
    for (const p of players) {
      const url = String((p as { design_image_url?: string | null }).design_image_url || "").trim();
      const teamId = String((p as { team_id: string }).team_id);
      if (!url) continue;
      const list = playerUrlsByTeam.get(teamId) || [];
      list.push(url);
      playerUrlsByTeam.set(teamId, list);
    }

    for (const team of teams) {
      const order = orderById.get(String((team as { order_id: string }).order_id));
      if (!order) continue;
      const dateYmd = ymd(order.created_at);
      if (!inRange(dateYmd, range)) continue;
      const teamName = String((team as { name?: string }).name || "Team").trim();
      const orderLabel = `#${order.order_no ?? "—"} ${String(order.customer_name || "").trim() || "Order"}`.trim();
      const urls = [
        ...(((team as { design_image_urls?: unknown }).design_image_urls as unknown[]) || []),
        ...(playerUrlsByTeam.get(String((team as { id: string }).id)) || []),
      ]
        .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
        .map((u) => u.trim());
      const seen = new Set<string>();
      for (const url of urls) {
        if (seen.has(url)) continue;
        seen.add(url);
        items.push({
          category: "designs",
          dateYmd,
          name: `${orderLabel} · ${teamName}`,
          isPdf: false,
          bucket: JERSEY_DESIGNS_BUCKET,
          path: storagePathFromPublicUrl(url, JERSEY_DESIGNS_BUCKET),
          publicUrl: url,
        });
      }
    }
  }

  const rank: Record<MediaArchiveCategory, number> = { receipts: 0, screenshots: 1, designs: 2 };
  items.sort((a, b) => rank[a.category] - rank[b.category] || a.dateYmd.localeCompare(b.dateYmd) || a.name.localeCompare(b.name));
  return items;
}

async function signedOrPublicUrl(supabase: SupabaseClient, item: MediaArchiveItem): Promise<string | null> {
  if (item.publicUrl) return item.publicUrl;
  if (!item.bucket || !item.path) return null;
  const { data, error } = await supabase.storage.from(item.bucket).createSignedUrl(item.path, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

type PdfJpeg = { dataUrl: string; aspect: number };

async function loadJpegForPdf(url: string): Promise<PdfJpeg | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = dataUrl;
    });
    const maxEdge = 1200;
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
    const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.72), aspect: w / h };
  } catch {
    return null;
  }
}

const MARGIN = 12;
const CATEGORY_LABEL: Record<MediaArchiveCategory, string> = {
  receipts: "Receipts",
  screenshots: "Screenshots (order records)",
  designs: "Designs (order sheets)",
};

export async function buildMediaArchivePdf(
  items: MediaArchiveItem[],
  range: MediaArchiveRange,
  supabase: SupabaseClient,
  onProgress?: (message: string) => void,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - 2 * MARGIN;

  const rangeLabel =
    range.from && range.to
      ? `${formatYmdLabel(range.from)} – ${formatYmdLabel(range.to)}`
      : "All dates";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Receipts, screenshots & designs", MARGIN, 22);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(rangeLabel, MARGIN, 30);
  doc.setFontSize(9);
  doc.setTextColor(90);
  const counts = {
    receipts: items.filter((i) => i.category === "receipts").length,
    screenshots: items.filter((i) => i.category === "screenshots").length,
    designs: items.filter((i) => i.category === "designs").length,
  };
  doc.text(
    `${counts.receipts} receipt${counts.receipts === 1 ? "" : "s"} · ${counts.screenshots} screenshot${counts.screenshots === 1 ? "" : "s"} · ${counts.designs} design${counts.designs === 1 ? "" : "s"}`,
    MARGIN,
    37,
  );
  doc.setTextColor(0);

  let y = 48;
  let currentCategory: MediaArchiveCategory | null = null;

  const ensure = (needed: number) => {
    if (y + needed <= pageH - MARGIN) return;
    doc.addPage();
    y = MARGIN + 6;
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    onProgress?.(`Adding ${i + 1} of ${items.length}…`);
    if (item.category !== currentCategory) {
      ensure(18);
      if (currentCategory) y += 4;
      doc.setFillColor(240, 240, 240);
      doc.rect(MARGIN, y, contentW, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(20);
      doc.text(CATEGORY_LABEL[item.category], MARGIN + 2, y + 5.5);
      y += 12;
      currentCategory = item.category;
    }

    ensure(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30);
    doc.text(formatYmdLabel(item.dateYmd), MARGIN, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(60);
    const nameLines = doc.splitTextToSize(item.name, contentW);
    doc.text(nameLines, MARGIN, y);
    y += nameLines.length * 4 + 2;
    doc.setTextColor(0);

    if (item.isPdf) {
      doc.setFontSize(8);
      doc.setTextColor(90);
      doc.text("PDF file (listed only — open the original in the app to view pages).", MARGIN, y);
      doc.setTextColor(0);
      y += 8;
      continue;
    }

    const src = await signedOrPublicUrl(supabase, item);
    const jpeg = src ? await loadJpegForPdf(src) : null;
    if (!jpeg) {
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text("Image could not be loaded.", MARGIN, y);
      doc.setTextColor(0);
      y += 8;
      continue;
    }

    let imgW = contentW;
    let imgH = imgW / jpeg.aspect;
    const maxH = Math.min(118, pageH - MARGIN - y - 4);
    if (imgH > maxH) {
      imgH = maxH;
      imgW = imgH * jpeg.aspect;
    }
    ensure(imgH + 4);
    try {
      doc.addImage(jpeg.dataUrl, "JPEG", MARGIN, y, imgW, imgH);
      y += imgH + 8;
    } catch {
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text("Image could not be added to the PDF.", MARGIN, y);
      doc.setTextColor(0);
      y += 8;
    }
  }

  return doc.output("blob");
}

export function downloadMediaArchivePdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function mediaArchiveFilename(range: MediaArchiveRange): string {
  if (range.from && range.to) return `media_archive_${range.from}_${range.to}`;
  return `media_archive_all`;
}

async function removeStoragePaths(supabase: SupabaseClient, bucket: string, paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const { error } = await supabase.storage.from(bucket).remove(chunk);
    if (error) throw new Error(`${bucket}: ${error.message}`);
  }
}

export type MediaArchiveCleanupResult = {
  receipts: number;
  screenshots: number;
  designs: number;
};

export async function cleanupMediaArchiveForRange(
  supabase: SupabaseClient,
  range: MediaArchiveRange,
): Promise<MediaArchiveCleanupResult> {
  let receipts = 0;
  let screenshots = 0;
  let designs = 0;

  const receiptPaths: string[] = [];
  const screenshotPaths: string[] = [];
  const designPaths: string[] = [];

  let expensesQuery = supabase
    .from("expenses")
    .select("id, receipt_path")
    .not("receipt_path", "is", null);
  if (range.from) expensesQuery = expensesQuery.gte("expense_date", range.from);
  if (range.to) expensesQuery = expensesQuery.lte("expense_date", range.to);
  const { data: expenses, error: expErr } = await expensesQuery;
  if (expErr) throw new Error(expErr.message);
  const expenseIds: string[] = [];
  for (const row of expenses || []) {
    const path = String((row as { receipt_path?: string | null }).receipt_path || "").trim();
    if (!path) continue;
    receiptPaths.push(path);
    expenseIds.push(String((row as { id: string }).id));
  }
  if (expenseIds.length) {
    await removeStoragePaths(supabase, EXPENSE_RECEIPTS_BUCKET, receiptPaths);
    for (let i = 0; i < expenseIds.length; i += ID_CHUNK) {
      const { error } = await supabase
        .from("expenses")
        .update({ receipt_path: null })
        .in("id", expenseIds.slice(i, i + ID_CHUNK));
      if (error) throw new Error(error.message);
    }
    receipts = expenseIds.length;
  }

  let recordsQuery = supabase.from("order_records").select("id");
  if (range.from) recordsQuery = recordsQuery.gte("record_date", range.from);
  if (range.to) recordsQuery = recordsQuery.lte("record_date", range.to);
  const { data: records, error: recErr } = await recordsQuery;
  if (recErr) throw new Error(recErr.message);
  const recordIds = (records || []).map((r) => String((r as { id: string }).id));
  if (recordIds.length) {
    const atts = await chunkedIn(recordIds, async (slice) => {
      const { data, error } = await supabase
        .from("order_record_attachments")
        .select("id, path")
        .in("record_id", slice);
      if (error) throw new Error(error.message);
      return data || [];
    });
    const attIds: string[] = [];
    for (const att of atts) {
      const path = String((att as { path?: string }).path || "").trim();
      if (path) screenshotPaths.push(path);
      attIds.push(String((att as { id: string }).id));
    }
    if (screenshotPaths.length) await removeStoragePaths(supabase, ORDER_RECORD_BUCKET, screenshotPaths);
    if (attIds.length) {
      for (let i = 0; i < attIds.length; i += ID_CHUNK) {
        const { error } = await supabase
          .from("order_record_attachments")
          .delete()
          .in("id", attIds.slice(i, i + ID_CHUNK));
        if (error) throw new Error(error.message);
      }
      screenshots = attIds.length;
    }
  }

  const bounds = orderCreatedBounds(range);
  let ordersQuery = supabase.from("orders").select("id");
  if (bounds.startIso) ordersQuery = ordersQuery.gte("created_at", bounds.startIso);
  if (bounds.endIso) ordersQuery = ordersQuery.lte("created_at", bounds.endIso);
  const { data: orders, error: ordErr } = await ordersQuery;
  if (ordErr) throw new Error(ordErr.message);
  const orderIds = (orders || []).map((o) => String((o as { id: string }).id));
  if (orderIds.length) {
    const teams = await chunkedIn(orderIds, async (slice) => {
      const { data, error } = await supabase
        .from("sublimation_teams")
        .select("id, design_image_urls")
        .in("order_id", slice);
      if (error) throw new Error(error.message);
      return data || [];
    });
    const teamIds = teams.map((t) => String((t as { id: string }).id));
    for (const team of teams) {
      const urls = ((team as { design_image_urls?: unknown }).design_image_urls as unknown[]) || [];
      for (const url of urls) {
        if (typeof url !== "string") continue;
        const path = storagePathFromPublicUrl(url, JERSEY_DESIGNS_BUCKET);
        if (path) designPaths.push(path);
      }
    }
    if (teamIds.length) {
      const players = await chunkedIn(teamIds, async (slice) => {
        const { data, error } = await supabase
          .from("sublimation_team_players")
          .select("id, design_image_url")
          .in("team_id", slice)
          .not("design_image_url", "is", null);
        if (error) throw new Error(error.message);
        return data || [];
      });
      for (const p of players) {
        const url = String((p as { design_image_url?: string | null }).design_image_url || "").trim();
        const path = storagePathFromPublicUrl(url, JERSEY_DESIGNS_BUCKET);
        if (path) designPaths.push(path);
      }
      if (players.length) {
        for (let i = 0; i < teamIds.length; i += ID_CHUNK) {
          const { error } = await supabase
            .from("sublimation_team_players")
            .update({ design_image_url: null })
            .in("team_id", teamIds.slice(i, i + ID_CHUNK));
          if (error) throw new Error(error.message);
        }
      }
      for (let i = 0; i < teamIds.length; i += ID_CHUNK) {
        const { error } = await supabase
          .from("sublimation_teams")
          .update({ design_image_urls: [] })
          .in("id", teamIds.slice(i, i + ID_CHUNK));
        if (error) throw new Error(error.message);
      }
    }
    if (designPaths.length) await removeStoragePaths(supabase, JERSEY_DESIGNS_BUCKET, designPaths);
    designs = designPaths.length;
  }

  return { receipts, screenshots, designs };
}

export function formatMediaArchiveRangeLabel(range: MediaArchiveRange): string {
  if (range.from && range.to) return `${formatYmdLabel(range.from)} – ${formatYmdLabel(range.to)}`;
  return "all dates";
}
