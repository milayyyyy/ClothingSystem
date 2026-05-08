import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export type Role = "admin" | "sub_admin" | "employee";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) {
          try { cookieStore.set({ name, value, ...options }); } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try { cookieStore.set({ name, value: "", ...options }); } catch {}
        },
      },
    }
  );
}

export async function getSessionUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return profile ? { ...user, profile } : null;
}

export function isStaff(role: Role | string | undefined) {
  return role === "admin" || role === "sub_admin";
}

export async function requireStaff() {
  const user = await getSessionUser();
  if (!user || !isStaff(user.profile.role)) return null;
  return user;
}

export async function requireAdmin() {
  const user = await getSessionUser();
  if (!user || user.profile.role !== "admin") return null;
  return user;
}
