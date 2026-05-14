"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  LayoutDashboard, ShoppingBag, Package, Users, Clock, Wallet, Receipt,
  BarChart3, LogOut, Printer, ChevronDown, Truck, ListChecks, Activity,
  Store, Globe, Sparkles, Warehouse, LayoutGrid, Wrench, TrendingUp, List, Landmark, Briefcase, Settings, PackageX,
} from "lucide-react";

type Role = "admin" | "sub_admin" | "employee";
type Child = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; query?: Record<string, string> };
type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  children?: Child[];
};
type Group = { title: string; items: Item[] };

const STAFF_GROUPS: Group[] = [
  { title: "Overview", items: [
    { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  ]},
  { title: "Operations", items: [
    {
      href: "/admin/orders", label: "Orders", icon: ShoppingBag,
      children: [
        { href: "/admin/orders?type=walkin_online", label: "Walk In & Online", icon: Store, query: { type: "walkin_online" } },
        { href: "/admin/orders/bigseller",        label: "BigSeller",    icon: Globe },
        { href: "/admin/orders?type=services",    label: "Services",     icon: Briefcase, query: { type: "services" } },
        { href: "/admin/orders?type=sublimation", label: "Sublimation",  icon: Sparkles, query: { type: "sublimation" } },
      ],
    },
    { href: "/admin/inventory", label: "Inventory", icon: Package },
    { href: "/admin/inventory/ready-made", label: "Ready made inventory", icon: LayoutGrid },
    { href: "/admin/suppliers", label: "Suppliers", icon: Truck },
    { href: "/admin/returns", label: "Returns", icon: PackageX },
    {
      href: "/admin/sales-expenses",
      label: "Sales & expenses",
      icon: Receipt,
      children: [
        { href: "/admin/sales-expenses/sales", label: "Sales", icon: TrendingUp },
        { href: "/admin/sales-expenses/sales/list", label: "Sales list", icon: List },
        { href: "/admin/sales-expenses/sales/bigseller", label: "BigSeller sales", icon: Globe },
        { href: "/admin/sales-expenses/expenses", label: "Expenses", icon: Receipt },
      ],
    },
    { href: "/admin/finance", label: "Finance", icon: Landmark },
  ]},
  { title: "People", items: [
    { href: "/admin/employees", label: "Employees", icon: Users, adminOnly: true },
    { href: "/admin/attendance", label: "Attendance", icon: Clock },
    { href: "/admin/salary", label: "Salary", icon: Wallet },
    { href: "/admin/tasks", label: "Tasks", icon: ListChecks },
    { href: "/admin/stores", label: "Stores", icon: Warehouse },
  ]},
  { title: "Audit", items: [
    { href: "/admin/activity", label: "Activity Log", icon: Activity },
  ]},
  { title: "Account", items: [
    { href: "/admin/settings", label: "Settings", icon: Settings, adminOnly: true },
  ]},
];

const EMPLOYEE_GROUPS: Group[] = [
  { title: "Workspace", items: [
    { href: "/employee", label: "Dashboard", icon: LayoutDashboard },
    { href: "/employee/orders", label: "My Orders", icon: ShoppingBag },
    { href: "/employee/tasks", label: "My Tasks", icon: ListChecks },
  ]},
  { title: "Personal", items: [
    { href: "/employee/attendance", label: "Attendance", icon: Clock },
    { href: "/employee/salary", label: "My Salary", icon: Wallet },
    { href: "/employee/profile", label: "Profile", icon: Users },
  ]},
];

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "U";
}

export function Sidebar({ role, name }: { role: Role; name: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const groups = role === "employee" ? EMPLOYEE_GROUPS : STAFF_GROUPS;
  const homeBase = role === "employee" ? "/employee" : "/admin";

  // Manual expand state — start with active section auto-expanded
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  function isItemActive(item: Item) {
    if (pathname === item.href) return true;
    // /admin/inventory must not stay highlighted on /admin/inventory/ready-made (separate nav item).
    if (item.href === "/admin/inventory" && pathname.startsWith("/admin/inventory/ready-made")) return false;
    if (item.href === "/admin/inventory" && pathname.startsWith("/admin/inventory/settings")) return false;
    if (item.href !== homeBase && pathname.startsWith(item.href)) return true;
    return false;
  }

  // Auto-expand the active parent on first navigation
  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      groups.forEach((g) => g.items.forEach((it) => {
        if (it.children && isItemActive(it) && next[it.href] === undefined) {
          next[it.href] = true;
        }
      }));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function toggle(href: string) {
    setOpenMap((m) => ({ ...m, [href]: !m[href] }));
  }

  function isChildActive(itemHref: string, child: Child) {
    if (child.query) {
      if (pathname !== itemHref) return false;
      const queryKey = Object.keys(child.query)[0];
      return params.get(queryKey) === child.query![queryKey];
    }
    // Path-based sub-route — exact match so /sales does not steal highlight from /sales/list
    return pathname === child.href;
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r" style={{ background: "hsl(var(--sidebar))" }}>
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg gradient-brand text-white shadow-sm">
          <Printer className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight">PrintShop</div>
          <div className="truncate text-[11px] text-muted-foreground capitalize">{role.replace("_", " ")} workspace</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.title} className="mb-5">
            <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {g.title}
            </div>
            <div className="space-y-0.5">
              {g.items
                .filter((i) => !i.adminOnly || role === "admin")
                .map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(item);
                  const hasChildren = !!item.children;
                  const expanded = hasChildren ? !!openMap[item.href] : false;
                  const highlightParent = !hasChildren && active;

                  return (
                    <div key={item.href}>
                      <div
                        className={cn(
                          "group relative flex items-center rounded-md transition-colors",
                          highlightParent
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        {highlightParent && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" />}
                        <Link
                          href={item.href}
                          className="flex flex-1 items-center gap-2.5 px-3 py-2 text-sm font-medium"
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", highlightParent ? "text-primary" : "")} />
                          <span className="flex-1 truncate">{item.label}</span>
                        </Link>
                        {hasChildren && (
                          <button
                            type="button"
                            aria-label={expanded ? "Collapse" : "Expand"}
                            onClick={() => toggle(item.href)}
                            className={cn(
                              "mr-1 rounded p-1 transition-colors hover:bg-foreground/10",
                              expanded ? "text-primary" : "text-muted-foreground/70"
                            )}
                          >
                            <ChevronDown
                              className={cn("h-3.5 w-3.5 transition-transform duration-150", expanded ? "rotate-0" : "-rotate-90")}
                            />
                          </button>
                        )}
                      </div>

                      {/* Sub-items */}
                      {hasChildren && (
                        <div
                          className={cn(
                            "grid overflow-hidden transition-all duration-200",
                            expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                          )}
                        >
                          <div className="min-h-0">
                            <div className="mt-0.5 ml-4 space-y-0.5 border-l pl-2">
                              {item.children!.map((c) => {
                                const CIcon = c.icon;
                                const cActive = isChildActive(item.href, c);
                                return (
                                  <Link
                                    key={c.href}
                                    href={c.href}
                                    className={cn(
                                      "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                                      cActive
                                        ? "bg-primary/10 text-primary font-medium"
                                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                    )}
                                  >
                                    <CIcon className={cn("h-3.5 w-3.5", cActive ? "text-primary" : "")} />
                                    {c.label}
                                  </Link>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-lg p-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full gradient-brand text-xs font-semibold text-white">
            {initials(name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{name}</div>
            <div className="truncate text-[11px] capitalize text-muted-foreground">{role.replace("_", " ")}</div>
          </div>
          <ThemeToggle />
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={logout}>
          <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
