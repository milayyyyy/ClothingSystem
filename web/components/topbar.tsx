"use client";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

const NAMES: Record<string, string> = {
  admin: "Dashboard", orders: "Orders", inventory: "Inventory", employees: "Employees",
  attendance: "Attendance", salary: "Salary", expenses: "Expenses", reports: "Reports",
  employee: "Dashboard", profile: "Profile",
};

export function Topbar({ name, role }: { name: string; role: string }) {
  const path = usePathname();
  const segs = path.split("/").filter(Boolean);
  const crumbs = segs.map((s, i) => ({ label: NAMES[s] || s, href: "/" + segs.slice(0, i + 1).join("/") }));

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background px-6">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {crumbs.map((c, i) => (
          <span key={c.href} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-muted-foreground/50">/</span>}
            <span className={i === crumbs.length - 1 ? "font-medium text-foreground" : ""}>{c.label}</span>
          </span>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground md:flex">
          <Search className="h-3.5 w-3.5" />
          <span className="text-xs">Quick search</span>
          <kbd className="ml-2 rounded border bg-background px-1.5 py-0.5 text-[10px]">⌘K</kbd>
        </div>
        <div className="hidden text-right text-xs sm:block">
          <div className="font-medium">{name}</div>
          <div className="capitalize text-muted-foreground">{role}</div>
        </div>
      </div>
    </header>
  );
}
