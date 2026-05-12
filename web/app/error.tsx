"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        The app hit a runtime error. Check the browser console (F12 → Console) for details. If you just upgraded dependencies or
        changed env vars, try <code className="rounded bg-muted px-1.5 py-0.5 text-xs">cd web && rm -rf .next && npm run dev</code>{" "}
        then hard-refresh the page.
      </p>
      {error?.message && (
        <pre className="max-h-40 max-w-lg overflow-auto rounded-md border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
          {error.message}
        </pre>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
        <Link
          href="/login"
          className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Go to login
        </Link>
      </div>
    </div>
  );
}
