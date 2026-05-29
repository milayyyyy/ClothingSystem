"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { GlobalSearch, QuickSearchTrigger } from "@/components/global-search";
import { PwaInstallButton } from "@/components/pwa-install-button";
import { Button } from "@/components/ui/button";

const StickyNotes = dynamic(() => import("@/components/sticky-notes").then((m) => m.StickyNotes), {
  ssr: false,
});

const NAMES: Record<string, string> = {
  admin: "Dashboard", orders: "Orders", stores: "Stores", inventory: "Inventory", "ready-made": "Ready made", employees: "Employees",
  attendance: "Attendance", salary: "Salary", expenses: "Expenses", reports: "Reports", maintenance: "Machine maintenance",
  "sales-expenses": "Sales & expenses", sales: "Sales", list: "Sales list",
  employee: "Dashboard", profile: "Profile",
};

export function Topbar({
  name,
  role,
  userId,
  onMenuClick,
}: {
  name: string;
  role: string;
  userId?: string;
  onMenuClick?: () => void;
}) {
  const path = usePathname();
  const segs = path.split("/").filter(Boolean);
  const crumbs = segs.map((s, i) => ({ label: NAMES[s] || s, href: "/" + segs.slice(0, i + 1).join("/") }));
  const pageTitle = crumbs.length > 0 ? crumbs[crumbs.length - 1].label : "PrintShop";

  return (
    <>
      {/* Global search overlay — listens for Cmd+K globally */}
      <GlobalSearch role={role} />

      <header className="sticky top-0 z-20 flex min-h-14 shrink-0 items-center gap-2 border-b bg-background px-3 pt-safe sm:gap-3 sm:px-4 md:px-6">
        {onMenuClick && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 w-9 shrink-0 p-0 lg:hidden"
            onClick={onMenuClick}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <nav className="min-w-0 flex-1 text-sm text-muted-foreground">
          <div className="truncate font-medium text-foreground lg:hidden">{pageTitle}</div>
          <div className="hidden items-center gap-1.5 lg:flex">
            {crumbs.map((c, i) => (
              <span key={c.href} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-muted-foreground/50">/</span>}
                <span className={i === crumbs.length - 1 ? "font-medium text-foreground" : ""}>{c.label}</span>
              </span>
            ))}
          </div>
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <PwaInstallButton compact />
          {userId && <StickyNotes userId={userId} />}
          <QuickSearchTrigger />
          <div className="hidden text-right text-xs md:block">
            <div className="max-w-[8rem] truncate font-medium">{name}</div>
            <div className="capitalize text-muted-foreground">{role.replace("_", " ")}</div>
          </div>
        </div>
      </header>
    </>
  );
}
