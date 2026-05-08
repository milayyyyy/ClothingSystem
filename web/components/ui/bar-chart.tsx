"use client";
import { useState } from "react";

export function BarChart({ data, height = 180 }: { data: { label: string; value: number }[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">No data yet</div>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="w-full">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * (height - 24));
          const active = hover === i;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="relative flex w-full flex-1 items-end">
                {active && (
                  <div className="absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs shadow">
                    ₱{d.value.toLocaleString()}
                  </div>
                )}
                <div
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  className="w-full cursor-pointer rounded-t-md bg-primary/80 transition-all hover:bg-primary"
                  style={{ height: h }}
                />
              </div>
              <span className="truncate text-[10px] text-muted-foreground">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
