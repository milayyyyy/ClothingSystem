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
    // Managers and admins use the admin workspace, not /employee.
    if (path.startsWith("/employee") && role !== "employee") {
      const url = request.nextUrl.clone();
      if (path.startsWith("/employee/orders")) url.pathname = "/admin/orders";
      else if (path.startsWith("/employee/tasks")) url.pathname = "/admin/tasks";
      else if (path.startsWith("/employee/attendance")) url.pathname = "/admin/attendance";
      else if (path.startsWith("/employee/salary")) url.pathname = "/admin/salary";
      else if (path.startsWith("/employee/order-records")) url.pathname = "/admin/order-records";
      else url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
    // Employees may access specific /admin routes when their role grants view permission.
    if (path.startsWith("/admin") && role === "employee") {
      const blockedForEmployee = ["/admin/settings", "/admin/export", "/admin/stores"];
      if (blockedForEmployee.some((p) => path === p || path.startsWith(`${p}/`))) {
        const url = request.nextUrl.clone();
        url.pathname = "/employee";
        return NextResponse.redirect(url);
      }
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
    const adminOnly = ["/admin/employees", "/admin/activity/delete", "/admin/activity", "/admin/settings"];
    if (adminOnly.some((p) => path.startsWith(p)) && role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      return NextResponse.redirect(url);
    }
    if (path.startsWith("/admin/my-salary") && role === "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/salary";
      return NextResponse.redirect(url);
    }
    // employees cannot access reminders or POS
    if ((path.startsWith("/admin/reminders") || path.startsWith("/admin/pos")) && role === "employee") {
      const url = request.nextUrl.clone();
      url.pathname = "/employee";
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
