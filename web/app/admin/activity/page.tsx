import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ActivityClient } from "./activity-client";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const supabase = createClient();
  const { data } = await supabase
    .from("activity_logs")
    .select("*, actor:actor_id(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(500);
  return (
    <div>
      <PageHeader title="Activity Log" description="Every action by employees and sub-admins" />
      <ActivityClient initial={data || []} canDelete={me.profile.role === "admin"} />
    </div>
  );
}
