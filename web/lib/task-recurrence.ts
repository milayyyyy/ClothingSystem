import type { SupabaseClient } from "@supabase/supabase-js";

export type RepeatMode = "daily" | "weekly" | "monthly" | "custom";

export type RecurringTaskFields = {
  repeat_mode?: string | null;
  repeat_interval_days?: number | null;
  title: string;
  description?: string | null;
  task_type?: string | null;
  priority?: string | null;
  due_date?: string | null;
};

export function isRecurringTask(task: RecurringTaskFields): boolean {
  if (task.repeat_mode) return true;
  const days = task.repeat_interval_days;
  return days != null && days > 0;
}

export function repeatModeFromTask(task: RecurringTaskFields): RepeatMode | null {
  if (task.repeat_mode === "daily" || task.repeat_mode === "weekly" || task.repeat_mode === "monthly" || task.repeat_mode === "custom") {
    return task.repeat_mode;
  }
  const days = task.repeat_interval_days;
  if (days == null || days <= 0) return null;
  if (days === 1) return "daily";
  if (days === 7) return "weekly";
  if (days === 30) return "monthly";
  return "custom";
}

export function repeatLabel(task: RecurringTaskFields): string | null {
  const mode = repeatModeFromTask(task);
  if (!mode) return null;
  if (mode === "daily") return "Repeats daily";
  if (mode === "weekly") return "Repeats weekly";
  if (mode === "monthly") return "Repeats monthly";
  const days = task.repeat_interval_days;
  if (days && days > 0) return `Repeats every ${days} day${days === 1 ? "" : "s"}`;
  return "Repeats on schedule";
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Next due date after completing or scheduling from `base`. */
export function computeNextDueDate(task: RecurringTaskFields, base: Date = new Date()): string {
  const mode = repeatModeFromTask(task);
  const from = new Date(base);
  from.setHours(12, 0, 0, 0);

  if (mode === "daily") {
    from.setDate(from.getDate() + 1);
    return toYmd(from);
  }
  if (mode === "weekly") {
    from.setDate(from.getDate() + 7);
    return toYmd(from);
  }
  if (mode === "monthly") {
    from.setMonth(from.getMonth() + 1);
    return toYmd(from);
  }
  const days = Math.max(1, Number(task.repeat_interval_days) || 1);
  from.setDate(from.getDate() + days);
  return toYmd(from);
}

export function repeatFieldsForInsert(
  enabled: boolean,
  preset: RepeatMode,
  customDays: number,
): { repeat_mode: string | null; repeat_interval_days: number | null } {
  if (!enabled) {
    return { repeat_mode: null, repeat_interval_days: null };
  }
  if (preset === "daily") return { repeat_mode: "daily", repeat_interval_days: 1 };
  if (preset === "weekly") return { repeat_mode: "weekly", repeat_interval_days: 7 };
  if (preset === "monthly") return { repeat_mode: "monthly", repeat_interval_days: null };
  const days = Math.max(1, Math.floor(customDays) || 1);
  return { repeat_mode: "custom", repeat_interval_days: days };
}

/** Create the next open task when a recurring task is marked done. */
export async function spawnNextRecurringTask(
  supabase: SupabaseClient,
  completedTask: RecurringTaskFields & { id?: string },
  assigneeUserIds: string[],
) {
  if (!isRecurringTask(completedTask)) return null;

  const base = completedTask.due_date
    ? new Date(`${completedTask.due_date}T12:00:00`)
    : new Date();

  const mode = repeatModeFromTask(completedTask);
  const nextDue = computeNextDueDate(completedTask, base);

  const payload = {
    title: completedTask.title,
    description: completedTask.description ?? null,
    task_type: completedTask.task_type ?? null,
    priority: completedTask.priority ?? "normal",
    due_date: nextDue,
    status: "open" as const,
    repeat_mode: mode,
    repeat_interval_days:
      mode === "custom"
        ? Math.max(1, Number(completedTask.repeat_interval_days) || 1)
        : mode === "daily"
          ? 1
          : mode === "weekly"
            ? 7
            : null,
  };

  const { data: created, error } = await supabase.from("tasks").insert(payload).select().single();
  if (error || !created) return null;

  if (assigneeUserIds.length > 0) {
    await supabase.from("task_assignees").insert(
      assigneeUserIds.map((user_id) => ({ task_id: created.id, user_id })),
    );
  }

  return created;
}
