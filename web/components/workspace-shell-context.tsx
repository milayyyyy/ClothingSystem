"use client";

import { createContext, useContext } from "react";
import type { Permissions } from "@/lib/role-permissions";
import type { Role } from "@/lib/supabase/server";

export type WorkspaceShell = {
  role: Role;
  userId: string;
  name: string;
  permissions: Permissions;
};

const WorkspaceShellContext = createContext<WorkspaceShell | null>(null);

export function WorkspaceShellProvider({
  value,
  children,
}: {
  value: WorkspaceShell;
  children: React.ReactNode;
}) {
  return <WorkspaceShellContext.Provider value={value}>{children}</WorkspaceShellContext.Provider>;
}

export function useWorkspaceShell(): WorkspaceShell {
  const ctx = useContext(WorkspaceShellContext);
  if (!ctx) {
    throw new Error("useWorkspaceShell must be used within WorkspaceShellProvider");
  }
  return ctx;
}

/** Safe variant for shared client components that may render outside the shell. */
export function useWorkspaceShellOptional(): WorkspaceShell | null {
  return useContext(WorkspaceShellContext);
}
