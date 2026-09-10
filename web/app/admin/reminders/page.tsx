import { redirect } from "next/navigation";
import { createClient, requireStaff } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { RemindersClient } from "./reminders-client";

export const dynamic = "force-dynamic";

export default async function RemindersPage() {
  const user = await requireStaff();
  if (!user) redirect("/login");

  const supabase = createClient();

  // Admin/manager see all; employee sees own only (RLS enforces this)
  const fullSelect =
    "id, title, notes, due_at, priority, status, created_by, created_at, updated_at, repeat_mode, repeat_interval_days";
  let { data: reminders, error } = await supabase
    .from("reminders")
    .select(fullSelect)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error && /repeat_mode|repeat_interval/.test(error.message)) {
    const retry = await supabase
      .from("reminders")
      .select("id, title, notes, due_at, priority, status, created_by, created_at, updated_at")
      .order("due_at", { ascending: true, nullsFirst: false });
    reminders = retry.data as typeof reminders;
  }

  return (
    <div>
      <PageHeader
        title="Reminders"
        description="Notes, tasks, and scheduled reminders"
      />
      <RemindersClient
        initial={reminders || []}
        userId={user.id}
      />
    </div>
  );
}
