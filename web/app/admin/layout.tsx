import { redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { requireStaff } from "@/lib/supabase/server";
import { Topbar } from "@/components/topbar";

const Sidebar = dynamic(() => import("@/components/sidebar").then((m) => m.Sidebar), {
  ssr: false,
});

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  if (!user) redirect("/login");
  const name = user.profile.full_name || user.email!;
  return (
    <div className="flex h-screen overflow-hidden bg-muted/20">
      <Sidebar role={user.profile.role} name={name} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar role={user.profile.role} name={name} />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
