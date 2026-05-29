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
  const displayValue = typeof value === "number" ? String(value) : value;
  return (
    <Card className="card-hover anim-in">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-[10px] font-medium uppercase leading-snug tracking-wide text-muted-foreground sm:text-xs">
            {label}
          </p>
          {Icon && (
            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10", accents[accent])}>
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          )}
        </div>
        <p
          className="mt-2 break-words text-lg font-semibold tabular-nums leading-tight tracking-tight sm:text-xl 2xl:text-2xl"
          title={displayValue}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p>}
        {typeof change === "number" && (
          <p
            className={cn(
              "mt-2 inline-flex flex-wrap items-center gap-1 text-xs font-medium",
              change >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
            )}
          >
            {change >= 0 ? <ArrowUpRight className="h-3 w-3 shrink-0" /> : <ArrowDownRight className="h-3 w-3 shrink-0" />}
            {Math.abs(change).toFixed(1)}% <span className="font-normal text-muted-foreground">vs last period</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
