import { peso, formatDate } from "@/lib/utils";
import type { OrderInvoiceData } from "@/lib/order-invoice";

export function OrderInvoiceDocument({ invoice }: { invoice: OrderInvoiceData }) {
  const lineHdr = invoice.isServicesSheet ? "Service / item" : "Jersey line";
  const issued = formatDate(invoice.createdAt);

  return (
    <article className="invoice-doc mx-auto max-w-[210mm] bg-white text-gray-900 print:max-w-none">
      <header className="border-b-2 border-gray-900 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">INVOICE</h1>
            <p className="mt-1 text-sm text-gray-600">PrintShop</p>
          </div>
          <div className="text-right text-sm">
            <p>
              <span className="text-gray-500">Invoice #</span>{" "}
              <span className="font-mono font-semibold">{invoice.orderNo}</span>
            </p>
            <p className="mt-1">
              <span className="text-gray-500">Date</span> {issued}
            </p>
            {invoice.dueDate && (
              <p className="mt-1">
                <span className="text-gray-500">Due</span> {formatDate(invoice.dueDate)}
              </p>
            )}
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-6 sm:grid-cols-2 text-sm">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Bill to</p>
          <p className="mt-1 text-base font-semibold">{invoice.customerName}</p>
          {invoice.customerPhone && (
            <p className="mt-0.5 text-gray-600">{invoice.customerPhone}</p>
          )}
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order reference</p>
          <p className="mt-1 font-mono text-sm">#{invoice.orderNo}</p>
          {!invoice.hasSheetPricing && invoice.lineItems.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">Pricing from order total (no sheet lines saved yet).</p>
          )}
        </div>
      </section>

      <section className="mt-8">
        {invoice.lineItems.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">
            No line items yet. Open the order sheet, add lines to the price chart, and save before generating an
            invoice.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-gray-900 text-left text-xs font-semibold uppercase tracking-wide">
                <th className="py-2 pr-3">{lineHdr}</th>
                <th className="py-2 pr-3 text-center">Size</th>
                <th className="py-2 pr-3 text-center">Qty</th>
                <th className="py-2 pr-3 text-right">Unit price</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((line) => (
                <tr key={line.key} className="border-b border-gray-200">
                  <td className="py-2.5 pr-3 font-medium">{line.name}</td>
                  <td className="py-2.5 pr-3 text-center font-mono text-gray-600">
                    {line.size || "—"}
                  </td>
                  <td className="py-2.5 pr-3 text-center font-mono">{line.quantity}</td>
                  <td className="py-2.5 pr-3 text-right font-mono">{peso(line.unitPrice)}</td>
                  <td className="py-2.5 text-right font-mono font-medium">{peso(line.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-900">
                <td colSpan={4} className="py-3 pr-3 text-right font-semibold">
                  Subtotal
                </td>
                <td className="py-3 text-right font-mono font-semibold">{peso(invoice.subtotal)}</td>
              </tr>
              {invoice.downPayment > 0 && (
                <tr>
                  <td colSpan={4} className="py-1 pr-3 text-right text-gray-600">
                    Down payment
                  </td>
                  <td className="py-1 text-right font-mono text-gray-700">
                    −{peso(invoice.downPayment)}
                  </td>
                </tr>
              )}
              <tr>
                <td colSpan={4} className="py-3 pr-3 text-right text-base font-bold">
                  Balance due
                </td>
                <td className="py-3 text-right font-mono text-base font-bold">{peso(invoice.balance)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {invoice.notes && (
        <section className="mt-8 rounded-md bg-gray-50 p-4 text-sm print:bg-transparent print:p-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-gray-700">{invoice.notes}</p>
        </section>
      )}

      <footer className="mt-10 border-t pt-4 text-center text-xs text-gray-500 print:mt-8">
        Thank you for your business.
      </footer>
    </article>
  );
}
