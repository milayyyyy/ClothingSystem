import { PageHeader } from "@/components/page-header";
import { AdminExportClient } from "./export-client";

export const dynamic = "force-dynamic";

export default function AdminExportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Export"
        description="Download everything in one PDF, or export individual sections as CSV for Excel."
      />
      <AdminExportClient />
    </div>
  );
}

