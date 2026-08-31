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
  const { data: reminders } = await supabase
    .from("reminders")
    .select("id, title, notes, due_at, priority, status, created_by, created_at, updated_at")
    .order("due_at", { ascending: true, nullsFirst: false });

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
