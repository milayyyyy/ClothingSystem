"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function TimeClock({ onClock, lastId, userId }: { onClock: boolean; lastId?: string; userId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [isClockedIn, setIsClockedIn] = useState(onClock);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setIsClockedIn(onClock);
  }, [onClock]);

  async function timeIn() {
    setBusy(true);
    setIsClockedIn(true);
    await supabase.from("attendance").insert({ user_id: userId });
    setBusy(false);
    startTransition(() => router.refresh());
  }
  async function timeOut() {
    if (!lastId) return;
    setBusy(true);
    setIsClockedIn(false);
    await supabase.from("attendance").update({ time_out: new Date().toISOString() }).eq("id", lastId);
    setBusy(false);
    startTransition(() => router.refresh());
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <span className={"inline-block h-2 w-2 rounded-full " + (isClockedIn ? "bg-emerald-500" : "bg-muted-foreground")} />
      <span className="text-sm">{isClockedIn ? "Clocked in" : "Clocked out"}</span>
      <div className="ml-auto">
        {isClockedIn
          ? <Button size="sm" variant="outline" onClick={timeOut} disabled={busy || isPending}>Time Out</Button>
          : <Button size="sm" onClick={timeIn} disabled={busy || isPending}>Time In</Button>}
      </div>
    </div>
  );
}
