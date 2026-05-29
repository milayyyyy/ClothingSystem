"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { SidebarFallback } from "@/components/sidebar-fallback";
import { Topbar } from "@/components/topbar";
import { PwaRegister } from "@/components/pwa-register";
import type { Permissions } from "@/lib/role-permissions";

const Sidebar = dynamic(() => import("@/components/sidebar").then((m) => m.Sidebar), {
  ssr: false,
});

type Role = "admin" | "sub_admin" | "employee";

export function AppShell({
  role,
  name,
  permissions,
  userId,
  children,
}: {
  role: Role;
  name: string;
  permissions?: Permissions;
  userId?: string;
  children: ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-muted/20">
      <PwaRegister />
      {/* Mobile nav backdrop */}
      <button
        type="button"
        aria-label="Close menu"
        className={cn(
          "fixed inset-0 z-30 bg-black/45 backdrop-blur-[1px] transition-opacity lg:hidden",
          navOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setNavOpen(false)}
        tabIndex={navOpen ? 0 : -1}
      />
      <Suspense fallback={<SidebarFallback mobile />}>
        <Sidebar
          role={role}
          name={name}
          permissions={permissions}
          mobileOpen={navOpen}
          onNavigate={() => setNavOpen(false)}
        />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar
          role={role}
          name={name}
          userId={userId}
          onMenuClick={() => setNavOpen(true)}
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 py-4 pb-safe sm:px-4 md:px-6 md:py-6">
          <div className="mx-auto w-full max-w-7xl anim-in">{children}</div>
        </main>
      </div>
    </div>
  );
}
