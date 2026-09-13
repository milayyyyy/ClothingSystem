import { redirect } from "next/navigation";
import { createClient, requireStaff } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ContentPlannerClient } from "./content-planner-client";

export const dynamic = "force-dynamic";

export default async function ContentPlannerPage() {
  const user = await requireStaff();
  if (!user) redirect("/login");

  const supabase = createClient();
  const [{ data: items }, { data: reminders }, { data: tasks }, typesRes, storesRes] = await Promise.all([
    supabase.from("content_schedules").select("*").order("scheduled_at"),
    supabase.from("reminders").select("*").order("due_at"),
    supabase
      .from("tasks")
      .select("id, title, description, due_date, priority, status, task_type, machine_type_id, repeat_mode, repeat_interval_days")
      .order("due_date", { ascending: true }),
    supabase.from("content_types").select("id,name,color,sort_order").order("sort_order").order("name"),
    supabase.from("content_stores").select("id,name,sort_order").order("sort_order").order("name"),
  ]);

  const typesMissing = Boolean(typesRes.error && /content_types|does not exist|schema cache/i.test(typesRes.error.message));
  const storesMissing = Boolean(storesRes.error && /content_stores|does not exist|schema cache/i.test(storesRes.error.message));

  return (
    <div>
      <PageHeader title="Content Planner" description="Schedule social media content by date and time" />
      <ContentPlannerClient
        initial={items ?? []}
        initialReminders={reminders ?? []}
        initialTasks={tasks ?? []}
        initialTypes={typesMissing ? [] : (typesRes.data ?? [])}
        typesMissing={typesMissing}
        initialStores={storesMissing ? [] : (storesRes.data ?? [])}
        storesMissing={storesMissing}
        userId={user.id}
      />
    </div>
  );
}
