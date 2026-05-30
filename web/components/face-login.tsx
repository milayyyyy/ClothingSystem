"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, Loader2, ScanFace, XCircle } from "lucide-react";

const MODEL_URL = "/models";
const SCAN_MS = 1500;
const DETECT_OPTS = { scoreThreshold: 0.2, inputSize: 512 } as const;
const CANVAS_W = 512;
const CANVAS_H = 384;

type Status =
  | "idle"
  | "loading_models"
  | "starting_camera"
  | "scanning"
  | "face_found"
  | "verifying"
  | "signing_in"
  | "success"
  | "no_match"
  | "no_face"
  | "error";

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

export function FaceLogin() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanningRef = useRef(false);
  const signingInRef = useRef(false);

  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");
  const [active, setActive] = useState(false);

  const stopEverything = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    scanningRef.current = false;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    const ov = overlayRef.current;
    if (ov) {
      const ctx = ov.getContext("2d");
      ctx?.clearRect(0, 0, ov.width, ov.height);
    }
    setActive(false);
  }, []);

  useEffect(() => () => stopEverything(), [stopEverything]);

  const runScan = useCallback(async () => {
    if (scanningRef.current || signingInRef.current) return;
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
      if (!src) {
        scanningRef.current = false;
        timerRef.current = setTimeout(runScan, SCAN_MS);
        return;
      }

      const box = await fa.detectSingleFace(src, opts);
      if (!box) {
        setStatus("no_face");
        setMsg("No face detected — look directly at the camera.");
        if (overlay) {
          const ctx = overlay.getContext("2d");
          ctx?.clearRect(0, 0, overlay.width, overlay.height);
        }
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
          ctx.lineWidth = 2;
          ctx.strokeRect(bx, by, bw, bh);
        }
      }

      setStatus("face_found");
      setMsg("Face found — searching employee database…");
      setStatus("verifying");

      const full = await fa.detectSingleFace(src, opts).withFaceLandmarks().withFaceDescriptor();
      if (!full) {
        setStatus("no_face");
        setMsg("Could not read face features — try better lighting.");
        scanningRef.current = false;
        timerRef.current = setTimeout(runScan, SCAN_MS);
        return;
      }

      signingInRef.current = true;
      stopEverything();
      setStatus("signing_in");
      setMsg("Matching face and signing you in…");

      const res = await fetch("/api/auth/face-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descriptor: Array.from(full.descriptor) }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        signingInRef.current = false;
        setStatus("no_match");
        setMsg(data.error ?? "Face not recognized.");
        return;
      }

      setStatus("success");
      const name = data.fullName ? String(data.fullName) : "there";
      const clockNote =
        data.clockedIn && data.role === "employee" ? " You are clocked in." : "";
      setMsg(`Welcome, ${name}!${clockNote}`);

      router.push(typeof data.redirect === "string" ? data.redirect : "/employee");
      router.refresh();
    } catch (err: unknown) {
      console.error("face login scan:", err);
      signingInRef.current = false;
      setStatus("error");
      setMsg(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      scanningRef.current = false;
    }
  }, [router, stopEverything]);

  useEffect(() => {
    if (!active) return;
    timerRef.current = setTimeout(runScan, 500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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
      signingInRef.current = false;
      setActive(true);
      setStatus("scanning");
      setMsg("Scanning… look at the camera to sign in.");
    } catch (err: unknown) {
      setStatus("error");
      const e = err as { name?: string; message?: string };
      setMsg(
        e?.name === "NotAllowedError"
          ? "Camera access denied. Allow camera permissions and try again."
          : "Camera error: " + (e?.message ?? "unknown"),
      );
    }
  }

  const isLoading = status === "loading_models" || status === "starting_camera";
  const isDone = status === "success";
  const isSigningIn = status === "signing_in";

  const statusColor =
    isDone
      ? "text-green-600 dark:text-green-400 font-medium"
      : status === "error" || status === "no_match"
        ? "text-destructive"
        : status === "face_found" || status === "verifying" || isSigningIn
          ? "text-blue-600 dark:text-blue-400"
          : "text-muted-foreground";

  return (
    <div className="space-y-3 border-t pt-6">
      <div className="text-center">
        <p className="text-sm font-medium">Face sign-in</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Matches your face against enrolled employees, signs you in, and clocks in employees automatically.
        </p>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="relative mx-auto aspect-video w-full max-w-xs overflow-hidden rounded-xl border bg-muted">
        <video
          ref={videoRef}
          className={`h-full w-full object-cover [transform:scaleX(-1)] transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
          muted
          playsInline
        />
        <canvas ref={overlayRef} className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }} />

        {!active && !isDone && !isSigningIn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <ScanFace className="h-10 w-10 opacity-30" />
            <span className="text-xs opacity-50">Camera off</span>
          </div>
        )}

        {(isDone || isSigningIn) && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500/15">
            {isSigningIn ? (
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            ) : (
              <CheckCircle2 className="h-16 w-16 text-green-500 drop-shadow" />
            )}
          </div>
        )}

        {status === "no_match" && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/10">
            <XCircle className="h-10 w-10 text-red-400" />
          </div>
        )}

        {active && !isDone && (
          <div className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white">
            {status === "verifying" || status === "face_found" ? "Matching…" : "Scanning"}
          </div>
        )}
      </div>

      {msg && <p className={`text-center text-xs ${statusColor}`}>{msg}</p>}

      <div className="flex justify-center gap-2">
        {!active && !isDone && !isSigningIn && status !== "no_match" && (
          <Button size="sm" variant="outline" onClick={startCamera} disabled={isLoading} className="gap-2">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {status === "loading_models" ? "Loading models…" : "Starting camera…"}
              </>
            ) : (
              <>
                <Camera className="h-4 w-4" />
                Face clock-in & sign in
              </>
            )}
          </Button>
        )}
        {(active || status === "no_match" || status === "error") && !isDone && !isSigningIn && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              stopEverything();
              signingInRef.current = false;
              setStatus("idle");
              setMsg("");
            }}
          >
            Cancel
          </Button>
        )}
        {status === "no_match" && (
          <Button size="sm" variant="outline" onClick={startCamera} className="gap-2">
            <Camera className="h-4 w-4" /> Try again
          </Button>
        )}
      </div>
    </div>
  );
}
