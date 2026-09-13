import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { getPermissionsForRole } from "@/lib/role-permissions";
import { AppShell } from "@/components/app-shell";
import { WorkspaceShellProvider } from "@/components/workspace-shell-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  cookies();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = createClient();
  const permissions = await getPermissionsForRole(supabase, user.profile.role);
  const name = user.profile.full_name || user.email!;
  return (
    <AppShell key={user.id} role={user.profile.role} name={name} permissions={permissions} userId={user.id}>
      <WorkspaceShellProvider
        value={{
          role: user.profile.role,
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
