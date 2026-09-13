import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";

export default async function EmployeeOrderRecordsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.profile.role === "media") redirect("/employee");
  return children;
}
