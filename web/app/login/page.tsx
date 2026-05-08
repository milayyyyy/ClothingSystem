"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Printer, ShoppingBag, Package, Wallet, AlertCircle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setErr(error.message); setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      router.push(profile?.role === "admin" ? "/admin" : "/employee");
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 text-white lg:flex gradient-brand">
        <div className="absolute inset-0 saas-grid-bg opacity-20" />
        <div className="relative z-10 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
            <Printer className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold tracking-tight">PrintShop</span>
        </div>

        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Run your printing<br />business with clarity.
          </h1>
          <p className="max-w-md text-white/80">
            Manage sublimation and cut & sew jersey production end-to-end:
            orders, inventory, attendance, payroll, and BIR-ready reports.
          </p>
          <div className="grid max-w-md grid-cols-2 gap-3 pt-4">
            <Feature icon={ShoppingBag} label="Order tracking" />
            <Feature icon={Package} label="Inventory & alerts" />
            <Feature icon={Wallet} label="Payroll & taxes" />
            <Feature icon={Printer} label="Production board" />
          </div>
        </div>

        <div className="relative z-10 text-xs text-white/60">© {new Date().getFullYear()} Drips Printing</div>
      </div>

      {/* Form panel */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm anim-in">
          <div className="mb-8 lg:hidden">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg gradient-brand text-white">
              <Printer className="h-5 w-5" />
            </div>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to continue to your workspace.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {err && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" /> {err}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</> : "Sign in"}
            </Button>
            <p className="pt-1 text-center text-xs text-muted-foreground">
              Employees: ask your admin to create an account.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm backdrop-blur">
      <Icon className="h-4 w-4" /> {label}
    </div>
  );
}
