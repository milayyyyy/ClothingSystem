"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import { Clock, ScanFace } from "lucide-react";

// Dynamically import face recognition clock (needs browser APIs, skip SSR)
const FaceRecognitionClock = dynamic(
  () => import("@/components/face-recognition-clock").then((m) => m.FaceRecognitionClock),
  { ssr: false },
);

type ClockMode = "manual" | "face";

function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function fmt12(d: Date) {
  return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}
function fmtDate(d: Date) {
  return d.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export function TimeClock({
  onClock,
  lastId,
  userId,
  profileId,
  lastTimeIn,
}: {
  onClock: boolean;
  lastId?: string;
  userId: string;
  /** Profile table id — needed for face recognition descriptor lookup */
  profileId?: string;
  lastTimeIn?: string;
}) {
  const supabase = createClient();
  const router = useRouter();
  const now = useLiveClock();
  const [busy, setBusy] = useState(false);
  const [isClockedIn, setIsClockedIn] = useState(onClock);
  const [currentLastId, setCurrentLastId] = useState(lastId);
  const [lastClockIn, setLastClockIn] = useState(lastTimeIn);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Persist clock mode preference in localStorage
  const [mode, setMode] = useState<ClockMode>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("clockMode") as ClockMode) || "manual";
    }
    return "manual";
  });

  function switchMode(m: ClockMode) {
    setMode(m);
    setError(null);
    setSuccessMsg(null);
    if (typeof window !== "undefined") localStorage.setItem("clockMode", m);
  }

  useEffect(() => {
    setIsClockedIn(onClock);
    setCurrentLastId(lastId);
    setLastClockIn(lastTimeIn);
  }, [onClock, lastId, lastTimeIn]);

  async function timeIn() {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    const { data, error: err } = await supabase
      .from("attendance")
      .insert({ user_id: userId, time_in: new Date().toISOString() })
      .select("id")
      .single();
    if (err) {
      setError("Time in failed: " + err.message);
      setBusy(false);
      return;
    }
    setIsClockedIn(true);
    setCurrentLastId(data?.id);
    setLastClockIn(new Date().toISOString());
    setSuccessMsg("Timed in at " + fmt12(new Date()));
    setBusy(false);
    startTransition(() => router.refresh());
  }

  async function timeOut() {
    if (!currentLastId) {
      setError("No open time-in record found. Please contact admin.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    const { error: err } = await supabase
      .from("attendance")
      .update({ time_out: new Date().toISOString() })
      .eq("id", currentLastId)
      .eq("user_id", userId);
    if (err) {
      setError("Time out failed: " + err.message);
      setBusy(false);
      return;
    }
    setIsClockedIn(false);
    setCurrentLastId(undefined);
    setLastClockIn(undefined);
    setSuccessMsg("Timed out at " + fmt12(new Date()));
    setBusy(false);
    startTransition(() => router.refresh());
  }

  function handleFaceSuccess(action: "in" | "out", attendanceId?: string) {
    if (action === "in") {
      setIsClockedIn(true);
      setCurrentLastId(attendanceId);
      setLastClockIn(new Date().toISOString());
      setSuccessMsg("Timed in via face recognition at " + fmt12(new Date()));
    } else {
      setIsClockedIn(false);
      setCurrentLastId(undefined);
      setLastClockIn(undefined);
      setSuccessMsg("Timed out via face recognition at " + fmt12(new Date()));
    }
    startTransition(() => router.refresh());
  }

  const hasFace = !!profileId;
  // If no profileId, always force manual
  const activeMode = hasFace ? mode : "manual";

  return (
    <div className="space-y-4">
      {/* Live clock */}
      <div className="text-center">
        <div className="text-4xl font-bold tabular-nums tracking-tight">{fmt12(now)}</div>
        <div className="mt-1 text-sm text-muted-foreground">{fmtDate(now)}</div>
      </div>

      {/* Mode toggle — only show if face recognition is available */}
      {hasFace && (
        <div className="flex overflow-hidden rounded-lg border text-sm">
          <button
            type="button"
            onClick={() => switchMode("manual")}
            className={`flex flex-1 items-center justify-center gap-2 px-4 py-2.5 font-medium transition-colors
              ${activeMode === "manual"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted/60"}`}
          >
            <Clock className="h-4 w-4" />
            Manual
          </button>
          <button
            type="button"
            onClick={() => switchMode("face")}
            className={`flex flex-1 items-center justify-center gap-2 border-l px-4 py-2.5 font-medium transition-colors
              ${activeMode === "face"
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted/60"}`}
          >
            <ScanFace className="h-4 w-4" />
            Face ID
          </button>
        </div>
      )}

      {/* Status row */}
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
        <span className={"h-2.5 w-2.5 shrink-0 rounded-full " + (isClockedIn ? "bg-emerald-500 shadow-[0_0_6px_2px_rgba(16,185,129,0.5)]" : "bg-muted-foreground")} />
        <span className="text-sm font-medium">
          {isClockedIn ? "Currently clocked in" : "Not clocked in"}
        </span>
        {isClockedIn && lastClockIn && (
          <span className="ml-1 text-xs text-muted-foreground">
            since {new Date(lastClockIn).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true })}
          </span>
        )}
      </div>

      {/* Feedback messages */}
      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}
      {successMsg && !error && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          ✓ {successMsg}
        </div>
      )}

      {/* Manual mode */}
      {activeMode === "manual" && (
        <Button
          size="lg"
          variant={isClockedIn ? "outline" : "default"}
          onClick={isClockedIn ? timeOut : timeIn}
          disabled={busy || isPending}
          className="w-full"
        >
          {busy || isPending ? "Saving…" : isClockedIn ? "Time Out" : "Time In"}
        </Button>
      )}

      {/* Face recognition mode */}
      {activeMode === "face" && profileId && (
        <FaceRecognitionClock
          authUserId={userId}
          profileId={profileId}
          isClockedIn={isClockedIn}
          lastAttendanceId={currentLastId ?? null}
          onSuccess={handleFaceSuccess}
        />
      )}
    </div>
  );
}
