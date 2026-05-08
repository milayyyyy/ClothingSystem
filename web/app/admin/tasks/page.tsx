import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { TasksClient } from "./tasks-client";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const supabase = createClient();
  const [{ data: tasks }, { data: people }] = await Promise.all([
    supabase.from("tasks").select("*, assignees:task_assignees(user_id, profiles:user_id(full_name, email, role))").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["employee", "sub_admin"]),
  ]);
  return (
    <div>
      <PageHeader title="Tasks" description="Assign work to staff members" />
      <TasksClient initial={tasks || []} people={people || []} />
    </div>
  );
}
