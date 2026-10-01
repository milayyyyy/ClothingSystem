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
  formatResellerPrice,
  labeledOptions,
  productPhotos,
  skuOptionLabels,
  type ResellerProduct,
} from "@/lib/reseller-products";

export function ResellerProductView({ product }: { product: ResellerProduct }) {
  const router = useRouter();
  const { role, userId } = useWorkspaceShell();
  const canOrder = isResellerRole(role);
  const [orderOpen, setOrderOpen] = useState(false);
  const photos = productPhotos(product);
  const specs = RESELLER_SPEC_FIELDS.map((field) => ({
    label: field.label,
    value: (product.specs[field.key] || "").trim(),
  })).filter((row) => row.value);
  const sizeRows = (product.size_chart.rows || []).filter((row) => row.size.trim());
  const pricedSkus = product.skus.filter((s) => Number(s.price) > 0 || s.option_ids.length > 0);

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
            <p className="text-2xl font-semibold text-primary">{formatResellerPrice(product.skus) || peso(0)}</p>
            {product.preorder && <Badge variant="amber">Pre-order</Badge>}

            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Variations</h2>
              {product.variations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No variations.</p>
              ) : (
                product.variations.map((variation) => {
                  const opts = labeledOptions(variation);
                  if (!opts.length) return null;
                  return (
                    <div key={variation.id} className="space-y-1.5">
                      <div className="text-xs font-medium text-muted-foreground">{variation.name || "Variation"}</div>
                      <div className="flex flex-wrap gap-2">
                        {opts.map((option) => (
                          <div
                            key={option.id}
                            className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5"
                          >
                            {option.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={option.image_url} alt="" className="h-9 w-9 rounded object-cover" />
                            ) : null}
                            <span className="text-sm">{option.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {pricedSkus.some((s) => s.option_ids.length > 0) && (
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Variation</th>
                      <th className="px-3 py-2 text-right font-medium">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricedSkus.map((sku, i) => (
                      <tr key={`${sku.sku || i}`} className="border-t">
                        <td className="px-3 py-1.5">
                          {skuOptionLabels(sku, product.variations).join(" / ") || sku.sku || "Default"}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {Number(sku.price) > 0 ? peso(sku.price) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

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
          onPlaced={() => router.push("/admin/reseller/orders")}
        />
      )}
    </div>
  );
}
