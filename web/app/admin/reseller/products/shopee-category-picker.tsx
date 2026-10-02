"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  SHOPEE_CATEGORIES,
  findShopeeCategoryNames,
  isShopeeCategoryPath,
  searchShopeeCategories,
  shopeeCategoryPath,
} from "@/lib/shopee-categories";

const selectClass = cn(
  "flex h-11 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm sm:h-9 sm:text-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-primary",
);

export function ShopeeCategoryPicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (path: string) => void;
}) {
  const known = isShopeeCategoryPath(value);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = findShopeeCategoryNames(value);
  const [parentName, setParentName] = useState(selected[0] || SHOPEE_CATEGORIES[0]?.name || "");
  const parent = SHOPEE_CATEGORIES.find((row) => row.name === parentName) || SHOPEE_CATEGORIES[0];
  const matches = useMemo(() => searchShopeeCategories(query), [query]);

  function pick(names: string[]) {
    onChange(shopeeCategoryPath(names));
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setParentName(selected[0] || parentName);
          setOpen((v) => !v);
        }}
        className={cn(selectClass, "items-center justify-between text-left")}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>{value || "Select a category"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && !disabled && (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <div className="relative border-b">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground"
              value={query}
              placeholder="Search Shopee categories"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {query.trim() ? (
            <div className="max-h-72 overflow-y-auto py-1">
              {matches.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching category.</p>
              ) : (
                matches.map((leaf) => (
                  <button
                    key={leaf.path}
                    type="button"
                    onClick={() => pick(leaf.names)}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-sm hover:bg-accent",
                      value === leaf.path && "bg-primary/10 text-foreground",
                    )}
                  >
                    {leaf.path}
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="grid max-h-80 grid-cols-2 divide-x">
              <div className="overflow-y-auto">
                {SHOPEE_CATEGORIES.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setParentName(row.name)}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-sm hover:bg-accent",
                      parent?.name === row.name && "bg-primary/10 font-medium",
                    )}
                  >
                    {row.name}
                  </button>
                ))}
              </div>
              <div className="overflow-y-auto">
                {(parent?.children || []).map((child) => {
                  const path = shopeeCategoryPath([parent.name, child.name]);
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => pick([parent.name, child.name])}
                      className={cn(
                        "block w-full px-3 py-2 text-left text-sm hover:bg-accent",
                        value === path && "bg-primary/10 font-medium",
                      )}
                    >
                      {child.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="border-t p-2">
            <button
              type="button"
              onClick={() => {
                if (known) onChange("");
                setOpen(false);
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Use a custom category
            </button>
          </div>
        </div>
      )}

      {!known && (
        <Input
          value={value}
          disabled={disabled}
          placeholder="Custom category"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
