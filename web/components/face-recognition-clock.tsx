"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, Loader2, ScanFace, XCircle } from "lucide-react";

const MODEL_URL = "/models";
const MATCH_THRESHOLD = 0.50;
const SCAN_MS = 1500;
// inputSize options: 128, 160, 224, 320, 416, 512, 608
const DETECT_OPTS = { scoreThreshold: 0.2, inputSize: 512 } as const;
// Canvas size we draw each video frame into before detection
const CANVAS_W = 512;
const CANVAS_H = 384;

type Status =
  | "idle"
  | "loading_models"
  | "starting_camera"
  | "no_descriptor"
  | "scanning"
  | "face_found"
  | "verifying"
  | "matched"
  | "no_match"
  | "no_face"
  | "error";

type Props = {
  authUserId: string;
  profileId: string;
  isClockedIn: boolean;
  lastAttendanceId: string | null;
  onSuccess: (action: "in" | "out", attendanceId?: string) => void;
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

/** Draw a video frame onto an off-screen canvas and return it. */
function videoToCanvas(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Draw the video frame (un-mirrored — CSS mirror doesn't affect pixel data)
  ctx.drawImage(video, 0, 0, CANVAS_W, CANVAS_H);
  return canvas;
}

export function FaceRecognitionClock({
  authUserId,
  profileId,
  isClockedIn,
  lastAttendanceId,
  onSuccess,
}: Props) {
  const supabase = createClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // off-screen, used for detection
  const overlayRef = useRef<HTMLCanvasElement>(null); // visible overlay for bounding box
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanningRef = useRef(false); // prevent concurrent scans

  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");
  const [storedDescriptor, setStoredDescriptor] = useState<Float32Array | null>(null);
  const [active, setActive] = useState(false);

  // Load stored face descriptor
  useEffect(() => {
    supabase
      .from("profiles")
      .select("face_descriptor")
      .eq("id", profileId)
      .single()
      .then(({ data }) => {
        if (data?.face_descriptor && Array.isArray(data.face_descriptor)) {
          setStoredDescriptor(new Float32Array(data.face_descriptor as number[]));
        }
      });
  }, [profileId]);

  const stopEverything = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    // Clear overlay
    const ov = overlayRef.current;
    if (ov) {
      const ctx = ov.getContext("2d");
      ctx?.clearRect(0, 0, ov.width, ov.height);
    }
    setActive(false);
  }, []);

  useEffect(() => () => stopEverything(), [stopEverything]);

  // ── Main scan function ────────────────────────────────────────────────────
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

      // Draw frame to off-screen canvas for detection
      const src = videoToCanvas(video, canvas);
      if (!src) { scanningRef.current = false; timerRef.current = setTimeout(runScan, SCAN_MS); return; }

      // Step 1: lightweight detection only (fast)
      const box = await fa.detectSingleFace(src, opts);

      if (!box) {
        setStatus("no_face");
        setMsg("No face detected — look directly at the camera.");
        // Clear overlay
        if (overlay) { const ctx = overlay.getContext("2d"); ctx?.clearRect(0, 0, overlay.width, overlay.height); }
        scanningRef.current = false;
        timerRef.current = setTimeout(runScan, SCAN_MS);
        return;
      }

      // Draw bounding box on visible overlay
      if (overlay) {
        overlay.width = overlay.offsetWidth;
        overlay.height = overlay.offsetHeight;
        const ctx = overlay.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, overlay.width, overlay.height);
          // Scale box from canvas coords to overlay display coords
          const scaleX = overlay.width / CANVAS_W;
          const scaleY = overlay.height / CANVAS_H;
          // Mirror the X because the video is CSS-mirrored
          const bx = (CANVAS_W - box.box.x - box.box.width) * scaleX;
          const by = box.box.y * scaleY;
          const bw = box.box.width * scaleX;
          const bh = box.box.height * scaleY;
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 2;
          ctx.strokeRect(bx, by, bw, bh);
          ctx.fillStyle = "#3b82f6";
          ctx.font = "11px sans-serif";
          ctx.fillText("Face detected", bx, by > 14 ? by - 4 : by + bh + 14);
        }
      }

      setStatus("face_found");
      setMsg("Face found — comparing…");

      if (!storedDescriptor) {
        setStatus("no_descriptor");
        setMsg("Face not enrolled. Ask an admin to enrol your face first.");
        stopEverything();
        return;
      }

      // Step 2: full descriptor extraction
      setStatus("verifying");
      const full = await fa
        .detectSingleFace(src, opts)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!full) {
        setStatus("no_face");
        setMsg("Could not extract face features — try better lighting.");
        scanningRef.current = false;
        timerRef.current = setTimeout(runScan, SCAN_MS);
        return;
      }

      const dist = fa.euclideanDistance(Array.from(full.descriptor), Array.from(storedDescriptor));

      if (dist > MATCH_THRESHOLD) {
        setStatus("no_match");
        setMsg(`Face recognised but not a match (distance ${dist.toFixed(2)}). Try better lighting.`);
        scanningRef.current = false;
        timerRef.current = setTimeout(runScan, SCAN_MS);
        return;
      }

      // ── Matched ───────────────────────────────────────────────────────────
      stopEverything();
      setStatus("matched");

      if (!isClockedIn) {
        const { data, error } = await supabase
          .from("attendance")
          .insert({ user_id: authUserId, time_in: new Date().toISOString() })
          .select()
          .single();
        if (error) { setStatus("error"); setMsg(error.message); return; }
        setMsg(`✓ Clocked in at ${new Date().toLocaleTimeString()}`);
        onSuccess("in", data.id);
      } else {
        const { error } = await supabase
          .from("attendance")
          .update({ time_out: new Date().toISOString() })
          .eq("id", lastAttendanceId!)
          .eq("user_id", authUserId);
        if (error) { setStatus("error"); setMsg(error.message); return; }
        setMsg(`✓ Clocked out at ${new Date().toLocaleTimeString()}`);
        onSuccess("out");
      }
    } catch (err: any) {
      console.error("scan error:", err);
      scanningRef.current = false;
      timerRef.current = setTimeout(runScan, SCAN_MS);
    } finally {
      scanningRef.current = false;
    }
  }, [storedDescriptor, isClockedIn, lastAttendanceId, authUserId, stopEverything, onSuccess]);

  // Start scan loop when active
  useEffect(() => {
    if (!active) return;
    timerRef.current = setTimeout(runScan, 500); // 500ms initial warmup
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
      setMsg("Scanning… look directly at the camera.");
    } catch (err: any) {
      setStatus("error");
      setMsg(err?.name === "NotAllowedError"
        ? "Camera access denied. Allow camera permissions and try again."
        : "Camera error: " + (err?.message ?? "unknown"));
    }
  }

  // Status-driven UI helpers
  const isLoading = status === "loading_models" || status === "starting_camera";
  const isDone = status === "matched";
  const isError = status === "error";

  const statusColor =
    isDone ? "text-green-600 dark:text-green-400 font-medium" :
    isError || status === "no_match" ? "text-destructive" :
    status === "face_found" || status === "verifying" ? "text-blue-600 dark:text-blue-400" :
    "text-muted-foreground";

  const statusIcon =
    status === "scanning" || status === "no_face" ? "🔍" :
    status === "face_found" ? "👤" :
    status === "verifying" ? "⏳" :
    status === "no_match" ? "❌" :
    isDone ? "✓" : "";

  return (
    <div className="space-y-3">
      {/* Hidden canvas used as detection source */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera viewport */}
      <div className="relative mx-auto aspect-video w-full max-w-xs overflow-hidden rounded-xl border bg-muted">
        <video
          ref={videoRef}
          className={`h-full w-full object-cover [transform:scaleX(-1)] transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
          muted
          playsInline
        />

        {/* Visible overlay canvas for bounding box */}
        <canvas
          ref={overlayRef}
          className="absolute inset-0 h-full w-full"
          style={{ pointerEvents: "none" }}
        />

        {/* Idle placeholder */}
        {!active && !isDone && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ScanFace className="h-10 w-10 opacity-30" />
            <span className="text-xs opacity-50">Camera off</span>
          </div>
        )}

        {/* Matched overlay */}
        {isDone && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500/15">
            <CheckCircle2 className="h-16 w-16 text-green-500 drop-shadow" />
          </div>
        )}

        {/* No-match flash */}
        {status === "no_match" && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/10">
            <XCircle className="h-10 w-10 text-red-400" />
          </div>
        )}

        {/* Scan state pill */}
        {active && !isDone && (
          <div className={`absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-medium text-white
            ${status === "face_found" || status === "verifying" ? "bg-blue-600/80" :
              status === "no_match" ? "bg-red-600/80" :
              "bg-black/60"}`}>
            {status === "verifying" ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <span className={`inline-block h-2 w-2 rounded-full ${
                status === "face_found" ? "bg-blue-300" :
                status === "no_face" ? "bg-yellow-400" :
                "bg-red-400 animate-pulse"
              }`} />
            )}
            {status === "scanning" && "Scanning"}
            {status === "no_face" && "No face"}
            {status === "face_found" && "Face found"}
            {status === "verifying" && "Verifying"}
            {status === "no_match" && "No match"}
          </div>
        )}
      </div>

      {/* Status message */}
      {msg && (
        <p className={`text-center text-xs ${statusColor}`}>
          {statusIcon && <span className="mr-1">{statusIcon}</span>}
          {msg}
        </p>
      )}

      {/* Controls */}
      <div className="flex justify-center gap-2">
        {!active && !isDone && (
          <Button
            size="sm"
            variant="outline"
            onClick={startCamera}
            disabled={isLoading}
            className="gap-2"
          >
            {isLoading ? (
              <><Loader2 className="h-4 w-4 animate-spin" />
                {status === "loading_models" ? "Loading models…" : "Starting camera…"}
              </>
            ) : (
              <><Camera className="h-4 w-4" />
                {isClockedIn ? "Face Clock-Out" : "Face Clock-In"}
              </>
            )}
          </Button>
        )}
        {active && !isDone && (
          <Button size="sm" variant="ghost" onClick={() => { stopEverything(); setStatus("idle"); setMsg(""); }}>
            Cancel
          </Button>
        )}
      </div>

      {/* Hint if no descriptor */}
      {status === "no_descriptor" && (
        <p className="text-center text-[11px] text-muted-foreground">
          Ask an admin to open Attendance → Face Enrolment to enrol your face.
        </p>
      )}
    </div>
  );
}
