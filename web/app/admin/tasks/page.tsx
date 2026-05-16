import { redirect } from "next/navigation";
import { createClient, requireStaff } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { TasksClient } from "./tasks-client";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await requireStaff();
  if (!user) redirect("/login");
  const supabase = createClient();
  const [{ data: tasks }, { data: people }] = await Promise.all([
    supabase.from("tasks").select("*, machine_types(id, name), assignees:task_assignees(user_id, profiles:user_id(full_name, email, role))").order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["employee", "sub_admin"]),
  ]);
  return (
    <div>
      <PageHeader title="Tasks" description="Assign work to staff members" />
      <TasksClient userId={user.id} initial={tasks || []} people={people || []} />
    </div>
  );
}
