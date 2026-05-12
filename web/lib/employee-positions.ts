/** Job titles for profiles.position (Add / Edit employee). */
export const EMPLOYEE_POSITION_VALUES = ["sales", "artist", "staff", "sewer"] as const;
export type EmployeePositionValue = (typeof EMPLOYEE_POSITION_VALUES)[number];

export const EMPLOYEE_POSITION_LABEL: Record<EmployeePositionValue, string> = {
  sales: "Sales",
  artist: "Artist",
  staff: "Staff",
  sewer: "Sewer",
};

export function isEmployeePositionValue(v: unknown): v is EmployeePositionValue {
  return typeof v === "string" && (EMPLOYEE_POSITION_VALUES as readonly string[]).includes(v);
}
