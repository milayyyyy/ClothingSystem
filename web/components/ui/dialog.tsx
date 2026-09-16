"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog({ open, onClose, children, title, description, size = "lg" }: {
  open: boolean; onClose: () => void; children: React.ReactNode;
  title?: string; description?: string; size?: "sm" | "md" | "lg" | "xl";
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
  const w =
    size === "sm" ? "max-w-sm" : size === "md" ? "max-w-md" : size === "xl" ? "max-w-2xl" : "max-w-lg";
  return createPortal(
    (
      <div
        className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain anim-in"
        role="presentation"
      >
        <div className="fixed inset-0 bg-background/80" aria-hidden />
        <div className="relative flex min-h-full items-end justify-center p-0 sm:items-center sm:p-6 sm:py-10">
          <div
            className={cn(
              "relative z-10 flex w-full flex-col overflow-hidden border bg-card shadow-2xl",
              "max-sm:max-h-[min(92dvh,100dvh)] max-sm:max-w-none max-sm:rounded-t-2xl max-sm:pb-safe",
              "sm:max-h-[min(90dvh,calc(100dvh-2rem))] sm:rounded-xl",
              w,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative shrink-0 border-b border-border/60 px-4 pb-3 pt-4 pr-14 sm:px-6 sm:pb-4 sm:pt-6">
              <button
                type="button"
                onClick={onClose}
                className="absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:right-3 sm:top-3"
                aria-label="Close"
              >
                <X className="h-5 w-5 sm:h-4 sm:w-4" />
              </button>
              {(title || description) && (
                <div>
                  {title && <h2 className="text-base font-semibold tracking-tight sm:text-lg">{title}</h2>}
                  {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">{children}</div>
          </div>
        </div>
      </div>
    ),
    document.body,
  );
}
