import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { redirect } from "next/navigation";
import { EmployeeTasksClient } from "./tasks-client";

export const dynamic = "force-dynamic";

export default async function EmployeeTasksPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  const supabase = createClient();
  const { data } = await supabase
    .from("tasks")
    .select("*, assignees:task_assignees!inner(user_id)")
    .eq("assignees.user_id", me.id)
    .order("created_at", { ascending: false });
  return (
    <div>
      <PageHeader title="My Tasks" description="Assigned to you individually or as a group" />
      <EmployeeTasksClient initial={data || []} />
    </div>
  );
}
