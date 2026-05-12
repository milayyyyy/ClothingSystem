"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog({ open, onClose, children, title, description, size = "lg" }: {
  open: boolean; onClose: () => void; children: React.ReactNode;
  title?: string; description?: string; size?: "md" | "lg" | "xl";
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;
  const w = size === "md" ? "max-w-md" : size === "xl" ? "max-w-2xl" : "max-w-lg";
  return createPortal(
    (
      <div
        className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain anim-in"
        role="presentation"
      >
        <div className="fixed inset-0 bg-background/80" aria-hidden />
        <div className="relative flex min-h-full items-center justify-center p-4 sm:p-6 sm:py-10">
          <div
            className={cn(
              "relative z-10 flex w-full max-h-[min(90dvh,calc(100dvh-2rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl",
              w,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative shrink-0 border-b border-border/60 px-6 pb-4 pt-6 pr-14">
              <button
                type="button"
                onClick={onClose}
                className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
              {(title || description) && (
                <div>
                  {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
                  {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">{children}</div>
          </div>
        </div>
      </div>
    ),
    document.body,
  );
}
