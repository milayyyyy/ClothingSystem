"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  canUseNativeInstallPrompt,
  isIosSafari,
  isStandaloneDisplay,
  type PwaInstallPromptEvent,
} from "@/lib/pwa-install";
import { cn } from "@/lib/utils";

type PwaInstallButtonProps = {
  className?: string;
  /** Compact icon-only on narrow top bars */
  compact?: boolean;
};

export function PwaInstallButton({ className, compact }: PwaInstallButtonProps) {
  const [deferred, setDeferred] = useState<PwaInstallPromptEvent | null>(null);
  const [iosOpen, setIosOpen] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandaloneDisplay()) {
      setHidden(true);
      return;
    }
    setHidden(false);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as PwaInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const showIos = isIosSafari() && !isStandaloneDisplay();
  const showNative = !!deferred && canUseNativeInstallPrompt();
  const visible = !hidden && (showNative || showIos);

  const installNative = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }, [deferred]);

  if (!visible) return null;

  return (
    <>
      {showNative ? (
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          className={cn("shrink-0 gap-1.5", className)}
          onClick={() => void installNative()}
        >
          <Download className="h-4 w-4" />
          {!compact && <span className="hidden sm:inline">Install app</span>}
          {compact && <span className="sr-only">Install app</span>}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size={compact ? "sm" : "default"}
          className={cn("shrink-0 gap-1.5", className)}
          onClick={() => setIosOpen(true)}
        >
          <Smartphone className="h-4 w-4" />
          {!compact && <span>Add to Home Screen</span>}
          {compact && <span className="sr-only">Add to Home Screen</span>}
        </Button>
      )}

      <Dialog open={iosOpen} onClose={() => setIosOpen(false)} title="Install PrintShop on your phone" size="md">
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            On iPhone or iPad, install this app from Safari so it opens full-screen like a native app.
          </p>
          <ol className="list-decimal space-y-3 pl-5">
            <li>
              Tap <Share className="mx-0.5 inline h-4 w-4 align-text-bottom" aria-hidden /> <strong>Share</strong> in the
              Safari toolbar (bottom or top).
            </li>
            <li>
              Scroll and choose <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Tap <strong>Add</strong>. Open PrintShop from your home screen.
            </li>
          </ol>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIosOpen(false)}>
              <X className="mr-1 h-4 w-4" /> Close
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
