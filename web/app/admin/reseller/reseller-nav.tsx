"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Package, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceShellOptional } from "@/components/workspace-shell-context";

const LINKS = [
  { href: "/admin/reseller/products", label: "Reseller Product", icon: Package, hideForEmployee: true },
  { href: "/admin/reseller/orders", label: "Reseller Order", icon: ShoppingBag },
  { href: "/admin/reseller/chat", label: "Reseller Chat", icon: MessageCircle },
] as const;

export function ResellerNav() {
  const pathname = usePathname();
  const role = useWorkspaceShellOptional()?.role;
  const links = LINKS.filter((link) => !(role === "employee" && "hideForEmployee" in link && link.hideForEmployee));

  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {links.map((link) => {
        const Icon = link.icon;
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
