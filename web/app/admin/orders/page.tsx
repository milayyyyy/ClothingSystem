import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { OrdersPageContent } from "./orders-page-content";

export default function AdminOrdersPage() {
  return (
    <div>
      <PageHeader
        title="Orders"
        description="Manage customer print orders. Walk In & Online lists walk-in (in-store) and Facebook marketplace or Page orders. Shopee / TikTok / Lazada pick lists belong on BigSeller."
        action={
          <div className="flex gap-2">
            <Link
              href="/admin/orders/bigseller"
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              BigSeller page
            </Link>
            <Link
              href="/admin/stores"
              className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              Stores & channels
            </Link>
          </div>
        }
      />
      <OrdersPageContent />
    </div>
  );
}
