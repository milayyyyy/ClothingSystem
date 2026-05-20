"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  type BigSellerDuplicateGroup,
  type BigSellerIdentifiableOrder,
} from "@/lib/bigseller-duplicate-detection";

export function BigSellerDuplicateAlert<T extends BigSellerIdentifiableOrder>({
  groups,
  onFilterValue,
}: {
  groups: BigSellerDuplicateGroup<T>[];
  /** Called when user clicks a duplicate value to filter the list. */
  onFilterValue?: (value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  if (groups.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-yellow-800 dark:text-yellow-300">
          <span>⚠️</span>
          <span>
            {groups.length} duplicate{groups.length > 1 ? " groups" : " group"} detected (waybill, order no., or
            BigSeller code)
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-yellow-700 transition-transform dark:text-yellow-400 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-yellow-200 px-4 pb-3 pt-2 dark:border-yellow-700">
          {onFilterValue && (
            <p className="mb-2 text-[11px] text-yellow-700 dark:text-yellow-500">
              Click a value to filter the list by that duplicate.
            </p>
          )}
          <div className="space-y-1.5">
            {groups.map((g, i) => (
              <div
                key={`${g.field}-${g.value}-${i}`}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-yellow-800 dark:text-yellow-400"
              >
                <span className="font-medium">{g.label}:</span>
                {onFilterValue ? (
                  <button
                    type="button"
                    className="rounded bg-yellow-100 px-1.5 py-0.5 font-mono hover:bg-yellow-200 dark:bg-yellow-800/40 dark:hover:bg-yellow-700/60"
                    title={`Filter list by "${g.value}"`}
                    onClick={() => onFilterValue(g.value)}
                  >
                    {g.value}
                  </button>
                ) : (
                  <span className="font-mono">{g.value}</span>
                )}
                <span className="text-yellow-600 dark:text-yellow-500">
                  ({g.orders.length} orders:{" "}
                  {g.orders
                    .map((o) => {
                      const no = (o as { order_no?: number | null }).order_no;
                      return no != null ? `#${no}` : String(o.id).slice(0, 8);
                    })
                    .join(", ")}
                  )
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
