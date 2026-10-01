"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { ResellerNav } from "../reseller-nav";
import { ResellerPlaceOrderDialog } from "../reseller-place-order-dialog";
import { ResellerProductPhotoStrip } from "./reseller-product-photo-strip";
import { useWorkspaceShell } from "@/components/workspace-shell-context";
import { isResellerRole } from "@/lib/roles";
import { cn, peso } from "@/lib/utils";
import {
  RESELLER_SPEC_FIELDS,
  findSkuForOptionIds,
  formatResellerPrice,
  labeledOptions,
  orderVariations,
  productPhotos,
  type ResellerProduct,
} from "@/lib/reseller-products";

export function ResellerProductView({ product }: { product: ResellerProduct }) {
  const router = useRouter();
  const { role, userId } = useWorkspaceShell();
  const canOrder = isResellerRole(role);
  const [orderOpen, setOrderOpen] = useState(false);
  const photos = productPhotos(product);
  const variations = orderVariations(product);
  const [optionIds, setOptionIds] = useState(() =>
    variations.map((v) => labeledOptions(v)[0]?.id).filter(Boolean) as string[],
  );
  const specs = RESELLER_SPEC_FIELDS.map((field) => ({
    label: field.label,
    value: (product.specs[field.key] || "").trim(),
  })).filter((row) => row.value);
  const sizeRows = (product.size_chart.rows || []).filter((row) => row.size.trim());
  const selectedSku = findSkuForOptionIds(product, optionIds);
  const selectedPrice = Number(selectedSku?.price) || 0;
  const selectedLabels = variations
    .map((variation) => labeledOptions(variation).find((o) => optionIds.includes(o.id))?.label)
    .filter(Boolean) as string[];

  function chooseOption(variationId: string, optionId: string) {
    const next = variations
      .map((v) => {
        if (v.id === variationId) return optionId;
        return optionIds.find((id) => v.options.some((o) => o.id === id)) || labeledOptions(v)[0]?.id || "";
      })
      .filter(Boolean);
    setOptionIds(next);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name || "Product"}
        description="Product details, photos, and variations."
        action={
          <Link href="/admin/reseller/products" className={cn(buttonVariants({ variant: "outline" }))}>
            Back to products
          </Link>
        }
      />
      <ResellerNav />
      <Card>
        <CardContent className="grid gap-6 p-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] sm:p-5">
          <ResellerProductPhotoStrip photos={photos} alt={product.name || "Product"} layout="detail" />
          <div className="space-y-4">
            {product.category && <p className="text-sm text-muted-foreground">{product.category}</p>}
            <p className="text-2xl font-semibold text-primary">
              {selectedPrice > 0 ? peso(selectedPrice) : formatResellerPrice(product.skus) || peso(0)}
            </p>
            {product.preorder && <Badge variant="amber">Pre-order</Badge>}

            <div className="space-y-4">
              {variations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No variations.</p>
              ) : (
                variations.map((variation) => {
                  const opts = labeledOptions(variation);
                  const withImages = opts.some((o) => o.image_url);
                  return (
                    <div key={variation.id} className="space-y-2">
                      <div className="text-sm">
                        <span className="font-medium">{variation.name || "Variation"}</span>
                        {opts.find((o) => optionIds.includes(o.id))?.label ? (
                          <span className="text-muted-foreground">
                            {" · "}
                            {opts.find((o) => optionIds.includes(o.id))?.label}
                          </span>
                        ) : null}
                      </div>
                      <div className={cn("flex flex-wrap", withImages ? "gap-2.5" : "gap-2")}>
                        {opts.map((option) => {
                          const selected = optionIds.includes(option.id);
                          if (withImages) {
                            return (
                              <button
                                key={option.id}
                                type="button"
                                onClick={() => chooseOption(variation.id, option.id)}
                                className={cn(
                                  "w-[4.75rem] overflow-hidden rounded-xl border bg-muted/20 text-left transition-colors",
                                  selected
                                    ? "border-primary ring-2 ring-primary/40"
                                    : "border-border/80 hover:border-foreground/30",
                                )}
                              >
                                <div className="aspect-square bg-muted">
                                  {option.image_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={option.image_url} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <div className="h-full w-full bg-muted" />
                                  )}
                                </div>
                                <div className="truncate px-1.5 py-1.5 text-center text-[11px] leading-tight">{option.label}</div>
                              </button>
                            );
                          }
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => chooseOption(variation.id, option.id)}
                              className={cn(
                                "min-w-[2.75rem] rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                                selected
                                  ? "border-primary bg-primary/15 font-medium text-foreground ring-1 ring-primary/40"
                                  : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                              )}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
              {selectedLabels.length > 0 && (
                <div className="rounded-lg border bg-muted/15 px-3 py-2.5">
                  <div className="text-xs text-muted-foreground">{selectedLabels.join(" · ")}</div>
                  <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-base font-semibold tabular-nums">{selectedPrice > 0 ? peso(selectedPrice) : "—"}</div>
                    {selectedSku?.sku && <div className="text-xs text-muted-foreground">SKU {selectedSku.sku}</div>}
                  </div>
                </div>
              )}
            </div>

            {canOrder && (
              <Button type="button" onClick={() => setOrderOpen(true)}>
                Place order
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Description</h2>
          {product.description.trim() ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{product.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No description.</p>
          )}
        </CardContent>
      </Card>

      {specs.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4 sm:p-5">
            <h2 className="text-sm font-semibold">Specifications</h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {specs.map((row) => (
                <div key={row.label} className="flex justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="text-right font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      {sizeRows.length > 0 && (
        <Card>
          <CardContent className="space-y-2 p-4 sm:p-5">
            <h2 className="text-sm font-semibold">{product.size_chart.name || "Size chart"}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[20rem] text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Size</th>
                    <th className="px-3 py-2 font-medium">Width</th>
                    <th className="px-3 py-2 font-medium">Top length</th>
                    <th className="px-3 py-2 font-medium">Sleeve</th>
                  </tr>
                </thead>
                <tbody>
                  {sizeRows.map((row, i) => (
                    <tr key={`${row.size}-${i}`} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{row.size}</td>
                      <td className="px-3 py-1.5">{row.width || "—"}</td>
                      <td className="px-3 py-1.5">{row.top_length || "—"}</td>
                      <td className="px-3 py-1.5">{row.sleeve_length || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {canOrder && (
        <ResellerPlaceOrderDialog
          open={orderOpen}
          onClose={() => setOrderOpen(false)}
          products={[product]}
          resellerId={userId}
          seedProductId={product.id}
          seedOptionIds={optionIds}
          onPlaced={() => router.push("/admin/reseller/orders")}
        />
      )}
    </div>
  );
}
