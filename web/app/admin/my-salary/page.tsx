import { createClient, getSessionUser } from "@/lib/supabase/server";
import { MySalaryView } from "@/components/my-salary-view";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminMySalaryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.profile.role === "employee") redirect("/employee/salary");

  const supabase = createClient();
  const { data } = await supabase.from("salaries").select("*").eq("user_id", user.id).order("created_at", { ascending: false });

  return (
    <MySalaryView
      rows={data || []}
      salaryType={user.profile.salary_type}
      salaryRate={user.profile.salary_rate}
    />
  );
}
