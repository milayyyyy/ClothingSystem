import { peso as _pesoUI } from "@/lib/utils";
void _pesoUI; // kept for tree-shaking; PDF uses pesoPdf below

/** PDF-safe currency formatter — jsPDF Helvetica cannot render ₱,
 *  which appears as ± with garbled digit spacing. */
function pesoPdf(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  const abs = Math.abs(v);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "-PHP " : "PHP ") + s;
}

export type TeamsSheetPdfLineItem = {
  name: string;
  size: string;
  checked: boolean;
};

export type TeamsSheetPdfRow = {
  index: number;
  surname: string;
  jerseyNumber?: string;
  lines: TeamsSheetPdfLineItem[];
};

export type TeamsSheetPdfGroup = {
  teamName: string;
  /** Public URLs of design reference photos for this team. */
  designImageUrls: string[];
  rows: TeamsSheetPdfRow[];
};

export type TeamsSheetPdfPriceLine = {
  name: string;
  size: string;
  count: number;
  unitPrice: number;
};

export type TeamsSheetPdfData = {
  orderNo: number;
  customerName: string | null;
  sheetKind: "teams" | "services";
  groups: TeamsSheetPdfGroup[];
  priceLines: TeamsSheetPdfPriceLine[];
  orderTotal: number;
  downPayment: number;
  balance: number;
  /** When false, export teams/roster only (no price chart section). Default true. */
  includePriceChart?: boolean;
  /** When true, skip teams/roster and export the price chart section only. */
  priceChartOnly?: boolean;
  generatedAt?: Date;
};

type JsPDFDoc = import("jspdf").jsPDF;
type AutoTableFn = typeof import("jspdf-autotable").default;

type PdfImage = {
  dataUrl: string;
  format: "JPEG" | "PNG" | "WEBP";
  aspect: number;
};

const MARGIN = 10;
const THUMB_MAX_MM = 42;
const THUMB_GAP_MM = 3;
const THUMBS_PER_ROW = 3;
/** Size of the large "hero" design photo placed top-right beside the player table. */
const HERO_PHOTO_MM = 62;
/** Gap between the narrowed table and the hero photo. */
const HERO_PHOTO_GAP_MM = 4;
/** Empty checkbox prefix for handwritten marking on printed sheets. */
const PDF_CHECKBOX = "[ ]";

function labels(kind: "teams" | "services") {
  const isSvc = kind === "services";
  return {
    title: isSvc ? "Services order sheet" : "Teams & jerseys sheet",
    group: isSvc ? "Customer / service" : "Team",
    colName: isSvc ? "Services" : "Surname",
    colLines: isSvc ? "Service lines" : "Jersey lines",
    priceLineHdr: isSvc ? "Service line" : "Jersey line",
  };
}

export function formatSheetLinesForPdf(lines: TeamsSheetPdfLineItem[]): string {
  const visible = lines.filter((x) => x.checked || x.name.trim() || x.size.trim());
  if (!visible.length) return "—";
  return visible
    .map((item) => {
      const name = item.name.trim() || "—";
      const size = item.size.trim();
      return size
        ? `${PDF_CHECKBOX}  ${name}  (${size})`
        : `${PDF_CHECKBOX}  ${name}`;
    })
    .join("\n");
}

function tableEndY(doc: JsPDFDoc): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return last?.finalY ?? MARGIN;
}

function pageBottom(doc: JsPDFDoc): number {
  return doc.internal.pageSize.getHeight() - MARGIN;
}

function contentWidth(doc: JsPDFDoc): number {
  return doc.internal.pageSize.getWidth() - 2 * MARGIN;
}

function ensureSpace(doc: JsPDFDoc, y: number, needed: number): number {
  if (y + needed <= pageBottom(doc)) return y;
  doc.addPage();
  return MARGIN + 4;
}

async function loadPdfImage(url: string): Promise<PdfImage | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    if (!dataUrl.startsWith("data:")) return null;

    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
      img.onerror = () => reject(new Error("image load failed"));
      img.src = dataUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = dims.w;
    canvas.height = dims.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const el = new Image();
    el.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      el.onload = () => resolve();
      el.onerror = () => reject(new Error("decode failed"));
    });
    ctx.drawImage(el, 0, 0);
    const jpegUrl = canvas.toDataURL("image/jpeg", 0.9);

    return { dataUrl: jpegUrl, format: "JPEG", aspect: dims.w / dims.h };
  } catch {
    return null;
  }
}

function thumbSize(aspect: number): { w: number; h: number } {
  if (aspect >= 1) {
    const w = THUMB_MAX_MM;
    return { w, h: w / aspect };
  }
  const h = THUMB_MAX_MM;
  return { w: h * aspect, h };
}

function designPhotosBlockHeight(imageCount: number): number {
  if (imageCount <= 0) return 0;
  const rows = Math.ceil(imageCount / THUMBS_PER_ROW);
  return 5 + rows * (THUMB_MAX_MM + THUMB_GAP_MM);
}

function drawDesignPhotos(
  doc: JsPDFDoc,
  images: PdfImage[],
  startY: number,
): number {
  if (!images.length) return startY;

  let y = ensureSpace(doc, startY, designPhotosBlockHeight(images.length) + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text("Design photos", MARGIN, y);
  y += 4;

  const maxX = doc.internal.pageSize.getWidth() - MARGIN;
  let x = MARGIN;
  let rowH = THUMB_MAX_MM;

  for (let i = 0; i < images.length; i++) {
    const img = images[i]!;
    const { w, h } = thumbSize(img.aspect);
    rowH = Math.max(rowH, h);

    if (x + w > maxX && x > MARGIN) {
      y += rowH + THUMB_GAP_MM;
      y = ensureSpace(doc, y, THUMB_MAX_MM + 8);
      x = MARGIN;
      rowH = THUMB_MAX_MM;
    }

    try {
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.2);
      doc.rect(x, y, w, h);
      doc.addImage(img.dataUrl, img.format, x, y, w, h);
    } catch {
      doc.setDrawColor(200, 200, 200);
      doc.rect(x, y, THUMB_MAX_MM, THUMB_MAX_MM);
    }
    x += w + THUMB_GAP_MM;
  }

  doc.setTextColor(0, 0, 0);
  return y + rowH + 5;
}

export async function buildTeamsSheetPdf(data: TeamsSheetPdfData): Promise<Blob> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default as AutoTableFn;
  const L = labels(data.sheetKind);
  const generated = (data.generatedAt ?? new Date()).toLocaleString();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const tableW = contentWidth(doc);

  const includePriceChart = data.includePriceChart !== false;
  const priceChartOnly   = data.priceChartOnly === true;

  // ── Title ─────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(priceChartOnly ? "Price chart" : L.title, MARGIN, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const headerLines = doc.splitTextToSize(
    `Order #${data.orderNo}${data.customerName ? ` · ${data.customerName}` : ""} · Generated ${generated}`,
    tableW,
  );
  doc.text(headerLines, MARGIN, 20);

  let y = 20 + headerLines.length * 4 + 4;

  // ── Teams / roster section (skipped when priceChartOnly) ──────────────────
  if (!priceChartOnly) {
    if (data.groups.length === 0) {
      doc.setFontSize(10);
      doc.text("No sheet data yet.", MARGIN, y);
    }

    const isSvcLocal = data.sheetKind === "services";
    const colIndexW  = 9;
    const colJerseyW = isSvcLocal ? 0 : 16;
    const colNameW   = isSvcLocal ? 42 : 38;
    const colLinesW  = tableW - colIndexW - colJerseyW - colNameW;

    for (const group of data.groups) {
      const urls = (group.designImageUrls || []).filter((u) => u.trim().length > 0);
      const allImages = (
        await Promise.all(urls.slice(0, 12).map((u) => loadPdfImage(u.trim())))
      ).filter((x): x is PdfImage => x != null);

      // First image → large hero in top-right; extras → thumbnail strip below table
      const heroImage  = allImages[0] ?? null;
      const extraImages = allImages.slice(1);

      const blockH = 12 + Math.max(group.rows.length * 6, 18);
      y = ensureSpace(doc, y, blockH);

      // ── Group header ──────────────────────────────────────────────────────
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`${L.group}: ${group.teamName || "—"}`, MARGIN, y);
      y += 5;

      const tableStartY = y;

      // ── Hero photo — placed top-right, beside the table ───────────────────
      let heroH = 0;
      if (heroImage) {
        const heroW = HERO_PHOTO_MM;
        heroH = heroW / heroImage.aspect; // proportional height
        const photoX = MARGIN + tableW - heroW;
        const photoY = tableStartY;
        try {
          doc.setDrawColor(180, 180, 180);
          doc.setLineWidth(0.2);
          doc.rect(photoX, photoY, heroW, heroH);
          doc.addImage(heroImage.dataUrl, heroImage.format, photoX, photoY, heroW, heroH);
        } catch {
          // silently skip broken image
        }
      }

      // ── Player table — narrowed when hero photo present ───────────────────
      const photoReserve = heroImage ? HERO_PHOTO_MM + HERO_PHOTO_GAP_MM : 0;
      const narrowTableW = tableW - photoReserve;

      const narrowColLinesW = narrowTableW - colIndexW - colJerseyW - colNameW;

      const head = isSvcLocal
        ? [["#", L.colName, L.colLines]]
        : [["#", L.colName, "Jersey #", L.colLines]];

      const body = isSvcLocal
        ? group.rows.map((r) => [
            String(r.index),
            r.surname.trim() || "—",
            formatSheetLinesForPdf(r.lines),
          ])
        : group.rows.map((r) => [
            String(r.index),
            r.surname.trim() || "—",
            r.jerseyNumber?.trim() || "—",
            formatSheetLinesForPdf(r.lines),
          ]);

      autoTable(doc, {
        startY: tableStartY,
        tableWidth: narrowTableW,
        head,
        body,
        theme: "grid",
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          overflow: "linebreak",
          valign: "top",
          lineWidth: 0.1,
          minCellHeight: 5,
        },
        headStyles: { fillColor: [45, 45, 45], textColor: 255, fontSize: 7.5, valign: "middle" },
        columnStyles: isSvcLocal
          ? {
              0: { cellWidth: colIndexW, halign: "center" },
              1: { cellWidth: colNameW },
              2: { cellWidth: narrowTableW - colIndexW - colNameW },
            }
          : {
              0: { cellWidth: colIndexW, halign: "center" },
              1: { cellWidth: colNameW },
              2: { cellWidth: colJerseyW, halign: "center" },
              3: { cellWidth: Math.max(narrowColLinesW, 20), fontSize: 7.5, cellPadding: 2.5 },
            },
        margin: { left: MARGIN, right: MARGIN },
        rowPageBreak: "avoid",
      });

      // Advance past whichever is taller — table or hero photo
      y = Math.max(tableEndY(doc), tableStartY + heroH) + 5;

      // ── Extra photos (2nd, 3rd, …) as small thumbnails below the table ───
      if (extraImages.length > 0) {
        y = drawDesignPhotos(doc, extraImages, y);
      }

      y += 4;
    }
  }

  // ── Price chart section ───────────────────────────────────────────────────
  if (includePriceChart || priceChartOnly) {
    y = ensureSpace(doc, y, 45);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Price chart", MARGIN, y);
    y += 6;

    const priceColW = tableW / 5;

    if (data.priceLines.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("No line items.", MARGIN, y);
    } else {
      autoTable(doc, {
        startY: y,
        tableWidth: tableW,
        head: [[L.priceLineHdr, "Size", "Qty", "Unit price", "Subtotal"]],
        body: data.priceLines.map((line) => {
          const sub = line.count * line.unitPrice;
          return [
            line.name.trim() || "—",
            line.size.trim() || "—",
            String(line.count),
            line.unitPrice > 0 ? pesoPdf(line.unitPrice) : "—",
            sub > 0 ? pesoPdf(sub) : "—",
          ];
        }),
        foot: [
          [
            { content: "Grand total", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
            { content: pesoPdf(data.orderTotal), styles: { halign: "right", fontStyle: "bold" } },
          ],
          [
            { content: "Down payment", colSpan: 4, styles: { halign: "right" } },
            {
              content: data.downPayment > 0 ? pesoPdf(data.downPayment) : "—",
              styles: { halign: "right" },
            },
          ],
          [
            { content: "Balance", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
            { content: pesoPdf(data.balance), styles: { halign: "right", fontStyle: "bold" } },
          ],
        ],
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 1.5, overflow: "linebreak", valign: "top" },
        headStyles: { fillColor: [45, 45, 45], textColor: 255 },
        footStyles: { fillColor: [245, 245, 245], textColor: [30, 30, 30] },
        columnStyles: {
          0: { cellWidth: priceColW * 1.35 },
          1: { cellWidth: priceColW * 0.85 },
          2: { cellWidth: priceColW * 0.55, halign: "center" },
          3: { cellWidth: priceColW * 0.9, halign: "right" },
          4: { cellWidth: priceColW * 0.9, halign: "right" },
        },
        margin: { left: MARGIN, right: MARGIN },
      });
    }
  }

  return doc.output("blob");
}

export function downloadTeamsSheetPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
