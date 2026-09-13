/** App login roles stored on `profiles.role`. */
export type Role = "admin" | "manager" | "employee" | "media";

export const ASSIGNABLE_ROLES: { value: Role; label: string }[] = [
  { value: "employee", label: "Employee" },
  { value: "media", label: "Media Management" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
];

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  employee: "Employee",
  media: "Media Management",
};

export function roleLabel(role: string | null | undefined) {
  if (!role) return "";
  return ROLE_LABELS[role] ?? role.replace(/_/g, " ");
}

export function asShellRole(role: string | null | undefined): Role {
  if (role === "admin" || role === "manager" || role === "employee" || role === "media") return role;
  return "employee";
}

/** Roles that use the admin app (/admin). */
export function isStaffRole(role: string | null | undefined) {
  return role === "admin" || role === "manager";
}

/** Employee workspace (/employee) — employees and media accounts. */
export function isPortalRole(role: string | null | undefined) {
  return role === "employee" || role === "media";
}

export function canUseContentPlanner(role: string | null | undefined) {
  return isStaffRole(role) || role === "media";
}

/** Default home after login or root redirect. */
export function defaultAfterLoginPath(role: string | null | undefined) {
  return isStaffRole(role) ? "/admin" : "/employee";
}

/** Profiles eligible for order assignment and payroll lists (non–back-office staff). */
export const OPERATOR_PAYROLL_ROLES = ["manager", "employee", "media", "sales", "artist", "sewer"] as const;

export function isOperatorPayrollRole(role: string | null | undefined) {
  return !!role && (OPERATOR_PAYROLL_ROLES as readonly string[]).includes(role);
}
