import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { OrdersPageContent } from "./orders-page-content";

export default function AdminOrdersPage() {
  return (
    <div>
      <PageHeader
        title="Orders"
        description="Manage customer print orders. Walk In & Online covers in-store and Facebook marketplace or Page orders."
        action={
          <Link href="/admin/stores" className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
            Stores & channels
          </Link>
        }
      />
      <OrdersPageContent />
    </div>
  );
}
