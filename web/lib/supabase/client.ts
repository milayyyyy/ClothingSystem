"use client";
import { createBrowserClient } from "@supabase/ssr";

function requirePublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY", v: string | undefined) {
  const t = (v ?? "").trim();
  if (!t) {
    throw new Error(
      `Missing ${name}. Create web/.env.local with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then restart "npm run dev".`,
    );
  }
  return t;
}

export function createClient() {
  return createBrowserClient(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
