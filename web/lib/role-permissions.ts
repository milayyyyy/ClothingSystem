import type { SupabaseClient } from "@supabase/supabase-js";

export type FeatureKey =
  | "dashboard"
  | "orders"
  | "inventory"
  | "ready_made"
  | "reports"
  | "suppliers"
  | "returns"
  | "sales_expenses"
  | "finance"
  | "employees"
  | "attendance"
  | "salary"
  | "tasks"
  | "stores"
  | "activity_log"
  | "settings";

export type FeaturePerm = { view: boolean; edit: boolean };
export type Permissions = { all?: boolean } & Partial<Record<FeatureKey, FeaturePerm>>;

const FEATURE_KEYS: FeatureKey[] = [
  "dashboard",
  "orders",
  "inventory",
  "ready_made",
  "reports",
  "suppliers",
  "returns",
  "sales_expenses",
  "finance",
  "employees",
  "attendance",
  "salary",
  "tasks",
  "stores",
  "activity_log",
  "settings",
];

function blankPerms(): Permissions {
  return Object.fromEntries(FEATURE_KEYS.map((k) => [k, { view: false, edit: false }])) as Permissions;
}

/** Fixed employee permissions — browse-only inventory + ready-made; /employee/* is separate. */
export function defaultEmployeePerms(): Permissions {
  const off = { view: false, edit: false } as const;
  return {
    dashboard: off,
    orders: off,
    inventory: { view: true, edit: false },
    ready_made: { view: true, edit: false },
    reports: off,
    suppliers: off,
    returns: off,
    sales_expenses: off,
    finance: off,
    employees: off,
    attendance: off,
    salary: off,
    tasks: off,
    stores: off,
    activity_log: off,
    settings: off,
  };
}

/** sub_admin when no row exists in `roles` — matches legacy sidebar (admin-only items excluded). */
function defaultSubAdminPerms(): Permissions {
  const p = blankPerms();
  for (const k of FEATURE_KEYS) {
    if (k === "employees" || k === "activity_log" || k === "settings") continue;
    p[k] = { view: true, edit: true };
  }
  return p;
}

export function canView(perms: Permissions, feature: FeatureKey): boolean {
  if (perms.all) return true;
  return !!perms[feature]?.view;
}

export function canEdit(perms: Permissions, feature: FeatureKey): boolean {
  if (perms.all) return true;
  const f = perms[feature];
  return !!f?.view && !!f?.edit;
}

export function hasAnyAdminView(perms: Permissions): boolean {
  if (perms.all) return true;
  return FEATURE_KEYS.some((k) => perms[k]?.view);
}

/** Longest-prefix wins; order matters (more specific paths first). */
export function featureForAdminPath(path: string): FeatureKey | null {
  if (path === "/admin" || path === "/admin/") return "dashboard";
  if (path.startsWith("/admin/reports")) return "reports";
  if (path.startsWith("/admin/orders")) return "orders";
  if (path.startsWith("/admin/inventory/ready-made")) return "ready_made";
  if (path.startsWith("/admin/inventory")) return "inventory";
  if (path.startsWith("/admin/suppliers")) return "suppliers";
  if (path.startsWith("/admin/returns")) return "returns";
  if (path.startsWith("/admin/sales-expenses")) return "sales_expenses";
  if (path.startsWith("/admin/finance")) return "finance";
  if (path.startsWith("/admin/employees")) return "employees";
  if (path.startsWith("/admin/attendance")) return "attendance";
  if (path.startsWith("/admin/salary")) return "salary";
  if (path.startsWith("/admin/tasks")) return "tasks";
  if (path.startsWith("/admin/stores")) return "stores";
  if (path.startsWith("/admin/activity")) return "activity_log";
  if (path.startsWith("/admin/settings")) return "settings";
  return null;
}

/** Admin URLs that employees should never use — they have /employee/* pages instead. */
export function isEmployeeOwnedAdminPath(path: string): boolean {
  if (path === "/admin" || path === "/admin/") return true;
  if (path.startsWith("/admin/reports")) return true;
  const owned = ["/admin/orders", "/admin/tasks", "/admin/attendance", "/admin/salary"];
  return owned.some((p) => path === p || path.startsWith(`${p}/`));
}

export function canAccessAdminPath(path: string, perms: Permissions, profileRole?: string): boolean {
  if (profileRole === "employee") {
    if (isEmployeeOwnedAdminPath(path)) return false;
    const feature = featureForAdminPath(path);
    if (feature !== "inventory" && feature !== "ready_made") return false;
  }
  const feature = featureForAdminPath(path);
  if (!feature) return false;
  return canView(perms, feature);
}

export function hrefToFeature(href: string): FeatureKey | null {
  const path = href.split("?")[0];
  return featureForAdminPath(path);
}

export async function getPermissionsForRole(
  supabase: SupabaseClient,
  role: string,
): Promise<Permissions> {
  if (role === "admin") return { all: true };
  if (role === "employee") return defaultEmployeePerms();

  const { data } = await supabase.from("roles").select("permissions").eq("name", role).maybeSingle();

  if (role === "sub_admin") {
    if (data?.permissions && typeof data.permissions === "object") {
      return { ...defaultSubAdminPerms(), ...(data.permissions as Permissions) };
    }
    return defaultSubAdminPerms();
  }

  if (data?.permissions && typeof data.permissions === "object") {
    return { ...blankPerms(), ...(data.permissions as Permissions) };
  }

  return blankPerms();
}
