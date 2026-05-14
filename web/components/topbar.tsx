"use client";
import { usePathname } from "next/navigation";
import { GlobalSearch, QuickSearchTrigger } from "@/components/global-search";
import { ThemeToggle } from "@/components/theme-toggle";

const NAMES: Record<string, string> = {
  admin: "Dashboard", orders: "Orders", stores: "Stores", inventory: "Inventory", "ready-made": "Ready made", employees: "Employees",
  attendance: "Attendance", salary: "Salary", expenses: "Expenses", reports: "Reports", maintenance: "Machine maintenance",
  "sales-expenses": "Sales & expenses", sales: "Sales", list: "Sales list",
  bigseller: "BigSeller",
  employee: "Dashboard", profile: "Profile",
};

export function Topbar({ name, role, userId }: { name: string; role: string; userId?: string }) {
  const path = usePathname();
  const segs = path.split("/").filter(Boolean);
  const crumbs = segs.map((s, i) => ({ label: NAMES[s] || s, href: "/" + segs.slice(0, i + 1).join("/") }));

  return (
    <>
      {/* Global search overlay — listens for Cmd+K globally */}
      <GlobalSearch role={role} />

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background px-6">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              <span className={i === crumbs.length - 1 ? "font-medium text-foreground" : ""}>{c.label}</span>
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <QuickSearchTrigger />
          <ThemeToggle />
          <div className="hidden text-right text-xs sm:block">
            <div className="font-medium">{name}</div>
            <div className="capitalize text-muted-foreground">{role}</div>
          </div>
        </div>
      </header>
    </>
  );
}
