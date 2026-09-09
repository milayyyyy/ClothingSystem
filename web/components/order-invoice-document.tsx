import { peso, formatDate } from "@/lib/utils";
import type { OrderInvoiceData } from "@/lib/order-invoice";

export function OrderInvoiceDocument({ invoice }: { invoice: OrderInvoiceData }) {
  const lineHdr = invoice.isPOS ? "Item" : invoice.isServicesSheet ? "Service / item" : "Jersey line";
  const issued   = formatDate(invoice.createdAt);
  const showSize = !invoice.isPOS; // POS items have no size column

  return (
    <article className="invoice-doc mx-auto max-w-[210mm] bg-white text-gray-900 shadow-sm print:shadow-none print:max-w-none">

      {/* ── Header bar ─────────────────────────────────────────────────── */}
      <div className="bg-gray-900 px-8 py-6 print:px-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">INVOICE</h1>
            <p className="mt-0.5 text-sm font-medium text-gray-400">PrintShop</p>
          </div>
          <div className="text-right text-sm text-gray-300">
            <p>
              <span className="text-gray-500">Invoice</span>{" "}
              <span className="font-mono font-bold text-white">#{invoice.orderNo}</span>
            </p>
            <p className="mt-1">
              <span className="text-gray-500">Date </span>
              <span className="text-gray-200">{issued}</span>
            </p>
            {invoice.dueDate && (
              <p className="mt-1">
                <span className="text-gray-500">Due </span>
                <span className="text-gray-200">{formatDate(invoice.dueDate)}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Bill-to / Reference ────────────────────────────────────────── */}
      <div className="grid gap-6 border-b border-gray-200 px-8 py-6 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Bill to</p>
          <p className="text-lg font-bold text-gray-900">{invoice.customerName}</p>
          {invoice.customerPhone && (
            <p className="mt-0.5 text-sm text-gray-500">{invoice.customerPhone}</p>
          )}
        </div>
        <div className="sm:text-right">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Order reference</p>
          <p className="font-mono text-sm font-semibold text-gray-700">#{invoice.orderNo}</p>
          {invoice.isPOS && (
            <span className="mt-1 inline-block rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-semibold text-violet-700">
              POS Sale
            </span>
          )}
        </div>
      </div>

      {/* ── Line items ─────────────────────────────────────────────────── */}
      <div className="px-8 py-6">
        {invoice.lineItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
            <p className="text-sm text-gray-500">
              No line items yet. Open the order sheet, add lines to the price chart, and save before generating an invoice.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-gray-900">
                <th className="py-2.5 pr-4 text-left text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  {lineHdr}
                </th>
                {showSize && (
                  <th className="py-2.5 pr-4 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    Size
                  </th>
                )}
                <th className="py-2.5 pr-4 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  Qty
                </th>
                <th className="py-2.5 pr-4 text-right text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  Unit price
                </th>
                <th className="py-2.5 text-right text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoice.lineItems.map((line) => (
                <tr key={line.key} className="hover:bg-gray-50/60">
                  <td className="py-3 pr-4 font-medium text-gray-800">{line.name}</td>
                  {showSize && (
                    <td className="py-3 pr-4 text-center font-mono text-sm text-gray-500">
                      {line.size || "—"}
                    </td>
                  )}
                  <td className="py-3 pr-4 text-center font-mono text-gray-700">{line.quantity}</td>
                  <td className="py-3 pr-4 text-right font-mono text-gray-700">{peso(line.unitPrice)}</td>
                  <td className="py-3 text-right font-mono font-semibold text-gray-900">{peso(line.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {/* Subtotal */}
              <tr className="border-t-2 border-gray-200">
                <td colSpan={showSize ? 4 : 3} className="py-3 pr-4 text-right text-sm text-gray-500">
                  Subtotal
                </td>
                <td className="py-3 text-right font-mono font-semibold text-gray-800">{peso(invoice.subtotal)}</td>
              </tr>
              {/* Down payment */}
              {invoice.downPayment > 0 && (
                <tr>
                  <td colSpan={showSize ? 4 : 3} className="py-1.5 pr-4 text-right text-sm text-gray-500">
                    Down payment
                  </td>
                  <td className="py-1.5 text-right font-mono text-green-700">
                    −{peso(invoice.downPayment)}
                  </td>
                </tr>
              )}
              {/* Balance due */}
              <tr className="border-t-2 border-gray-900">
                <td colSpan={showSize ? 4 : 3} className="py-4 pr-4 text-right text-base font-extrabold text-gray-900">
                  Balance Due
                </td>
                <td className="py-4 text-right font-mono text-base font-extrabold text-gray-900">
                  {peso(invoice.balance)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* ── Notes ─────────────────────────────────────────────────────── */}
      {invoice.notes && (
        <div className="mx-8 mb-6 rounded-lg border border-gray-200 bg-gray-50 px-5 py-4 text-sm print:border-none print:bg-transparent print:px-0">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">Notes</p>
          <p className="whitespace-pre-wrap text-gray-600">{invoice.notes}</p>
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <div className="border-t border-gray-200 px-8 py-5 text-center text-xs text-gray-400">
        Thank you for your business.
      </div>

    </article>
  );
}
