"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { ResellerNav } from "../reseller-nav";
import { ResellerPlaceOrderDialog } from "../reseller-place-order-dialog";
import { useWorkspaceShell } from "@/components/workspace-shell-context";
import { cn, peso } from "@/lib/utils";
import {
  coverImage,
  formatResellerPrice,
  labeledOptions,
  type ResellerProduct,
} from "@/lib/reseller-products";

export function ResellerProductView({ product }: { product: ResellerProduct }) {
  const router = useRouter();
  const { userId } = useWorkspaceShell();
  const [orderOpen, setOrderOpen] = useState(false);
  const image = coverImage(product.images);

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name || "Product"}
        description="View only. Place an order to choose variation, amount, and quantity."
        action={
          <Link href="/admin/reseller/products" className={cn(buttonVariants({ variant: "outline" }))}>
            Back to products
          </Link>
        }
      />
      <ResellerNav />
      <Card>
        <CardContent className="grid gap-5 p-4 sm:grid-cols-[16rem_minmax(0,1fr)] sm:p-5">
          <div className="overflow-hidden rounded-md border bg-muted">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center text-muted-foreground">
                <Package className="h-8 w-8" />
              </div>
            )}
          </div>
          <div className="space-y-3">
            {product.category && <p className="text-sm text-muted-foreground">{product.category}</p>}
            <p className="text-lg font-semibold text-primary">{formatResellerPrice(product.skus) || peso(0)}</p>
            {product.variations.map((variation) => {
              const opts = labeledOptions(variation);
              if (!opts.length) return null;
              return (
                <div key={variation.id}>
                  <div className="mb-1 text-xs text-muted-foreground">{variation.name || "Variation"}</div>
                  <div className="flex flex-wrap gap-1">
                    {opts.map((option) => (
                      <span key={option.id} className="rounded-md border px-2 py-0.5 text-xs">
                        {option.label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {product.description && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{product.description}</p>
            )}
            <Button type="button" onClick={() => setOrderOpen(true)}>
              Place order
            </Button>
          </div>
        </CardContent>
      </Card>
      <ResellerPlaceOrderDialog
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        products={[product]}
        resellerId={userId}
        seedProductId={product.id}
        onPlaced={() => router.push("/admin/reseller/orders")}
      />
    </div>
  );
}
