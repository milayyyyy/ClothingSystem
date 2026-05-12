import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ReadyMadeInventoryClient } from "./ready-made-inventory-client";

export const dynamic = "force-dynamic";

export default function ReadyMadeInventoryPage() {
  return (
    <div>
      <PageHeader
        title="Ready made inventory"
        description="Spreadsheet-style sheets in named groups: organize sheets, then edit grids with row labels, column headers, and cells."
        action={
          <Link
            href="/admin/inventory"
            className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Stock inventory
          </Link>
        }
      />
      <ReadyMadeInventoryClient />
    </div>
  );
}
