import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { getPermissionsForRole } from "@/lib/role-permissions";
import { isStaffRole } from "@/lib/roles";
import { AppShell } from "@/components/app-shell";
import { WorkspaceShellProvider } from "@/components/workspace-shell-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  cookies();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (isStaffRole(user.profile.role)) redirect("/admin");
  const supabase = createClient();
  const permissions = await getPermissionsForRole(supabase, user.profile.role);
  const name = user.profile.full_name || user.email!;
  return (
    <AppShell key={user.id} role="employee" name={name} permissions={permissions} userId={user.id}>
      <WorkspaceShellProvider
        value={{
          role: "employee",
          userId: user.id,
          name,
          permissions,
        }}
      >
        {children}
      </WorkspaceShellProvider>
    </AppShell>
  );
}
