export type EmploymentCategory = "permanent" | "on_call";

export const EMPLOYMENT_CATEGORIES: readonly EmploymentCategory[] = ["permanent", "on_call"];

export function normalizeEmploymentCategory(raw: unknown): EmploymentCategory {
  return String(raw || "permanent").toLowerCase() === "on_call" ? "on_call" : "permanent";
}

export function employmentCategoryLabel(c: EmploymentCategory): string {
  return c === "on_call" ? "On call" : "Permanent";
}
