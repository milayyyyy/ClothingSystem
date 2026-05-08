import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: CookieOptions) { response.cookies.set({ name, value, ...options }); },
        remove(name: string, options: CookieOptions) { response.cookies.set({ name, value: "", ...options }); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/login");
  const isProtected = path.startsWith("/admin") || path.startsWith("/employee");

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isProtected) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const role = profile?.role ?? "employee";
    // /admin is shared by admin and sub_admin
    if (path.startsWith("/admin") && !(role === "admin" || role === "sub_admin")) {
      const url = request.nextUrl.clone();
      url.pathname = "/employee";
      return NextResponse.redirect(url);
    }
    // some admin sub-paths are admin-only
    const adminOnly = ["/admin/employees", "/admin/activity/delete"];
    if (adminOnly.some((p) => path.startsWith(p)) && role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
  }

  if (user && isAuthRoute) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    const url = request.nextUrl.clone();
    url.pathname = profile?.role === "employee" ? "/employee" : "/admin";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|api/public).*)"] };
