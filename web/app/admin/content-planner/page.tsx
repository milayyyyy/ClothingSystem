import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { canUseContentPlanner, defaultAfterLoginPath } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { ContentPlannerClient, type ContentStore } from "./content-planner-client";
import { markDueContentPosted } from "@/lib/content-schedule-status";

export const dynamic = "force-dynamic";

export default async function ContentPlannerPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canUseContentPlanner(user.profile.role)) redirect(defaultAfterLoginPath(user.profile.role));

  const supabase = createClient();
  await markDueContentPosted(supabase);
  const [{ data: items }, { data: reminders }, { data: tasks }, typesRes, storesWithColor] = await Promise.all([
    supabase.from("content_schedules").select("*").order("scheduled_at"),
    supabase.from("reminders").select("*").order("due_at"),
    supabase
      .from("tasks")
      .select("id, title, description, due_date, priority, status, task_type, machine_type_id, repeat_mode, repeat_interval_days")
      .order("due_date", { ascending: true }),
    supabase.from("content_types").select("id,name,color,sort_order").order("sort_order").order("name"),
    supabase.from("content_stores").select("id,name,color,sort_order").order("sort_order").order("name"),
  ]);

  let storeRows: ContentStore[] = (storesWithColor.data ?? []) as ContentStore[];
  let storesError = storesWithColor.error;
  if (storesError && /content_stores\.color|column.*color/i.test(storesError.message)) {
    const fallback = await supabase.from("content_stores").select("id,name,sort_order").order("sort_order").order("name");
    storeRows = (fallback.data ?? []) as ContentStore[];
    storesError = fallback.error;
  }

  const typesMissing = Boolean(typesRes.error && /content_types|does not exist|schema cache/i.test(typesRes.error.message));
  const storesMissing = Boolean(storesError && /content_stores|does not exist|schema cache/i.test(storesError.message));

  return (
    <div>
      <PageHeader title="Content Planner" description="Schedule social media content by date and time" />
      <ContentPlannerClient
        initial={items ?? []}
        initialReminders={reminders ?? []}
        initialTasks={tasks ?? []}
        initialTypes={typesMissing ? [] : (typesRes.data ?? [])}
        typesMissing={typesMissing}
        initialStores={storesMissing ? [] : storeRows}
        storesMissing={storesMissing}
        userId={user.id}
      />
    </div>
  );
}
