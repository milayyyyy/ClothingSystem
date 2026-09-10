import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/server";
import { defaultAfterLoginPath } from "@/lib/roles";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(defaultAfterLoginPath(user.profile.role));
}
