"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useConfirmAction } from "@/components/confirm-dialog";
import { canEdit } from "@/lib/role-permissions";
import { useWorkspaceShell } from "@/components/workspace-shell-context";
import { isResellerRole } from "@/lib/roles";
import { ResellerPlaceOrderDialog } from "../reseller-place-order-dialog";
import { cn, formatSupabaseError } from "@/lib/utils";
import {
  formatResellerPrice,
  productPhotos,
  skuStockTotal,
  type ResellerProduct,
} from "@/lib/reseller-products";
import { removeResellerProductFiles } from "@/lib/reseller-product-upload";
import { ResellerProductPhotoStrip } from "./reseller-product-photo-strip";

export function ResellerProductsClient({
  initial,
  tableMissing,
}: {
  initial: ResellerProduct[];
  tableMissing?: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { permissions, role, userId } = useWorkspaceShell();
  const editable = canEdit(permissions, "reseller");
  const canOrder = isResellerRole(role);
  const { ask, dialog } = useConfirmAction();
  const [items, setItems] = useState(initial);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderProductId, setOrderProductId] = useState<string | undefined>();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const blob = [item.name, item.category, item.status, ...item.skus.map((s) => s.sku)].join("\n").toLowerCase();
      return q.split(/\s+/).every((token) => blob.includes(token));
    });
  }, [items, search]);

  function removeProduct(product: ResellerProduct) {
    ask({
      title: "Delete product?",
      description: `Remove ${product.name || "this product"} from Reseller Product.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        const { error: delErr } = await supabase.from("reseller_products").delete().eq("id", product.id);
        if (delErr) {
          setError(formatSupabaseError(delErr));
          return;
        }
        const paths = [
          ...product.images.map((img) => img.path),
          ...product.variations.flatMap((v) => v.options.map((o) => o.image_path || "")),
        ].filter(Boolean);
        if (paths.length) void removeResellerProductFiles(paths);
        setItems((prev) => prev.filter((item) => item.id !== product.id));
        router.refresh();
      },
    });
  }

  return (
    <div className="space-y-4">
      {dialog}
      {tableMissing && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Apply migration 112 (reseller_products), then reload.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {editable && (
          <Link href="/admin/reseller/products/new" className={cn(buttonVariants())}>
            <Plus className="h-4 w-4" /> Add product
          </Link>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">
              {items.length === 0 ? "No reseller products yet." : "No products match this search."}
            </p>
            {editable && items.length === 0 && (
              <Link href="/admin/reseller/products/new" className={cn(buttonVariants(), "mt-4")}>
                <Plus className="h-4 w-4" /> Add product
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const photos = productPhotos(item);
            return (
              <Card key={item.id} className="overflow-hidden transition-shadow hover:shadow-md">
                <ResellerProductPhotoStrip
                  photos={photos}
                  alt={item.name || "Product"}
                  layout="card"
                  mainHref={`/admin/reseller/products/${item.id}`}
                />
                <Link href={`/admin/reseller/products/${item.id}`} className="block">
                  <CardContent className="space-y-2 p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="line-clamp-2 font-medium leading-snug">{item.name || "Untitled product"}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">{item.category || "No category"}</div>
                      </div>
                      {!canOrder && (
                        <Badge variant={item.status === "listed" ? "green" : "muted"}>
                          {item.status === "listed" ? "Listed" : "Draft"}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-primary">{formatResellerPrice(item.skus) || "No price"}</span>
                      {!canOrder && <span className="text-muted-foreground">Stock {skuStockTotal(item.skus)}</span>}
                    </div>
                  </CardContent>
                </Link>
                {editable && (
                  <div className="flex gap-2 border-t px-4 py-3">
                    <Link
                      href={`/admin/reseller/products/${item.id}`}
                      className={cn(buttonVariants({ size: "sm", variant: "outline" }), "flex-1")}
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Link>
                    <Button size="sm" variant="outline" onClick={() => removeProduct(item)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
                {canOrder && (
                  <div className="border-t px-4 py-3">
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => {
                        setOrderProductId(item.id);
                        setOrderOpen(true);
                      }}
                    >
                      Place order
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {canOrder && (
        <ResellerPlaceOrderDialog
          open={orderOpen}
          onClose={() => setOrderOpen(false)}
          products={items}
          resellerId={userId}
          seedProductId={orderProductId}
          onPlaced={() => router.push("/admin/reseller/orders")}
        />
      )}
    </div>
  );
}
