"use client";

import { parseBigSellerLineItems } from "@/lib/bigseller-line-items";

export function BigSellerItemNamesCell({
  designRef,
  lineItems,
  quantity,
  showQuantity = false,
}: {
  designRef: string | null | undefined;
  lineItems: unknown;
  quantity?: number | null;
  /** When true, show order qty above the item name (BigSeller sales list). */
  showQuantity?: boolean;
}) {
  const primary = String(designRef || "").trim() || "—";
  const extra = parseBigSellerLineItems(lineItems);
  const qty = Math.max(0, Math.round(Number(quantity) || 0));
  const qtyLabel = showQuantity && qty > 0 ? `Qty ${qty}` : null;

  if (extra.length === 0) {
    return (
      <div className="space-y-0.5">
        {qtyLabel && <div className="text-[11px] font-medium tabular-nums text-muted-foreground">{qtyLabel}</div>}
        <div className="line-clamp-5 break-words text-foreground">{primary}</div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {qtyLabel && <div className="text-[11px] font-medium tabular-nums text-muted-foreground">{qtyLabel}</div>}
      <div className="break-words text-foreground leading-snug">{primary}</div>
      <details className="group text-xs">
        <summary className="cursor-pointer list-none font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1">
            +{extra.length} more item{extra.length !== 1 ? "s" : ""}
            <span className="text-muted-foreground transition group-open:rotate-180">▾</span>
          </span>
        </summary>
        <ul className="mt-1.5 space-y-1 border-l-2 border-muted-foreground/25 pl-2.5 text-foreground">
          {extra.map((name, i) => (
            <li key={`${i}-${name.slice(0, 24)}`} className="break-words leading-snug">
              {name}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
