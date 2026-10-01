"use client";

import { useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ResellerImage } from "@/lib/reseller-products";

type Props = {
  photos: ResellerImage[];
  alt?: string;
  /** Compact card: main photo + side thumbnail scroller. */
  layout?: "card" | "detail";
  /** Wrap only the main card photo so side thumbs stay outside the link. */
  mainHref?: string;
};

export function ResellerProductPhotoStrip({ photos, alt = "", layout = "card", mainHref }: Props) {
  const [active, setActive] = useState(0);
  const current = photos[Math.min(active, Math.max(0, photos.length - 1))];
  const many = photos.length > 1;

  if (layout === "detail") {
    return (
      <div className="space-y-2">
        <div className="overflow-hidden rounded-lg border bg-muted">
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.url} alt={alt} className="aspect-square w-full object-cover sm:aspect-[4/5]" />
          ) : (
            <div className="flex aspect-square items-center justify-center text-muted-foreground sm:aspect-[4/5]">
              <Package className="h-10 w-10" />
            </div>
          )}
        </div>
        {many && (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {photos.map((photo, i) => (
              <button
                key={`${photo.path || photo.url}:${i}`}
                type="button"
                className={cn(
                  "h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted",
                  i === active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "opacity-80 hover:opacity-100",
                )}
                onClick={() => setActive(i)}
                aria-label={`Photo ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const main = current ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={current.url} alt={alt} className="h-full w-full object-cover" />
  ) : (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Package className="h-8 w-8" />
    </div>
  );

  return (
    <div className="flex h-44 sm:h-52">
      {mainHref ? (
        <Link href={mainHref} className="min-w-0 flex-1 bg-muted">
          {main}
        </Link>
      ) : (
        <div className="min-w-0 flex-1 bg-muted">{main}</div>
      )}
      {many && (
        <div className="flex w-[3.35rem] shrink-0 flex-col gap-1 overflow-y-auto border-l bg-background p-1">
          {photos.map((photo, i) => (
            <button
              key={`${photo.path || photo.url}:${i}`}
              type="button"
              className={cn(
                "aspect-square w-full shrink-0 overflow-hidden rounded border bg-muted",
                i === active ? "ring-2 ring-primary" : "opacity-75 hover:opacity-100",
              )}
              onClick={() => setActive(i)}
              aria-label={`Photo ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
