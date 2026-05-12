import { Suspense } from "react";
import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { SidebarFallback } from "@/components/sidebar-fallback";
import { getSessionUser } from "@/lib/supabase/server";
import { Topbar } from "@/components/topbar";

const Sidebar = dynamic(() => import("@/components/sidebar").then((m) => m.Sidebar), {
  ssr: false,
});

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const name = user.profile.full_name || user.email!;
  return (
    <div className="flex h-screen overflow-hidden bg-muted/20">
      <Suspense fallback={<SidebarFallback />}>
        <Sidebar role="employee" name={name} />
      </Suspense>
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar role="employee" name={name} userId={user.id} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
