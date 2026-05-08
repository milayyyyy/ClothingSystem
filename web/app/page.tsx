import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(user.profile.role === "admin" ? "/admin" : "/employee");
}
