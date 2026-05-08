import { cn } from "@/lib/utils";

export function Badge({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "outline" | "amber" | "blue" | "green" | "red" | "purple" | "teal" }) {
  const map: Record<string, string> = {
    default: "bg-primary text-primary-foreground",
    outline: "border border-input",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    purple: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
    teal: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  };
  return <div className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", map[variant], className)} {...props} />;
}

export function StatusBadge({ status }: { status: string }) {
  const v = ({
    pending: "amber", printing: "blue", sewing: "blue", in_progress: "blue",
    ready: "green", done: "green", delivered: "green", cancelled: "red",
  } as const)[status as keyof object] || "outline";
  return <Badge variant={v as any}>{status.replace("_", " ")}</Badge>;
}
