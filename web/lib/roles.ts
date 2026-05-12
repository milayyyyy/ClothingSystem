/** Roles that use the admin app (/admin). */
export function isStaffRole(role: string | null | undefined) {
  return role === "admin" || role === "sub_admin";
}

/** Default home after login or root redirect. */
export function defaultAfterLoginPath(role: string | null | undefined) {
  return isStaffRole(role) ? "/admin" : "/employee";
}

/** Profiles eligible for order assignment and payroll lists (non–back-office staff). */
export const OPERATOR_PAYROLL_ROLES = ["employee", "sales", "artist", "sewer"] as const;

export function isOperatorPayrollRole(role: string | null | undefined) {
  return !!role && (OPERATOR_PAYROLL_ROLES as readonly string[]).includes(role);
}
