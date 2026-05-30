import { peso } from "@/lib/utils";

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
  designPhotoCount: number;
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
  generatedAt?: Date;
};

type JsPDFDoc = import("jspdf").jsPDF;
type AutoTableFn = typeof import("jspdf-autotable").default;

const MARGIN = 10;

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
      const mark = item.checked ? "✓" : "○";
      return size ? `${mark} ${name} (${size})` : `${mark} ${name}`;
    })
    .join("; ");
}

function tableEndY(doc: JsPDFDoc): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return last?.finalY ?? MARGIN + 8;
}

function ensureSpace(doc: JsPDFDoc, needed: number) {
  const pageH = doc.internal.pageSize.getHeight();
  if (tableEndY(doc) + needed > pageH - MARGIN) doc.addPage();
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

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(L.title, MARGIN, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Order #${data.orderNo}${data.customerName ? ` · ${data.customerName}` : ""} · Generated ${generated}`,
    MARGIN,
    20,
  );

  let startY = 26;

  if (data.groups.length === 0) {
    doc.setFontSize(10);
    doc.text("No sheet data yet.", MARGIN, startY);
  }

  for (const group of data.groups) {
    ensureSpace(doc, 24);
    startY = tableEndY(doc) + (startY > 26 ? 6 : 0);
    if (startY > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      startY = MARGIN + 6;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${L.group}: ${group.teamName || "—"}`, MARGIN, startY);
    startY += 4;
    if (group.designPhotoCount > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(`${group.designPhotoCount} design photo(s) on file`, MARGIN, startY);
      doc.setTextColor(0, 0, 0);
      startY += 4;
    }

    const head = data.sheetKind === "services"
      ? [["#", L.colName, L.colLines]]
      : [["#", L.colName, "Jersey #", L.colLines]];

    const body =
      data.sheetKind === "services"
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
      startY: startY + 1,
      head,
      body,
      theme: "grid",
      styles: { fontSize: 7.5, cellPadding: 1.2, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [45, 45, 45], textColor: 255, fontSize: 7.5 },
      columnStyles:
        data.sheetKind === "services"
          ? { 0: { cellWidth: 8, halign: "center" }, 2: { cellWidth: 90 } }
          : { 0: { cellWidth: 8, halign: "center" }, 2: { cellWidth: 14, halign: "center" }, 3: { cellWidth: 80 } },
      margin: { left: MARGIN, right: MARGIN },
    });
  }

  ensureSpace(doc, 40);
  let priceY = tableEndY(doc) + 8;
  if (priceY > doc.internal.pageSize.getHeight() - 35) {
    doc.addPage();
    priceY = MARGIN + 8;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Price chart", MARGIN, priceY);
  priceY += 5;

  if (data.priceLines.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("No line items.", MARGIN, priceY);
  } else {
    autoTable(doc, {
      startY: priceY,
      head: [[L.priceLineHdr, "Size", "Qty", "Unit price", "Subtotal"]],
      body: data.priceLines.map((line) => {
        const sub = line.count * line.unitPrice;
        return [
          line.name,
          line.size || "—",
          String(line.count),
          line.unitPrice > 0 ? peso(line.unitPrice) : "—",
          sub > 0 ? peso(sub) : "—",
        ];
      }),
      foot: [
        [
          { content: "Grand total", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
          { content: peso(data.orderTotal), styles: { halign: "right", fontStyle: "bold" } },
        ],
        [
          { content: "Down payment", colSpan: 4, styles: { halign: "right" } },
          { content: data.downPayment > 0 ? peso(data.downPayment) : "—", styles: { halign: "right" } },
        ],
        [
          { content: "Balance", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
          { content: peso(data.balance), styles: { halign: "right", fontStyle: "bold" } },
        ],
      ],
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 1.2 },
      headStyles: { fillColor: [45, 45, 45], textColor: 255 },
      footStyles: { fillColor: [245, 245, 245], textColor: [30, 30, 30] },
      columnStyles: { 2: { halign: "center" }, 3: { halign: "right" }, 4: { halign: "right" } },
      margin: { left: MARGIN, right: MARGIN },
    });
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
