"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

const STATUSES = ["open", "in_progress", "done"] as const;

export function EmployeeTasksClient({ initial }: { initial: any[] }) {
  const supabase = createClient();
  const [list, setList] = useState(initial);

  async function setStatus(id: string, status: string) {
    const patch: any = { status };
    if (status === "done") patch.completed_at = new Date().toISOString();
    const { data } = await supabase.from("tasks").update(patch).eq("id", id).select().single();
    if (data) setList((p) => p.map((t) => (t.id === id ? { ...t, ...data } : t)));
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {list.map((t) => (
        <Card key={t.id}>
          <CardContent className="p-5">
            <div className="font-semibold">{t.title}</div>
            {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={t.status === "done" ? "green" : t.status === "in_progress" ? "blue" : "amber"}>{t.status}</Badge>
              {t.priority && <Badge variant="outline">{t.priority}</Badge>}
              {t.due_date && <span className="text-muted-foreground">Due {formatDate(t.due_date)}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => setStatus(t.id, s)} className={"rounded-full border px-2 py-0.5 text-[11px] capitalize " + (t.status === s ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent")}>
                  {s.replace("_", " ")}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
      {list.length === 0 && <p className="text-sm text-muted-foreground">No tasks assigned.</p>}
    </div>
  );
}
