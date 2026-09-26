"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, Plus, ShoppingBag, Store, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountInput } from "@/components/ui/amount-input";
import { PageHeader } from "@/components/page-header";
import { canEdit } from "@/lib/role-permissions";
import { useWorkspaceShell } from "@/components/workspace-shell-context";
import { cn, formatSupabaseError } from "@/lib/utils";
import { RESELLER_PRODUCT_IMAGE_MAX } from "@/lib/media-storage";
import {
  DEFAULT_SIZE_CHART_ROWS,
  RESELLER_CATEGORIES,
  RESELLER_OPTION_MAX,
  RESELLER_PRODUCT_DESC_MAX,
  RESELLER_PRODUCT_NAME_MAX,
  RESELLER_SIZE_PRESETS,
  RESELLER_SPEC_FIELDS,
  RESELLER_VARIATION_MAX,
  coverImage,
  emptyResellerDraft,
  expandResellerSkus,
  formatResellerPrice,
  labeledOptions,
  newResellerId,
  parseResellerProduct,
  resellerTableMissing,
  skuOptionLabels,
  suggestSku,
  toResellerProductPayload,
  type ResellerProduct,
  type ResellerVariation,
} from "@/lib/reseller-products";
import {
  removeResellerProductFiles,
  uploadResellerOptionImage,
  uploadResellerProductImage,
} from "@/lib/reseller-product-upload";

const SECTIONS = [
  { id: "basic", label: "Basic information" },
  { id: "specification", label: "Specification" },
  { id: "description", label: "Description" },
  { id: "sales", label: "Sales information" },
  { id: "shipping", label: "Shipping" },
  { id: "others", label: "Others" },
] as const;

const selectClass = cn(
  "flex h-11 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm sm:h-9 sm:text-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-primary",
);

const textareaClass = cn(
  "min-h-[160px] w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm sm:text-sm",
  "placeholder:text-muted-foreground/70",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-primary",
);

function scrollToSection(id: string) {
  document.getElementById(`reseller-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ResellerProductForm({ productId }: { productId?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const { userId, permissions } = useWorkspaceShell();
  const editable = canEdit(permissions, "reseller");
  const imageInput = useRef<HTMLInputElement>(null);
  const [product, setProduct] = useState<ResellerProduct>(() => emptyResellerDraft());
  const [loading, setLoading] = useState(Boolean(productId));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("basic");
  const [missingTable, setMissingTable] = useState(false);
  const [customCategory, setCustomCategory] = useState(false);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    (async () => {
      const { data, error: loadErr } = await supabase.from("reseller_products").select("*").eq("id", productId).maybeSingle();
      if (cancelled) return;
      if (loadErr) {
        const msg = formatSupabaseError(loadErr);
        setMissingTable(resellerTableMissing(msg));
        setError(msg);
        setLoading(false);
        return;
      }
      if (!data) {
        setError("Product not found.");
        setLoading(false);
        return;
      }
      const parsed = parseResellerProduct(data as Record<string, unknown>);
      setProduct(parsed);
      setCustomCategory(
        Boolean(parsed.category) && !RESELLER_CATEGORIES.includes(parsed.category as (typeof RESELLER_CATEGORIES)[number]),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const skus = useMemo(() => expandResellerSkus(product.variations, product.skus), [product.variations, product.skus]);
  const priceLabel = formatResellerPrice(skus);
  const previewImage = coverImage(product.images);

  function update(partial: Partial<ResellerProduct>) {
    setProduct((prev) => {
      const next = { ...prev, ...partial };
      if (partial.variations) next.skus = expandResellerSkus(partial.variations, prev.skus);
      return next;
    });
  }

  async function onAddImages(files: FileList | null) {
    if (!files?.length || !editable) return;
    const room = RESELLER_PRODUCT_IMAGE_MAX - product.images.length;
    if (room <= 0) return;
    setUploading(true);
    setError("");
    try {
      const next = [...product.images];
      for (const file of Array.from(files).slice(0, room)) {
        next.push(await uploadResellerProductImage(product.id, file, next));
      }
      update({ images: next });
    } catch (e) {
      setError(formatSupabaseError(e));
    } finally {
      setUploading(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  }

  async function removeImage(index: number) {
    const image = product.images[index];
    if (!image) return;
    update({ images: product.images.filter((_, i) => i !== index) });
    if (image.path) void removeResellerProductFiles([image.path]);
  }

  function addVariation() {
    if (product.variations.length >= RESELLER_VARIATION_MAX) return;
    const name = product.variations.length === 0 ? "Color" : "Size";
    const extra: ResellerVariation = {
      id: newResellerId(),
      name,
      options: [{ id: newResellerId(), label: "" }],
    };
    update({ variations: [...product.variations, extra] });
  }

  function fillSizePresets(variationId: string) {
    update({
      variations: product.variations.map((v) =>
        v.id === variationId
          ? {
              ...v,
              options: RESELLER_SIZE_PRESETS.map((label) => {
                const existing = v.options.find((o) => o.label.toUpperCase() === label);
                return existing ?? { id: newResellerId(), label };
              }),
            }
          : v,
      ),
    });
  }

  async function save(status: ResellerProduct["status"]) {
    if (!editable) return;
    const name = product.name.trim();
    if (status === "listed" && !name) {
      setError("Add a product name before publishing.");
      setSection("basic");
      scrollToSection("basic");
      return;
    }
    if (status === "listed" && product.images.length === 0) {
      setError("Add at least one product image before publishing.");
      setSection("basic");
      scrollToSection("basic");
      return;
    }
    setSaving(true);
    setError("");
    const payload = toResellerProductPayload({ ...product, name, status, skus }, userId);
    const { error: saveErr } = await supabase.from("reseller_products").upsert(payload, { onConflict: "id" });
    setSaving(false);
    if (saveErr) {
      const msg = formatSupabaseError(saveErr);
      setMissingTable(resellerTableMissing(msg));
      setError(msg);
      return;
    }
    router.push("/admin/reseller/products");
    router.refresh();
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading product…</p>;
  }

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        title={productId ? "Edit product" : "Add product"}
        description="Fill in the listing the same way as a Shopee seller product."
        action={
          <Link href="/admin/reseller/products" className={cn(buttonVariants({ variant: "outline" }))}>
            Back to products
          </Link>
        }
      />

      <nav className="sticky top-0 z-10 -mx-1 overflow-x-auto border-b bg-background/95 px-1 py-1 backdrop-blur [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-max gap-1">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSection(item.id);
                scrollToSection(item.id);
              }}
              className={cn(
                "h-10 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors",
                section === item.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {missingTable && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Apply migration 112 (reseller_products), then reload.
        </p>
      )}
      {error && !missingTable && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-5">
          <Section id="basic" title="Basic information">
            <div className="space-y-2">
              <Label>Product images</Label>
              <p className="text-xs text-muted-foreground">First image is the cover. Up to {RESELLER_PRODUCT_IMAGE_MAX} photos.</p>
              <div className="flex flex-wrap gap-2">
                {product.images.map((img, i) => (
                  <div key={img.path || img.url} className="relative h-20 w-20 overflow-hidden rounded-md border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                    {i === 0 && (
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 text-center text-[10px] text-white">
                        Cover
                      </span>
                    )}
                    {editable && (
                      <div className="absolute right-0.5 top-0.5 flex gap-0.5">
                        {i > 0 && (
                          <button
                            type="button"
                            className="rounded bg-black/60 px-1 text-[10px] text-white"
                            onClick={() =>
                              update({
                                images: [img, ...product.images.filter((_, idx) => idx !== i)],
                              })
                            }
                          >
                            Cover
                          </button>
                        )}
                        <button type="button" className="rounded bg-black/60 p-0.5 text-white" onClick={() => void removeImage(i)}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {editable && product.images.length < RESELLER_PRODUCT_IMAGE_MAX && (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => imageInput.current?.click()}
                    className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground hover:bg-accent"
                  >
                    <ImagePlus className="h-4 w-4" />
                    {uploading ? "Uploading" : "Add"}
                  </button>
                )}
              </div>
              <input
                ref={imageInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void onAddImages(e.target.files)}
              />
            </div>

            <Field label={`Product name *`} hint={`${product.name.length}/${RESELLER_PRODUCT_NAME_MAX}`}>
              <Input
                value={product.name}
                maxLength={RESELLER_PRODUCT_NAME_MAX}
                disabled={!editable}
                placeholder="Product name"
                onChange={(e) => update({ name: e.target.value })}
              />
            </Field>

            <Field label="Category">
              <select
                className={selectClass}
                value={customCategory ? "__custom" : product.category}
                disabled={!editable}
                onChange={(e) => {
                  if (e.target.value === "__custom") {
                    setCustomCategory(true);
                    update({ category: "" });
                    return;
                  }
                  setCustomCategory(false);
                  update({ category: e.target.value });
                }}
              >
                <option value="">Select a category</option>
                {RESELLER_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__custom">Other</option>
              </select>
              {customCategory && (
                <Input
                  className="mt-2"
                  value={product.category}
                  disabled={!editable}
                  placeholder="Custom category"
                  onChange={(e) => update({ category: e.target.value })}
                />
              )}
            </Field>
          </Section>

          <Section id="specification" title="Specification">
            <div className="grid gap-3 sm:grid-cols-2">
              {RESELLER_SPEC_FIELDS.map((field) => (
                <Field key={field.key} label={field.label}>
                  <select
                    className={selectClass}
                    value={product.specs[field.key] || ""}
                    disabled={!editable}
                    onChange={(e) => update({ specs: { ...product.specs, [field.key]: e.target.value } })}
                  >
                    <option value="">Select</option>
                    {field.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
          </Section>

          <Section id="description" title="Description">
            <Field label="Product description" hint={`${product.description.length}/${RESELLER_PRODUCT_DESC_MAX}`}>
              <textarea
                className={textareaClass}
                maxLength={RESELLER_PRODUCT_DESC_MAX}
                disabled={!editable}
                placeholder="Enter product description"
                value={product.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </Field>
          </Section>

          <Section id="sales" title="Sales information">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label>Variations</Label>
              {editable && product.variations.length < RESELLER_VARIATION_MAX && (
                <Button type="button" size="sm" variant="outline" onClick={addVariation}>
                  <Plus className="h-3.5 w-3.5" /> Add variation
                </Button>
              )}
            </div>

            {product.variations.length === 0 && (
              <p className="text-sm text-muted-foreground">No variations. Add Color and Size, or set a single price below.</p>
            )}

            <div className="space-y-4">
              {product.variations.map((variation, vIndex) => (
                <div key={variation.id} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      value={variation.name}
                      disabled={!editable}
                      placeholder={vIndex === 0 ? "Color" : "Size"}
                      onChange={(e) =>
                        update({
                          variations: product.variations.map((v) => (v.id === variation.id ? { ...v, name: e.target.value } : v)),
                        })
                      }
                    />
                    {variation.name.toLowerCase().includes("size") && editable && (
                      <Button type="button" size="sm" variant="outline" onClick={() => fillSizePresets(variation.id)}>
                        S–3XL
                      </Button>
                    )}
                    {editable && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => update({ variations: product.variations.filter((v) => v.id !== variation.id) })}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {variation.options.map((option) => (
                      <div key={option.id} className="flex items-center gap-2">
                        <label className="relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border bg-muted">
                          {option.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={option.image_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImagePlus className="h-4 w-4 text-muted-foreground" />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={!editable}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (!file) return;
                              try {
                                const uploaded = await uploadResellerOptionImage(product.id, option.id, file);
                                update({
                                  variations: product.variations.map((v) =>
                                    v.id === variation.id
                                      ? {
                                          ...v,
                                          options: v.options.map((o) =>
                                            o.id === option.id ? { ...o, image_url: uploaded.url, image_path: uploaded.path } : o,
                                          ),
                                        }
                                      : v,
                                  ),
                                });
                              } catch (err) {
                                setError(formatSupabaseError(err));
                              }
                            }}
                          />
                        </label>
                        <Input
                          value={option.label}
                          disabled={!editable}
                          placeholder="Option name"
                          onChange={(e) =>
                            update({
                              variations: product.variations.map((v) =>
                                v.id === variation.id
                                  ? { ...v, options: v.options.map((o) => (o.id === option.id ? { ...o, label: e.target.value } : o)) }
                                  : v,
                              ),
                            })
                          }
                        />
                        {editable && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              update({
                                variations: product.variations.map((v) =>
                                  v.id === variation.id ? { ...v, options: v.options.filter((o) => o.id !== option.id) } : v,
                                ),
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {editable && variation.options.length < RESELLER_OPTION_MAX && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          update({
                            variations: product.variations.map((v) =>
                              v.id === variation.id ? { ...v, options: [...v.options, { id: newResellerId(), label: "" }] } : v,
                            ),
                          })
                        }
                      >
                        <Plus className="h-3.5 w-3.5" /> Add option
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <VariationList
              product={product}
              skus={skus}
              editable={editable}
              onSkus={(next) => update({ skus: next })}
            />

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Size chart</Label>
                {editable && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => update({ size_chart: { name: product.size_chart.name || "Size chart", rows: DEFAULT_SIZE_CHART_ROWS } })}
                  >
                    Use clothing chart
                  </Button>
                )}
              </div>
              <Input
                value={product.size_chart.name}
                disabled={!editable}
                placeholder="Chart name"
                onChange={(e) => update({ size_chart: { ...product.size_chart, name: e.target.value } })}
              />
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Size</th>
                      <th className="px-3 py-2 font-medium">Width (in)</th>
                      <th className="px-3 py-2 font-medium">Top length (in)</th>
                      <th className="px-3 py-2 font-medium">Sleeve (in)</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {product.size_chart.rows.map((row, i) => (
                      <tr key={`${row.size}-${i}`} className="border-t">
                        {(["size", "width", "top_length", "sleeve_length"] as const).map((key) => (
                          <td key={key} className="px-2 py-1">
                            <Input
                              value={row[key]}
                              disabled={!editable}
                              onChange={(e) =>
                                update({
                                  size_chart: {
                                    ...product.size_chart,
                                    rows: product.size_chart.rows.map((r, idx) => (idx === i ? { ...r, [key]: e.target.value } : r)),
                                  },
                                })
                              }
                            />
                          </td>
                        ))}
                        <td>
                          {editable && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                update({
                                  size_chart: { ...product.size_chart, rows: product.size_chart.rows.filter((_, idx) => idx !== i) },
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {editable && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    update({
                      size_chart: {
                        ...product.size_chart,
                        rows: [...product.size_chart.rows, { size: "", width: "", top_length: "", sleeve_length: "" }],
                      },
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Add size row
                </Button>
              )}
            </div>
          </Section>

          <Section id="shipping" title="Shipping">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Weight (g)">
                <AmountInput
                  value={product.shipping.weight_g}
                  disabled={!editable}
                  placeholder="0"
                  onValueChange={(n) => update({ shipping: { ...product.shipping, weight_g: n } })}
                />
              </Field>
              <Field label="Length (cm)">
                <AmountInput
                  value={product.shipping.length_cm}
                  disabled={!editable}
                  placeholder="0"
                  onValueChange={(n) => update({ shipping: { ...product.shipping, length_cm: n } })}
                />
              </Field>
              <Field label="Width (cm)">
                <AmountInput
                  value={product.shipping.width_cm}
                  disabled={!editable}
                  placeholder="0"
                  onValueChange={(n) => update({ shipping: { ...product.shipping, width_cm: n } })}
                />
              </Field>
              <Field label="Height (cm)">
                <AmountInput
                  value={product.shipping.height_cm}
                  disabled={!editable}
                  placeholder="0"
                  onValueChange={(n) => update({ shipping: { ...product.shipping, height_cm: n } })}
                />
              </Field>
            </div>
          </Section>

          <Section id="others" title="Others">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={product.preorder}
                disabled={!editable}
                onChange={(e) => update({ preorder: e.target.checked })}
              />
              <span>
                <span className="font-medium">Enable pre-order</span>
                <span className="block text-muted-foreground">Buyers can order this listing before stock is ready.</span>
              </span>
            </label>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-14">
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="text-sm font-semibold">Preview</div>
              <div className="overflow-hidden rounded-md border bg-muted">
                {previewImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewImage} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-muted-foreground">
                    <ShoppingBag className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="text-lg font-semibold text-primary">{priceLabel || "₱ —"}</div>
              <div className="text-sm font-medium leading-snug">{product.name || "Product name"}</div>
              {product.category && <div className="text-xs text-muted-foreground">{product.category}</div>}
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <Store className="h-3.5 w-3.5" />
                  {product.specs.brand || "Store"}
                </span>
                <span className="text-muted-foreground">Preview only</span>
              </div>
              {product.variations.some((v) => labeledOptions(v).length > 0) && (
                <div className="space-y-2">
                  {product.variations.map((v) => {
                    const opts = labeledOptions(v);
                    if (!opts.length) return null;
                    return (
                      <div key={v.id}>
                        <div className="mb-1 text-xs text-muted-foreground">{v.name || "Option"}</div>
                        <div className="flex flex-wrap gap-1">
                          {opts.map((o) => (
                            <span key={o.id} className="rounded-md border px-2 py-0.5 text-xs">
                              {o.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" disabled>
                  Add to cart
                </Button>
                <Button type="button" disabled>
                  Buy now
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">This is a seller preview, not the buyer storefront.</p>
            </CardContent>
          </Card>
        </aside>
      </div>

      {editable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-7xl flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={() => void save("draft")}>
              Save draft
            </Button>
            <Button type="button" disabled={saving || uploading} onClick={() => void save("listed")}>
              {saving ? "Saving…" : "Publish"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Card id={`reseller-${id}`}>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {children}
      </CardContent>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function VariationList({
  product,
  skus,
  editable,
  onSkus,
}: {
  product: ResellerProduct;
  skus: ResellerProduct["skus"];
  editable: boolean;
  onSkus: (skus: ResellerProduct["skus"]) => void;
}) {
  const [bulkPrice, setBulkPrice] = useState(0);
  const [bulkStock, setBulkStock] = useState(0);
  const [bulkSku, setBulkSku] = useState("");
  const variationNames = product.variations.filter((v) => labeledOptions(v).length).map((v) => v.name || "Option");

  function patch(index: number, partial: Partial<(typeof skus)[number]>) {
    onSkus(skus.map((row, i) => (i === index ? { ...row, ...partial } : row)));
  }

  return (
    <div className="space-y-3">
      <Label>Variation list</Label>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <AmountInput value={bulkPrice} disabled={!editable} placeholder="Price" onValueChange={setBulkPrice} />
        <AmountInput value={bulkStock} disabled={!editable} placeholder="Stock" inputMode="numeric" onValueChange={setBulkStock} />
        <Input value={bulkSku} disabled={!editable} placeholder="SKU" onChange={(e) => setBulkSku(e.target.value)} />
        <Button
          type="button"
          variant="outline"
          disabled={!editable}
          onClick={() =>
            onSkus(
              skus.map((row) => ({
                ...row,
                price: bulkPrice || row.price,
                stock: bulkStock || row.stock,
                sku: bulkSku.trim() || row.sku || suggestSku(product.name, skuOptionLabels(row, product.variations)),
              })),
            )
          }
        >
          Apply to all
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              {variationNames.map((name) => (
                <th key={name} className="px-3 py-2 font-medium">
                  {name}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Stock</th>
              <th className="px-3 py-2 font-medium">SKU</th>
            </tr>
          </thead>
          <tbody>
            {skus.map((row, i) => {
              const labels = skuOptionLabels(row, product.variations);
              return (
                <tr key={row.option_ids.join("-") || "base"} className="border-t">
                  {variationNames.length
                    ? labels.map((label, li) => (
                        <td key={`${row.option_ids[li] || li}`} className="px-3 py-2">
                          {label}
                        </td>
                      ))
                    : null}
                  <td className="px-2 py-1">
                    <AmountInput value={row.price} disabled={!editable} placeholder="0" onValueChange={(n) => patch(i, { price: n })} />
                  </td>
                  <td className="px-2 py-1">
                    <AmountInput
                      value={row.stock}
                      disabled={!editable}
                      placeholder="0"
                      inputMode="numeric"
                      onValueChange={(n) => patch(i, { stock: n })}
                    />
                  </td>
                  <td className="px-2 py-1">
                    <Input
                      value={row.sku}
                      disabled={!editable}
                      placeholder={suggestSku(product.name, labels) || "SKU"}
                      onChange={(e) => patch(i, { sku: e.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
