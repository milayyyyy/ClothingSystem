"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Activity, BarChart2, Building2, ClipboardList, DollarSign, FileText,
  LayoutDashboard, Loader2, Package, PackageX, Receipt, Search,
  Settings, ShoppingBag, Store, Tag, Users, Warehouse, X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type ResultItem = {
  id: string;
  section: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  href: string;
};

// ── Navigation shortcuts (shown when query is empty) ───────────────────────
const NAV_SHORTCUTS: ResultItem[] = [
  { id: "nav-dashboard",    section: "Navigation", icon: <LayoutDashboard className="h-4 w-4" />, title: "Dashboard",              href: "/admin" },
  { id: "nav-orders",       section: "Navigation", icon: <ShoppingBag className="h-4 w-4" />,    title: "Orders",                  href: "/admin/orders" },
  { id: "nav-inventory",    section: "Navigation", icon: <Package className="h-4 w-4" />,         title: "Inventory",               href: "/admin/inventory" },
  { id: "nav-readymade",    section: "Navigation", icon: <Warehouse className="h-4 w-4" />,       title: "Ready-made Inventory",    href: "/admin/inventory/ready-made" },
  { id: "nav-suppliers",    section: "Navigation", icon: <Building2 className="h-4 w-4" />,       title: "Suppliers",               href: "/admin/suppliers" },
  { id: "nav-returns",      section: "Navigation", icon: <PackageX className="h-4 w-4" />,        title: "Returns",                 href: "/admin/returns" },
  { id: "nav-sales",        section: "Navigation", icon: <Receipt className="h-4 w-4" />,         title: "Sales & Expenses",        href: "/admin/sales-expenses/sales/list" },
  { id: "nav-finance",      section: "Navigation", icon: <DollarSign className="h-4 w-4" />,      title: "Finance",                 href: "/admin/sales-expenses/finance" },
  { id: "nav-employees",    section: "Navigation", icon: <Users className="h-4 w-4" />,            title: "Employees",               href: "/admin/employees" },
  { id: "nav-attendance",   section: "Navigation", icon: <ClipboardList className="h-4 w-4" />,   title: "Attendance",              href: "/admin/attendance" },
  { id: "nav-salary",       section: "Navigation", icon: <FileText className="h-4 w-4" />,        title: "Salary",                  href: "/admin/salary" },
  { id: "nav-tasks",        section: "Navigation", icon: <ClipboardList className="h-4 w-4" />,   title: "Tasks",                   href: "/admin/tasks" },
  { id: "nav-stores",       section: "Navigation", icon: <Store className="h-4 w-4" />,            title: "Stores",                  href: "/admin/stores" },
  { id: "nav-reports",      section: "Navigation", icon: <BarChart2 className="h-4 w-4" />,        title: "Reports",                 href: "/admin/reports" },
  { id: "nav-activity",     section: "Navigation", icon: <Activity className="h-4 w-4" />,         title: "Activity Log",            href: "/admin/activity" },
  { id: "nav-settings",     section: "Navigation", icon: <Settings className="h-4 w-4" />,         title: "Settings",                href: "/admin/settings" },
];

// ── Search function ────────────────────────────────────────────────────────
async function runSearch(q: string): Promise<ResultItem[]> {
  const supabase = createClient();
  const like = `%${q}%`;
  const num = /^\d+$/.test(q.trim()) ? parseInt(q.trim(), 10) : null;
  const results: ResultItem[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safe = async (fn: () => PromiseLike<{ data: any[] | null; error: any }>) => {
    try { const r = await fn(); return r.data ?? []; }
    catch { return []; }
  };

  const [orders, employees, inventory, readyMade, tasks, stores,
         suppliers, financeAccts, expenses, activityLogs, salaries] =
    await Promise.all([
      // Orders
      safe(() =>
        supabase.from("orders")
          .select("id, order_no, customer_name, kind, status, stage")
          .or([
            `customer_name.ilike.${like}`,
            `notes.ilike.${like}`,
            `design_ref.ilike.${like}`,
            `waybill_no.ilike.${like}`,
            `external_order_no.ilike.${like}`,
            `sku_code.ilike.${like}`,
            num ? `order_no.eq.${num}` : null,
          ].filter(Boolean).join(","))
          .limit(5)
      ),
      // Employees
      safe(() =>
        supabase.from("profiles")
          .select("id, full_name, email, role, position")
          .or(`full_name.ilike.${like},email.ilike.${like}`)
          .limit(5)
      ),
      // Inventory
      safe(() =>
        supabase.from("inventory")
          .select("id, name, category, quantity, unit")
          .or(`name.ilike.${like},category.ilike.${like}`)
          .limit(5)
      ),
      // Ready-made boards
      safe(() =>
        supabase.from("ready_made_boards")
          .select("id, name")
          .ilike("name", like)
          .limit(5)
      ),
      // Tasks
      safe(() =>
        supabase.from("tasks")
          .select("id, title, status, task_type")
          .or(`title.ilike.${like},description.ilike.${like}`)
          .limit(5)
      ),
      // Stores
      safe(() =>
        supabase.from("stores")
          .select("id, name, shop_type")
          .or(`name.ilike.${like},notes.ilike.${like}`)
          .limit(5)
      ),
      // Suppliers
      safe(() =>
        supabase.from("suppliers")
          .select("id, name, contact_name, email")
          .or(`name.ilike.${like},contact_name.ilike.${like},email.ilike.${like}`)
          .limit(5)
      ),
      // Finance accounts
      safe(() =>
        supabase.from("finance_accounts")
          .select("id, name, kind, balance")
          .ilike("name", like)
          .limit(5)
      ),
      // Expenses
      safe(() =>
        supabase.from("expenses")
          .select("id, description, category, amount, expense_date")
          .or(`description.ilike.${like},category.ilike.${like}`)
          .limit(5)
      ),
      // Activity logs
      safe(() =>
        supabase.from("activity_logs")
          .select("id, description, action, created_at")
          .or(`description.ilike.${like},action.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(4)
      ),
      // Salaries (search by employee name via join)
      safe(() =>
        supabase.from("salaries")
          .select("id, period_start, period_end, net_pay, user:user_id(full_name,email)")
          .ilike("user.full_name", like)
          .limit(4)
      ),
    ]);

  // Map to ResultItem
  for (const o of orders as any[]) {
    results.push({
      id: `order-${o.id}`,
      section: "Orders",
      icon: <ShoppingBag className="h-4 w-4" />,
      title: `#${o.order_no} — ${o.customer_name || "Unknown"}`,
      subtitle: [o.kind, o.stage || o.status].filter(Boolean).join(" · "),
      href: "/admin/orders",
    });
  }

  for (const p of employees as any[]) {
    results.push({
      id: `emp-${p.id}`,
      section: "Employees",
      icon: <Users className="h-4 w-4" />,
      title: p.full_name || p.email,
      subtitle: [p.role, p.position].filter(Boolean).join(" · "),
      href: "/admin/employees",
    });
  }

  for (const i of inventory as any[]) {
    results.push({
      id: `inv-${i.id}`,
      section: "Inventory",
      icon: <Package className="h-4 w-4" />,
      title: i.name,
      subtitle: [i.category, `${i.quantity ?? 0}${i.unit ? " " + i.unit : ""} in stock`].filter(Boolean).join(" · "),
      href: "/admin/inventory",
    });
  }

  for (const r of readyMade as any[]) {
    results.push({
      id: `rm-${r.id}`,
      section: "Ready-made",
      icon: <Warehouse className="h-4 w-4" />,
      title: r.name,
      href: "/admin/inventory/ready-made",
    });
  }

  for (const t of tasks as any[]) {
    results.push({
      id: `task-${t.id}`,
      section: "Tasks",
      icon: <ClipboardList className="h-4 w-4" />,
      title: t.title,
      subtitle: [t.task_type, t.status?.replace("_", " ")].filter(Boolean).join(" · "),
      href: "/admin/tasks",
    });
  }

  for (const s of stores as any[]) {
    results.push({
      id: `store-${s.id}`,
      section: "Stores",
      icon: <Store className="h-4 w-4" />,
      title: s.name,
      subtitle: s.shop_type,
      href: "/admin/stores",
    });
  }

  for (const s of suppliers as any[]) {
    results.push({
      id: `sup-${s.id}`,
      section: "Suppliers",
      icon: <Building2 className="h-4 w-4" />,
      title: s.name,
      subtitle: [s.contact_name, s.email].filter(Boolean).join(" · "),
      href: "/admin/suppliers",
    });
  }

  for (const fa of financeAccts as any[]) {
    results.push({
      id: `fin-${fa.id}`,
      section: "Finance",
      icon: <DollarSign className="h-4 w-4" />,
      title: fa.name,
      subtitle: [fa.kind, fa.balance != null ? `₱${Number(fa.balance).toLocaleString()}` : null].filter(Boolean).join(" · "),
      href: "/admin/sales-expenses/finance",
    });
  }

  for (const e of expenses as any[]) {
    results.push({
      id: `exp-${e.id}`,
      section: "Expenses",
      icon: <Receipt className="h-4 w-4" />,
      title: e.description || e.category,
      subtitle: [e.category, e.amount != null ? `₱${Number(e.amount).toLocaleString()}` : null].filter(Boolean).join(" · "),
      href: "/admin/sales-expenses/expenses",
    });
  }

  for (const a of activityLogs as any[]) {
    results.push({
      id: `act-${a.id}`,
      section: "Activity Log",
      icon: <Activity className="h-4 w-4" />,
      title: a.description || a.action,
      subtitle: a.action,
      href: "/admin/activity",
    });
  }

  for (const sal of salaries as any[]) {
    const name = sal.user?.full_name || sal.user?.email || "Employee";
    results.push({
      id: `sal-${sal.id}`,
      section: "Salary",
      icon: <FileText className="h-4 w-4" />,
      title: name,
      subtitle: sal.period_start && sal.period_end
        ? `${sal.period_start} – ${sal.period_end}`
        : undefined,
      href: "/admin/salary",
    });
  }

  return results;
}

// ── Component ──────────────────────────────────────────────────────────────
export function GlobalSearch({ role }: { role?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd+K / Ctrl+K to open + custom event from trigger button
  useEffect(() => {
    function keyHandler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function openHandler() { setOpen(true); }
    window.addEventListener("keydown", keyHandler);
    window.addEventListener("global-search:open", openHandler);
    return () => {
      window.removeEventListener("keydown", keyHandler);
      window.removeEventListener("global-search:open", openHandler);
    };
  }, []);

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const r = await runSearch(query.trim());
      setResults(r);
      setSelectedIdx(0);
      setLoading(false);
    }, 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // Items to show: search results or nav shortcuts filtered by query
  const displayItems: ResultItem[] = query.trim().length >= 2
    ? results
    : query.trim().length === 0
    ? NAV_SHORTCUTS
    : NAV_SHORTCUTS.filter((n) => n.title.toLowerCase().includes(query.toLowerCase()));

  // Group by section
  const sections = Array.from(new Set(displayItems.map((r) => r.section)));

  const flatItems = sections.flatMap((s) => displayItems.filter((r) => r.section === s));

  function navigate(item: ResultItem) {
    setOpen(false);
    router.push(item.href);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatItems[selectedIdx]) {
      navigate(flatItems[selectedIdx]);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[10vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b px-4 py-3">
          {loading
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            : <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
            onKeyDown={handleKey}
            placeholder="Search orders, employees, tasks, inventory…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {flatItems.length === 0 && !loading && query.trim().length >= 2 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No results for "<span className="font-medium text-foreground">{query}</span>"
            </div>
          )}

          {sections.map((section) => {
            const sectionItems = displayItems.filter((r) => r.section === section);
            return (
              <div key={section}>
                <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section}
                </div>
                {sectionItems.map((item) => {
                  const globalIdx = flatItems.indexOf(item);
                  const isSelected = globalIdx === selectedIdx;
                  return (
                    <button
                      key={item.id}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors
                        ${isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"}`}
                      onMouseEnter={() => setSelectedIdx(globalIdx)}
                      onClick={() => navigate(item)}
                    >
                      <span className={`shrink-0 ${isSelected ? "text-primary-foreground" : "text-muted-foreground"}`}>
                        {item.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.title}</span>
                        {item.subtitle && (
                          <span className={`block truncate text-xs ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                            {item.subtitle}
                          </span>
                        )}
                      </span>
                      {isSelected && (
                        <span className={`shrink-0 text-xs ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          ↵
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-4 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span><kbd className="rounded border px-1 py-0.5 text-[10px]">↑↓</kbd> navigate</span>
            <span><kbd className="rounded border px-1 py-0.5 text-[10px]">↵</kbd> open</span>
            <span><kbd className="rounded border px-1 py-0.5 text-[10px]">esc</kbd> close</span>
          </div>
          {query.trim().length >= 2 && (
            <span>{flatItems.length} result{flatItems.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Trigger button (replaces the static placeholder in Topbar) ─────────────
export function QuickSearchTrigger() {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("global-search:open"))}
      className="hidden items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted md:flex"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="text-xs">Quick search</span>
      <kbd className="ml-2 rounded border bg-background px-1.5 py-0.5 text-[10px]">⌘K</kbd>
    </button>
  );
}
