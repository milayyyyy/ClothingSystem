import { PageHeader } from "@/components/page-header";
import { InventoryFullStockExportButton } from "@/components/inventory-full-stock-export-button";
import { InventoryPageContent } from "./inventory-page-content";

export default function AdminInventoryPage() {
  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock levels and replenishment"
        action={<InventoryFullStockExportButton />}
      />
      <InventoryPageContent />
    </div>
  );
}
