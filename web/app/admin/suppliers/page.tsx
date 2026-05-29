import { PageHeader } from "@/components/page-header";
import { SuppliersPageContent } from "./suppliers-page-content";

export default function SuppliersPage() {
  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Vendor contacts by category, pricelist photos, and product price lines"
      />
      <SuppliersPageContent />
    </div>
  );
}
