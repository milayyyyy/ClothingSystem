import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { isAttendanceRole } from "@/lib/roles";
import { PwaRegister } from "@/components/pwa-register";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AttendanceLayout({ children }: { children: React.ReactNode }) {
  cookies();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!isAttendanceRole(user.profile.role)) redirect("/login");

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <PwaRegister />
      {children}
    </div>
  );
}
