import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccessAdminPath, getPermissionsForRole } from "@/lib/role-permissions";

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

  let profile: { role: string } | null = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    profile = data ?? null;
  }

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isProtected) {
    // Must match server layouts: auth user without a profile row cannot load app shell.
    if (!profile) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    const role = profile.role;
    // Employees may access specific /admin routes when their role grants view permission.
    if (path.startsWith("/admin") && role === "employee") {
      const perms = await getPermissionsForRole(supabase, role);
      if (!canAccessAdminPath(path, perms, role)) {
        const url = request.nextUrl.clone();
        if (path.startsWith("/admin/orders")) url.pathname = "/employee/orders";
        else if (path.startsWith("/admin/tasks")) url.pathname = "/employee/tasks";
        else if (path.startsWith("/admin/attendance")) url.pathname = "/employee/attendance";
        else if (path.startsWith("/admin/salary")) url.pathname = "/employee/salary";
        else url.pathname = "/employee";
        return NextResponse.redirect(url);
      }
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
    // Avoid redirect loop: missing profile used to send users to /admin while layouts require a profile.
    if (!profile) {
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = profile.role === "employee" ? "/employee" : "/admin";
    return NextResponse.redirect(url);
  }

  return response;
}

/**
 * Only protect app routes. A catch-all regex with (?!_next/static|…) is easy to get wrong
 * with path-to-regexp and can accidentally run middleware on /_next/static/* — the HTML loads
 * but JS/CSS chunks return 404 and the page stays white.
 */
export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/employee",
    "/employee/:path*",
    "/login",
    "/login/:path*",
  ],
};
