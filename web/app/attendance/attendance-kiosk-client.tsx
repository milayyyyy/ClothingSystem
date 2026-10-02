"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Camera,
  CheckCircle2,
  Clock,
  Loader2,
  LogOut,
  ScanFace,
  XCircle,
} from "lucide-react";

const MODEL_URL = "/models";
const SCAN_MS = 2000;
const DETECT_OPTS = { scoreThreshold: 0.2, inputSize: 512 } as const;
const CANVAS_W = 512;
const CANVAS_H = 384;
const AUTO_RESET_MS = 5000;

type Status =
  | "idle"
  | "loading_models"
  | "starting_camera"
  | "scanning"
  | "face_found"
  | "verifying"
  | "success_in"
  | "success_out"
  | "no_match"
  | "no_face"
  | "error";

export type AttendanceTodayRow = {
  id: string;
  user_id: string;
  time_in: string;
  time_out: string | null;
  user?: { full_name: string | null; email: string | null } | null;
};

let _modelsLoaded = false;
async function ensureModels() {
  if (_modelsLoaded) return;
  const fa = await import("face-api.js");
  await Promise.all([
    fa.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  _modelsLoaded = true;
}

function videoToCanvas(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
  return canvas;
}

function fmt12(d: Date) {
  return d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function localDayStartIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString();
}

function localDayEndIso(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();
}

export function AttendanceKioskClient({
  initialRows,
}: {
  initialRows: AttendanceTodayRow[];
}) {
  const supabase = createClient();
  const now = useLiveClock();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanningRef = useRef(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");
  const [active, setActive] = useState(false);
  const [rows, setRows] = useState<AttendanceTodayRow[]>(initialRows);
  const [lastEmployee, setLastEmployee] = useState<string | null>(null);

  async function refreshRows() {
    const { data } = await supabase
      .from("attendance")
      .select("id, user_id, time_in, time_out, user:user_id(full_name, email)")
      .gte("time_in", localDayStartIso())
      .lte("time_in", localDayEndIso())
      .order("time_in", { ascending: false });
    if (data) setRows(data as AttendanceTodayRow[]);
  }

  // Refresh list every 30 seconds
  useEffect(() => {
    const id = setInterval(() => void refreshRows(), 30_000);
    return () => clearInterval(id);
  }, []);

  const stopCamera = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    const ov = overlayRef.current;
    if (ov) { const ctx = ov.getContext("2d"); ctx?.clearRect(0, 0, ov.width, ov.height); }
    setActive(false);
  }, []);

  useEffect(() => () => {
    stopCamera();
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, [stopCamera]);

  function autoReset() {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => {
      setStatus("idle");
      setMsg("");
      setLastEmployee(null);
    }, AUTO_RESET_MS);
  }

  const runScan = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;

    if (!video || !canvas || video.readyState < 3) {
      scanningRef.current = false;
      timerRef.current = setTimeout(runScan, SCAN_MS);
      return;
    }

    try {
      const fa = await import("face-api.js");
      const opts = new fa.TinyFaceDetectorOptions(DETECT_OPTS);
      const src = videoToCanvas(video, canvas);
      if (!src) { scanningRef.current = false; timerRef.current = setTimeout(runScan, SCAN_MS); return; }

      const box = await fa.detectSingleFace(src, opts);
      if (!box) {
        setStatus("no_face");
        setMsg("No face detected — look at the camera.");
        if (overlay) { const ctx = overlay.getContext("2d"); ctx?.clearRect(0, 0, overlay.width, overlay.height); }
        scanningRef.current = false;
        timerRef.current = setTimeout(runScan, SCAN_MS);
        return;
      }

      if (overlay) {
        overlay.width = overlay.offsetWidth;
        overlay.height = overlay.offsetHeight;
        const ctx = overlay.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          const scaleX = overlay.width / CANVAS_W;
          const scaleY = overlay.height / CANVAS_H;
          const bx = (CANVAS_W - box.box.x - box.box.width) * scaleX;
          const by = box.box.y * scaleY;
          const bw = box.box.width * scaleX;
          const bh = box.box.height * scaleY;
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 3;
          ctx.strokeRect(bx, by, bw, bh);
        }
      }

      setStatus("face_found");
      setMsg("Face found — identifying employee…");
      setStatus("verifying");

      const full = await fa.detectSingleFace(src, opts).withFaceLandmarks().withFaceDescriptor();
      if (!full) {
        setStatus("no_face");
        setMsg("Could not read face features — try better lighting.");
        scanningRef.current = false;
        timerRef.current = setTimeout(runScan, SCAN_MS);
        return;
      }

      // Send to API
      const res = await fetch("/api/attendance/face-clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descriptor: Array.from(full.descriptor) }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus("no_match");
        setMsg(data.error ?? "Face not recognized.");
        scanningRef.current = false;
        timerRef.current = setTimeout(runScan, SCAN_MS * 2);
        return;
      }

      stopCamera();
      const name = data.employeeName || "Employee";
      setLastEmployee(name);

      if (data.action === "time_in") {
        setStatus("success_in");
        setMsg(`${name} — Timed in at ${fmt12(new Date(data.time))}`);
      } else {
        setStatus("success_out");
        setMsg(`${name} — Timed out at ${fmt12(new Date(data.time))}`);
      }

      void refreshRows();
      autoReset();
    } catch (err: unknown) {
      console.error("kiosk scan:", err);
      scanningRef.current = false;
      timerRef.current = setTimeout(runScan, SCAN_MS);
    } finally {
      scanningRef.current = false;
    }
  }, [stopCamera]);

  useEffect(() => {
    if (!active) return;
    timerRef.current = setTimeout(runScan, 600);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [active, runScan]);

  async function startCamera() {
    try {
      setStatus("loading_models");
      setMsg("Loading face recognition models…");
      await ensureModels();
      setStatus("starting_camera");
      setMsg("Starting camera…");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((res) => {
          videoRef.current!.onloadedmetadata = () => videoRef.current!.play().then(res);
        });
      }
      setActive(true);
      setStatus("scanning");
      setMsg("Scanning — look at the camera to clock in or out.");
    } catch (err: unknown) {
      setStatus("error");
      const e = err as { name?: string; message?: string };
      setMsg(e?.name === "NotAllowedError"
        ? "Camera access denied. Allow camera permissions and try again."
        : "Camera error: " + (e?.message ?? "unknown"));
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const isLoading = status === "loading_models" || status === "starting_camera";
  const isDone = status === "success_in" || status === "success_out";

  const statusColor =
    isDone ? "text-green-600 dark:text-green-400 font-semibold" :
    status === "error" || status === "no_match" ? "text-destructive" :
    status === "face_found" || status === "verifying" ? "text-blue-600 dark:text-blue-400" :
    "text-muted-foreground";

  // Unique employees today
  const uniqueEmployees = new Set(rows.map((r) => r.user_id)).size;
  const clockedIn = rows.filter((r) => !r.time_out).length;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:flex-row lg:gap-8 lg:p-8">
      {/* LEFT: Face ID + clock */}
      <div className="flex flex-col items-center gap-5 lg:w-[420px] lg:shrink-0">
        {/* Live clock */}
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight text-muted-foreground">Attendance Management</h1>
          <div className="mt-2 text-5xl font-bold tabular-nums tracking-tight">{fmt12(now)}</div>
          <div className="mt-1 text-sm text-muted-foreground">{fmtDate(now)}</div>
        </div>

        {/* Camera viewport */}
        <canvas ref={canvasRef} className="hidden" />
        <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-2xl border-2 border-border bg-muted shadow-lg">
          <video
            ref={videoRef}
            className={`h-full w-full object-cover [transform:scaleX(-1)] transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
            muted
            playsInline
          />
          <canvas ref={overlayRef} className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }} />

          {!active && !isDone && status !== "no_match" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <ScanFace className="h-16 w-16 opacity-20" />
              <span className="text-sm opacity-50">Tap the button to start</span>
            </div>
          )}

          {status === "success_in" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-green-500/15">
              <CheckCircle2 className="h-20 w-20 text-green-500 drop-shadow" />
              <span className="text-lg font-bold text-green-700 dark:text-green-400">Timed In</span>
            </div>
          )}
          {status === "success_out" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-blue-500/15">
              <CheckCircle2 className="h-20 w-20 text-blue-500 drop-shadow" />
              <span className="text-lg font-bold text-blue-700 dark:text-blue-400">Timed Out</span>
            </div>
          )}

          {status === "no_match" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-500/10">
              <XCircle className="h-14 w-14 text-red-400" />
              <span className="text-sm font-medium text-red-600">Not recognized</span>
            </div>
          )}

          {active && !isDone && (
            <div className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white">
              {status === "verifying" || status === "face_found" ? "Identifying…" : "Scanning"}
            </div>
          )}
        </div>

        {/* Status message */}
        {msg && <p className={`text-center text-sm ${statusColor}`}>{msg}</p>}

        {/* Controls */}
        <div className="flex flex-wrap justify-center gap-3">
          {!active && !isDone && status !== "no_match" && (
            <Button size="lg" onClick={startCamera} disabled={isLoading} className="gap-2 text-base">
              {isLoading ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> {status === "loading_models" ? "Loading models…" : "Starting camera…"}</>
              ) : (
                <><Camera className="h-5 w-5" /> Start Face ID</>
              )}
            </Button>
          )}
          {(active || status === "no_match" || status === "error") && !isDone && (
            <Button size="lg" variant="outline" onClick={() => { stopCamera(); setStatus("idle"); setMsg(""); }}>
              Cancel
            </Button>
          )}
          {status === "no_match" && (
            <Button size="lg" variant="outline" onClick={startCamera} className="gap-2">
              <Camera className="h-5 w-5" /> Try again
            </Button>
          )}
          {isDone && (
            <Button size="lg" onClick={() => { setStatus("idle"); setMsg(""); setLastEmployee(null); }} className="gap-2 text-base">
              <Camera className="h-5 w-5" /> Next employee
            </Button>
          )}
        </div>

        {/* Sign out */}
        <Button variant="ghost" size="sm" className="mt-2 text-xs text-muted-foreground" onClick={handleSignOut}>
          <LogOut className="mr-1 h-3.5 w-3.5" /> Sign out
        </Button>
      </div>

      {/* RIGHT: Today's attendance list */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Today&apos;s Attendance</h2>
            <p className="text-sm text-muted-foreground">
              {uniqueEmployees} employee{uniqueEmployees !== 1 ? "s" : ""} ·{" "}
              <span className="text-green-600 dark:text-green-400">{clockedIn} currently clocked in</span>
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refreshRows()}>
            Refresh
          </Button>
        </div>

        <Card className="flex-1">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[500px] text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-3 font-medium">Employee</th>
                  <th className="p-3 font-medium">Time In</th>
                  <th className="p-3 font-medium">Time Out</th>
                  <th className="p-3 font-medium">Duration</th>
                  <th className="p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const inT = new Date(r.time_in);
                  const outT = r.time_out ? new Date(r.time_out) : null;
                  const dur = outT
                    ? `${((outT.getTime() - inT.getTime()) / 3600000).toFixed(1)}h`
                    : "—";
                  const isHighlighted = lastEmployee && (r.user?.full_name === lastEmployee || r.user?.email === lastEmployee);
                  return (
                    <tr
                      key={r.id}
                      className={`border-t transition-colors ${isHighlighted ? "bg-primary/5" : "hover:bg-muted/20"}`}
                    >
                      <td className="p-3 font-medium">
                        {r.user?.full_name || r.user?.email || "—"}
                      </td>
                      <td className="p-3 tabular-nums">{fmt12(inT)}</td>
                      <td className="p-3 tabular-nums">{outT ? fmt12(outT) : "—"}</td>
                      <td className="p-3 tabular-nums">{dur}</td>
                      <td className="p-3">
                        {outT ? (
                          <Badge variant="muted">Completed</Badge>
                        ) : (
                          <Badge variant="green">
                            <Clock className="mr-1 h-3 w-3" /> Clocked in
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-muted-foreground">
                      No attendance records today. Use Face ID to clock in.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
