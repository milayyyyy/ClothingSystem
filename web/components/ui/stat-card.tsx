import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

export function StatCard({
  label, value, icon: Icon, change, accent = "primary", hint,
}: {
  label: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string }>;
  change?: number;
  accent?: "primary" | "success" | "warning" | "destructive" | "muted";
  hint?: string;
}) {
  const accents: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    destructive: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <Card className="card-hover anim-in overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 truncate text-2xl font-semibold tracking-tight">{value}</p>
            {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
            {typeof change === "number" && (
              <p className={cn("mt-2 inline-flex items-center gap-1 text-xs font-medium",
                change >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(change).toFixed(1)}% <span className="text-muted-foreground font-normal">vs last period</span>
              </p>
            )}
          </div>
          {Icon && (
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", accents[accent])}>
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
