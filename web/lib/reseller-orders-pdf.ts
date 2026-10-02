/**
 * Reseller orders PDF — BigSeller-style pick list.
 *
 * Uses jspdf + jspdf-autotable (already in package.json).
 * ₱ is not in Helvetica so we use "PHP" as the currency prefix.
 */

import {
  orderTotal,
  resellerProcessLabel,
  type ResellerOrder,
  type ResellerOrderProcess,
} from "@/lib/reseller-orders";

type JsPDFDoc = import("jspdf").jsPDF;
type AutoTableFn = typeof import("jspdf-autotable").default;

function pesoPdf(n: number): string {
  const v = Number(n ?? 0);
  return "PHP " + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function processColor(process: ResellerOrderProcess): [number, number, number] {
  if (process === "completed") return [16, 185, 129];
  if (process === "ready_to_ship") return [20, 184, 166];
  if (process === "processing") return [59, 130, 246];
  if (process === "pending_checking") return [245, 158, 11];
  if (process === "cancelled") return [239, 68, 68];
  return [156, 163, 175]; // draft / muted
}

const MARGIN = 10;

function contentWidth(doc: JsPDFDoc) {
  return doc.internal.pageSize.getWidth() - MARGIN * 2;
}

function pageBottom(doc: JsPDFDoc) {
  return doc.internal.pageSize.getHeight() - MARGIN;
}

function tableEndY(doc: JsPDFDoc): number {
  const last = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return last?.finalY ?? MARGIN;
}

function ensureSpace(doc: JsPDFDoc, y: number, need: number): number {
  if (y + need > pageBottom(doc)) {
    doc.addPage();
    return MARGIN + 5;
  }
  return y;
}

export type ResellerOrderPdfOptions = {
  orders: ResellerOrder[];
  filterLabel?: string;
  generatedAt?: Date;
};

export async function buildResellerOrdersPdf(opts: ResellerOrderPdfOptions): Promise<Blob> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default as AutoTableFn;

  const { orders, filterLabel, generatedAt = new Date() } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const tableW = contentWidth(doc);

  // ── Summary header ──────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("RESELLER ORDERS", MARGIN, 14);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  const totalQty = orders.reduce((s, o) => s + o.items.reduce((s2, item) => s2 + item.qty, 0), 0);
  const totalAmount = orders.reduce((s, o) => s + orderTotal(o.items), 0);

  const summaryLines = [
    `Order count: ${orders.length}    Total items: ${totalQty}    Grand total: ${pesoPdf(totalAmount)}`,
    `${filterLabel ? `Filter: ${filterLabel}    ` : ""}Printed: ${fmtDate(generatedAt)}`,
  ];
  doc.text(summaryLines, MARGIN, 20);

  let y = 20 + summaryLines.length * 4 + 6;

  // ── Per-order blocks ────────────────────────────────────────────────────
  for (let orderIdx = 0; orderIdx < orders.length; orderIdx++) {
    const order = orders[orderIdx];
    const items = order.items;
    const total = orderTotal(items);
    const due = order.downpayment_amount || 0;

    // Estimate block height: header + rows + footer
    const estimatedH = 22 + items.length * 7 + (order.notes ? 6 : 0) + (due > 0 ? 6 : 0);
    y = ensureSpace(doc, y, Math.min(estimatedH, 60));

    // ── Order header bar ──────────────────────────────────────────────
    const [pr, pg, pb] = processColor(order.process);
    doc.setFillColor(pr, pg, pb);
    doc.rect(MARGIN, y, tableW, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`${resellerProcessLabel(order.process).toUpperCase()}`, MARGIN + 2, y + 5);
    doc.text(pesoPdf(total), MARGIN + tableW - 2, y + 5, { align: "right" });
    y += 7;

    // ── Order info line ────────────────────────────────────────────────
    doc.setTextColor(60, 60, 60);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const infoText = [
      order.reseller_name,
      fmtDate(order.created_at),
      order.assigned_name ? `Sent to ${order.assigned_name}` : "",
    ].filter(Boolean).join("  ·  ");
    doc.text(infoText, MARGIN + 2, y + 3.5);
    y += 5;

    // ── Items table ─────────────────────────────────────────────────────
    const colProduct = tableW * 0.48;
    const colVariation = tableW * 0.22;
    const colPrice = tableW * 0.15;
    const colQty = tableW * 0.15;

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: tableW,
      styles: { fontSize: 8, cellPadding: 1.8, lineColor: [220, 220, 220], lineWidth: 0.2, textColor: [40, 40, 40] },
      headStyles: { fillColor: [245, 245, 245], textColor: [80, 80, 80], fontStyle: "bold", lineWidth: 0.2 },
      columnStyles: {
        0: { cellWidth: colProduct },
        1: { cellWidth: colVariation },
        2: { cellWidth: colPrice, halign: "right" },
        3: { cellWidth: colQty, halign: "center" },
      },
      head: [["Product", "Variation", "Unit Price", "Qty"]],
      body: items.map((item) => [
        item.name,
        item.option_labels.length ? item.option_labels.join(", ") : "—",
        pesoPdf(item.price),
        String(item.qty),
      ]),
      didDrawPage: () => {
        // reset text colour after autotable finishes on a new page
        doc.setTextColor(60, 60, 60);
      },
    });

    y = tableEndY(doc) + 1;

    // ── Footer: totals, downpayment, notes ──────────────────────────────
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);

    const footerLines: string[] = [];
    footerLines.push(`Items: ${items.reduce((s, i) => s + i.qty, 0)}    Total: ${pesoPdf(total)}`);
    if (due > 0) {
      const payLabel =
        order.payment_status === "approved" ? "Approved"
          : order.payment_status === "rejected" ? "Rejected"
          : "Pending review";
      footerLines.push(`Downpayment ${order.downpayment_percent}%: ${pesoPdf(due)}  (${payLabel})`);
    }
    if (order.notes) {
      footerLines.push(`Note: ${order.notes.length > 100 ? order.notes.slice(0, 100) + "…" : order.notes}`);
    }

    y = ensureSpace(doc, y, footerLines.length * 4 + 4);
    doc.text(footerLines, MARGIN + 2, y + 3);
    y += footerLines.length * 4 + 5;

    // Divider between orders
    if (orderIdx < orders.length - 1) {
      y = ensureSpace(doc, y, 4);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, y, MARGIN + tableW, y);
      y += 4;
    }
  }

  // ── Footer on last page ────────────────────────────────────────────────
  const lastPageBottom = pageBottom(doc) - 2;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text(`Reseller Orders · Page ${doc.getNumberOfPages()}`, MARGIN, lastPageBottom);

  return doc.output("blob");
}
