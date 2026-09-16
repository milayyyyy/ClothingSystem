import { PageHeader } from "@/components/page-header";
import { AdminExportClient } from "./export-client";

export const dynamic = "force-dynamic";

export default function AdminExportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Export"
        description="Download everything in one PDF, export receipts/screenshots/designs as a photo archive, or export individual sections as CSV."
      />
      <AdminExportClient />
    </div>
  );
}

