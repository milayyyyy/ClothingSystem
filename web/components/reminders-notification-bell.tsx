"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Polls every 60 s for pending reminders with priority = 'urgent'. */
export function RemindersNotificationBell() {
  const [count, setCount] = useState<number>(0);
  const supabase = createClient();

  async function fetchCount() {
    const { count: c } = await supabase
      .from("reminders")
      .select("id", { count: "exact", head: true })
      .eq("priority", "urgent")
      .eq("status", "pending");
    setCount(c ?? 0);
  }

  useEffect(() => {
    void fetchCount();
    const id = setInterval(() => void fetchCount(), 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="relative h-9 w-9 shrink-0 p-0"
      title={count > 0 ? `${count} urgent reminder${count !== 1 ? "s" : ""}` : "Reminders"}
    >
      <Link href="/admin/reminders">
        <BellRing className={cn("h-4 w-4", count > 0 && "text-destructive")} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[10px] font-bold leading-none text-destructive-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
        <span className="sr-only">Reminders</span>
      </Link>
    </Button>
  );
}
