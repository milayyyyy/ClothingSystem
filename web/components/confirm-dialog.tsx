"use client";

import { useCallback, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ConfirmRequest = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  loading = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={loading ? () => {} : onClose} title={title} description={description} size="md">
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? "Deleting…" : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

/** Opens an in-app confirmation modal; runs `onConfirm` only after the user confirms. */
export function useConfirmAction() {
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  const [loading, setLoading] = useState(false);

  const ask = useCallback((req: ConfirmRequest) => {
    setPending(req);
  }, []);

  const close = useCallback(() => {
    if (!loading) setPending(null);
  }, [loading]);

  const runConfirm = useCallback(async () => {
    if (!pending) return;
    setLoading(true);
    try {
      await pending.onConfirm();
      setPending(null);
    } finally {
      setLoading(false);
    }
  }, [pending]);

  const dialog = pending ? (
    <ConfirmDialog
      open
      title={pending.title}
      description={pending.description}
      confirmLabel={pending.confirmLabel}
      cancelLabel={pending.cancelLabel}
      destructive={pending.destructive ?? true}
      loading={loading}
      onClose={close}
      onConfirm={() => void runConfirm()}
    />
  ) : null;

  return { ask, dialog };
}
