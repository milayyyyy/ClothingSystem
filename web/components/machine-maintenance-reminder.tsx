import { CalendarClock, Wrench } from "lucide-react";

type Variant = "employee" | "admin";

const COPY: Record<
  Variant,
  { title: string; body: string }
> = {
  employee: {
    title: "Scheduled machine maintenance",
    body:
      "Production equipment (heat presses, cutters, printers, sewing stations, etc.) may have planned downtime. Check with your supervisor or the posted maintenance calendar before you block work that needs a specific machine. If maintenance affects your tasks, update status or leave a short note on the task.",
  },
  admin: {
    title: "Machine maintenance & assignments",
    body:
      "When you schedule equipment downtime, create or update tasks so assignees know which machines are unavailable and when. Clear task titles or descriptions reduce missed handoffs during maintenance windows.",
  },
};

export function MachineMaintenanceReminder({ variant }: { variant: Variant }) {
  const { title, body } = COPY[variant];
  return (
    <div
      role="note"
      className="rounded-lg border border-amber-500/35 bg-amber-500/[0.07] px-4 py-3 text-sm shadow-sm dark:border-amber-400/30 dark:bg-amber-400/[0.08]"
    >
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
          <Wrench className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">{title}</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              <CalendarClock className="h-3 w-3" aria-hidden />
              Reminder
            </span>
          </div>
          <p className="mt-1.5 text-muted-foreground leading-relaxed">{body}</p>
        </div>
      </div>
    </div>
  );
}
