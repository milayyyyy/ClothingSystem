import { redirect } from "next/navigation";
import { createClient, requireStaff } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ContentPlannerClient } from "./content-planner-client";

export const dynamic = "force-dynamic";

export default async function ContentPlannerPage() {
  const user = await requireStaff();
  if (!user) redirect("/login");

  const supabase = createClient();
  const [{ data: items }, { data: reminders }] = await Promise.all([
    supabase.from("content_schedules").select("*").order("scheduled_at"),
    supabase.from("reminders").select("*").order("due_at"),
  ]);

  return (
    <div>
      <PageHeader title="Content Planner" description="Schedule social media content by date and time" />
      <ContentPlannerClient
        initial={items ?? []}
        initialReminders={reminders ?? []}
        userId={user.id}
      />
    </div>
  );
}
