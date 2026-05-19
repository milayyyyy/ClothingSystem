"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";

export function OrderInvoiceToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href={backHref}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back
        </Link>
      </Button>
      <Button type="button" size="sm" onClick={() => window.print()}>
        <Printer className="mr-1.5 h-4 w-4" />
        Print / Save as PDF
      </Button>
      <p className="text-xs text-muted-foreground">
        Use your browser&apos;s print dialog and choose &quot;Save as PDF&quot; to download.
      </p>
    </div>
  );
}
