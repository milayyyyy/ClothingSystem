import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ActivityClient } from "./activity-client";
import { fetchActivityLogs } from "@/lib/activity-log-query";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const supabase = createClient();
  const initial = await fetchActivityLogs(supabase, { limit: 2000 }).catch(() => []);
  return (
    <div>
      <PageHeader
        title="Activity Log"
        description="Who changed what: added, edited, or deleted records, with field-level before/after values. Includes admin, manager, and employee actions."
      />
      <ActivityClient initial={initial} canDelete={me.profile.role === "admin"} />
    </div>
  );
}
