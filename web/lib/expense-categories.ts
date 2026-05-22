/** Default seed list (migration 081); live list comes from expense_categories table. */
export const EXPENSE_CATEGORIES = [
  "Materials",
  "Fabrics",
  "Salary",
  "Employee Expenses",
  "Marketing",
  "Utilities",
  "Maintenance",
  "Logistics",
  "Supplies",
  "Equipment",
  "Rent",
  "Other",
  "Machines",
  "Miscellaneous",
  "TELA",
  "ADVERTISEMENT",
  "Content Shoot Expenses",
  "Employee Food",
  "Heat Transfer Vinyl",
  "Parcel Pouch",
  "Vellum Board",
  "Vinyl Stickers",
  "Ziplock",
] as const;

const CATEGORY_ALIASES: Record<string, string> = {
  equipments: "Equipment",
  equipment: "Equipment",
  machines: "Machines",
  miscellaneous: "Miscellaneous",
  "employee salary": "Salary",
  "employee expenses": "Employee Expenses",
  tela: "TELA",
  materials: "Materials",
  advertisement: "ADVERTISEMENT",
  "content shoot expenses": "Content Shoot Expenses",
  "employee food": "Employee Food",
  "heat transfer vinyl": "Heat Transfer Vinyl",
  "parcel pouch": "Parcel Pouch",
  "vellum board": "Vellum Board",
  "vinyl stickers": "Vinyl Stickers",
  ziplock: "Ziplock",
  supplies: "Supplies",
  logistics: "Logistics",
  maintenance: "Maintenance",
  utilities: "Utilities",
  marketing: "Marketing",
  rent: "Rent",
  other: "Other",
};

export function normalizeExpenseCategory(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ");
  if (!t) return "Other";
  const alias = CATEGORY_ALIASES[t.toLowerCase()];
  if (alias) return alias;
  const exact = EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === t.toLowerCase());
  if (exact) return exact;
  return t.slice(0, 80);
}
