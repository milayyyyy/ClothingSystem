import { PageHeader } from "@/components/page-header";
import { InventoryPageContent } from "./inventory-page-content";

export default function AdminInventoryPage() {
  return (
    <div>
      <PageHeader title="Inventory" description="Stock levels and replenishment" />
      <InventoryPageContent />
    </div>
  );
}
