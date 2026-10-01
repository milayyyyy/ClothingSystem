"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LIST_PAGE_SIZES,
  paginationItems,
  type ListPageSize,
} from "@/lib/list-pagination";

type Props = {
  page: number;
  pageSize: ListPageSize;
  totalItems: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: ListPageSize) => void;
  className?: string;
};

export function ListPagination({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (totalItems <= 0) return null;

  const pages = paginationItems(page, totalPages);
  const showPages = totalPages > 1;

  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-3 px-3 py-2", className)}>
      {showPages && (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pages.map((item, i) =>
            item === "ellipsis" ? (
              <span key={`e-${i}`} className="px-1.5 text-sm text-muted-foreground">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                className={cn(
                  "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm",
                  item === page
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/70",
                )}
                onClick={() => onPageChange(item)}
                aria-current={item === page ? "page" : undefined}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-medium shadow-sm hover:bg-muted/50"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          {pageSize}/Page
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        {open && (
          <div
            className="absolute bottom-full right-0 z-20 mb-1 min-w-[7.5rem] overflow-hidden rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
            role="listbox"
          >
            {LIST_PAGE_SIZES.map((n) => (
              <button
                key={n}
                type="button"
                role="option"
                aria-selected={n === pageSize}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted",
                  n === pageSize && "bg-muted/80",
                )}
                onClick={() => {
                  onPageSizeChange(n);
                  setOpen(false);
                }}
              >
                <span
                  className={cn(
                    "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border",
                    n === pageSize ? "border-primary" : "border-muted-foreground/40",
                  )}
                >
                  {n === pageSize && <span className="h-2 w-2 rounded-full bg-primary" />}
                </span>
                {n}/Page
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
