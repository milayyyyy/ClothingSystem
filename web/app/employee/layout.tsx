import { Suspense } from "react";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { SidebarFallback } from "@/components/sidebar-fallback";
import { createClient, getSessionUser } from "@/lib/supabase/server";
import { getPermissionsForRole } from "@/lib/role-permissions";
import { Topbar } from "@/components/topbar";
import { WorkspaceShellProvider } from "@/components/workspace-shell-context";

const Sidebar = dynamic(() => import("@/components/sidebar").then((m) => m.Sidebar), {
  ssr: false,
});

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = createClient();
  const permissions = await getPermissionsForRole(supabase, user.profile.role);
  const name = user.profile.full_name || user.email!;
  return (
    <div className="flex h-screen overflow-hidden bg-muted/20">
      <Suspense fallback={<SidebarFallback />}>
        <Sidebar role="employee" name={name} permissions={permissions} />
      </Suspense>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar role="employee" userId={user.id} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="w-full min-w-0">
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
          </div>
        </main>
      </div>
    </div>
  );
}
