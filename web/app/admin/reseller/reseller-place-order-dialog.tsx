"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountInput } from "@/components/ui/amount-input";
import { formatSupabaseError, peso } from "@/lib/utils";
import {
  findSkuForOptionIds,
  labeledOptions,
  orderVariations,
  type ResellerProduct,
} from "@/lib/reseller-products";
import {
  listedCatalog,
  orderItemFromProduct,
  orderTotal,
  type ResellerOrderItem,
} from "@/lib/reseller-orders";

const selectClass =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm sm:h-9 sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function firstOptionIds(product: ResellerProduct | null) {
  if (!product) return [];
  return orderVariations(product).map((v) => labeledOptions(v)[0]?.id).filter(Boolean) as string[];
}

export function ResellerPlaceOrderDialog({
  open,
  onClose,
  products,
  resellerId,
  seedProductId,
  onPlaced,
}: {
  open: boolean;
  onClose: () => void;
  products: ResellerProduct[];
  resellerId: string;
  seedProductId?: string;
  onPlaced: () => void;
}) {
  const supabase = createClient();
  const catalog = useMemo(() => listedCatalog(products), [products]);
  const [items, setItems] = useState<ResellerOrderItem[]>([]);
  const [notes, setNotes] = useState("");
  const [pickId, setPickId] = useState(seedProductId || "");
  const [optionIds, setOptionIds] = useState<string[]>([]);
  const [amount, setAmount] = useState(0);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const picked = catalog.find((p) => p.id === pickId) || catalog[0] || null;
  const variations = picked ? orderVariations(picked) : [];
  const selectedSku = picked ? findSkuForOptionIds(picked, optionIds) : null;

  function applyProduct(product: ResellerProduct | null) {
    const ids = firstOptionIds(product);
    const sku = product ? findSkuForOptionIds(product, ids) : null;
    setOptionIds(ids);
    setAmount(Number(sku?.price) || 0);
    setQty(1);
  }

  useEffect(() => {
    if (!open) return;
    const next = catalog.find((p) => p.id === seedProductId) || catalog[0] || null;
    setPickId(next?.id || "");
    applyProduct(next);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seedProductId]);

  function reset() {
    setItems([]);
    setNotes("");
    setError("");
  }

  function chooseProduct(id: string) {
    const product = catalog.find((p) => p.id === id) || null;
    setPickId(id);
    applyProduct(product);
  }

  function chooseOption(variationId: string, optionId: string) {
    if (!picked) return;
    const next = orderVariations(picked).map((v) => {
      if (v.id === variationId) return optionId;
      const current = optionIds.find((id) => v.options.some((o) => o.id === id));
      return current || labeledOptions(v)[0]?.id || "";
    }).filter(Boolean);
    setOptionIds(next);
    const sku = findSkuForOptionIds(picked, next);
    setAmount(Number(sku?.price) || 0);
  }

  function addLine() {
    if (!picked) return;
    const line = orderItemFromProduct(picked, optionIds, qty, amount);
    if (!line) return;
    if (!line.price) {
      setError("Enter an amount for this variation.");
      return;
    }
    setError("");
    setItems((prev) => [...prev, line]);
  }

  async function submit() {
    if (!items.length) {
      setError("Add at least one product.");
      return;
    }
    setSaving(true);
    setError("");
    const { error: saveErr } = await supabase.from("reseller_orders").insert({
      reseller_id: resellerId,
      items,
      notes: notes.trim() || null,
      status: "pending",
    });
    setSaving(false);
    if (saveErr) {
      setError(formatSupabaseError(saveErr));
      return;
    }
    reset();
    onPlaced();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) {
          reset();
          onClose();
        }
      }}
      title="Place order"
      description="Select the variation, amount, and quantity."
      size="lg"
    >
      <div className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {catalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">No listed products yet.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Product</Label>
              <select className={`${selectClass} mt-1.5`} value={picked?.id || ""} onChange={(e) => chooseProduct(e.target.value)}>
                {catalog.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {variations.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {variations.map((variation) => {
                  const selected = optionIds.find((id) => variation.options.some((o) => o.id === id)) || "";
                  return (
                    <div key={variation.id}>
                      <Label>{variation.name || "Variation"}</Label>
                      <select
                        className={`${selectClass} mt-1.5`}
                        value={selected}
                        onChange={(e) => chooseOption(variation.id, e.target.value)}
                      >
                        {labeledOptions(variation).map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Amount (₱)</Label>
                <div className="mt-1.5">
                  <AmountInput value={amount} placeholder="0" onValueChange={setAmount} />
                </div>
                {selectedSku?.sku && (
                  <p className="mt-1 text-xs text-muted-foreground">SKU {selectedSku.sku}</p>
                )}
              </div>
              <div>
                <Label>Quantity</Label>
                <div className="mt-1.5">
                  <AmountInput
                    value={qty}
                    inputMode="numeric"
                    placeholder="1"
                    onValueChange={(n) => setQty(Math.max(1, Math.floor(n || 1)))}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Line {peso(amount * qty)}</p>
              <Button type="button" variant="outline" onClick={addLine}>
                <Plus className="h-4 w-4" /> Add to order
              </Button>
            </div>
          </div>
        )}

        {items.length > 0 && (
          <ul className="divide-y rounded-md border">
            {items.map((item, i) => (
              <li key={`${item.product_id}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{item.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {item.option_labels.join(" / ") || "No variation"} · {peso(item.price)} × {item.qty}
                  </div>
                </div>
                <div className="tabular-nums">{peso(orderTotal([item]))}</div>
                <Button type="button" size="icon" variant="ghost" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div>
          <Label>Notes</Label>
          <Input className="mt-1.5" value={notes} placeholder="Optional note" onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <div className="text-sm font-medium">Total {peso(orderTotal(items))}</div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={saving || !items.length} onClick={() => void submit()}>
              {saving ? "Sending…" : "Place order"}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
