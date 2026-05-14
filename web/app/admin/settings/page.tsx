import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.profile.role !== "admin") redirect("/admin");

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account credentials and security"
      />
      <SettingsClient
        initialEmail={user.email ?? ""}
        initialPhone={user.phone ?? ""}
      />
    </div>
  );
}
