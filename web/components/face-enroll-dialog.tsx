"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, CheckCircle2, Loader2, RefreshCw, ScanFace, Trash2 } from "lucide-react";

const MODEL_URL = "/models";
const CAPTURE_SAMPLES = 5;
// Lower threshold = more permissive detection. 0.3 works well for enrollment.
const DETECT_OPTIONS = { scoreThreshold: 0.3, inputSize: 416 } as const;

let modelsLoadedGlobal = false;
async function ensureModels() {
  if (modelsLoadedGlobal) return;
  const fa = await import("face-api.js");
  await Promise.all([
    fa.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    fa.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    fa.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelsLoadedGlobal = true;
}

type Props = {
  open: boolean;
  onClose: () => void;
  employee: { id: string; full_name: string | null; email: string; face_descriptor?: number[] | null } | null;
  onEnrolled: () => void;
};

// Status where the live camera feed should be shown
type Status = "idle" | "loading" | "camera" | "capturing" | "saving" | "done" | "camera_error";

function cameraVisible(status: Status) {
  return status === "camera" || status === "capturing" || status === "saving";
}

export function FaceEnrollDialog({ open, onClose, employee, onEnrolled }: Props) {
  const supabase = createClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [detectionMsg, setDetectionMsg] = useState("");

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Reset when dialog opens/closes
  useEffect(() => {
    if (!open) {
      stopCamera();
      setStatus("idle");
      setMsg("");
      setProgress(0);
      setDetectionMsg("");
    }
  }, [open, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  async function startEnrollment() {
    try {
      setStatus("loading");
      setMsg("Loading face recognition models…");
      setDetectionMsg("");
      await ensureModels();

      setMsg("Starting camera…");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((res) => {
          videoRef.current!.onloadedmetadata = () => videoRef.current!.play().then(res);
        });
      }
      // Warmup: give the camera sensor time to adjust before first detection attempt
      await new Promise((r) => setTimeout(r, 800));
      setStatus("camera");
      setMsg("Camera ready. Look directly at the camera, then click Capture.");
    } catch (err: any) {
      setStatus("camera_error");
      setMsg(err?.message?.includes("Permission") || err?.name === "NotAllowedError"
        ? "Camera access denied. Please allow camera permissions and try again."
        : "Camera error: " + (err?.message ?? "unknown"));
    }
  }

  async function captureFace() {
    if (!videoRef.current) return;
    setStatus("capturing");
    setProgress(0);
    setDetectionMsg("");

    try {
      const fa = await import("face-api.js");
      const descriptors: Float32Array[] = [];
      const opts = new fa.TinyFaceDetectorOptions(DETECT_OPTIONS);

      for (let i = 0; i < CAPTURE_SAMPLES; i++) {
        // Wait for video to be truly playing
        const video = videoRef.current;
        if (!video || video.readyState < 3) {
          await new Promise((r) => setTimeout(r, 300));
        }

        const det = await fa
          .detectSingleFace(videoRef.current, opts)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!det) {
          // Don't stop camera — let user retry with camera still visible
          setStatus("camera");
          setDetectionMsg("⚠ No face detected. Ensure your face is well-lit and centred, then try again.");
          return;
        }

        descriptors.push(det.descriptor);
        setProgress(Math.round(((i + 1) / CAPTURE_SAMPLES) * 100));
        // Small pause between frames
        if (i < CAPTURE_SAMPLES - 1) await new Promise((r) => setTimeout(r, 250));
      }

      // Average descriptors for robustness
      const avg = new Float32Array(128);
      for (const d of descriptors) {
        for (let j = 0; j < 128; j++) avg[j] += d[j] / CAPTURE_SAMPLES;
      }

      setStatus("saving");
      setMsg("Saving face data…");
      setDetectionMsg("");

      const { error } = await supabase
        .from("profiles")
        .update({ face_descriptor: Array.from(avg) })
        .eq("id", employee!.id);

      stopCamera();

      if (error) {
        setStatus("camera_error");
        setMsg("Save failed: " + error.message);
        return;
      }

      setStatus("done");
      setMsg(`✓ Face enrolled for ${employee?.full_name ?? "employee"}.`);
      onEnrolled();
    } catch (err: any) {
      setStatus("camera");
      setDetectionMsg("Capture error: " + (err?.message ?? "unknown. Please try again."));
    }
  }

  async function removeDescriptor() {
    if (!employee) return;
    if (!confirm(`Remove face enrolment for ${employee.full_name}?`)) return;
    const { error } = await supabase.from("profiles").update({ face_descriptor: null }).eq("id", employee.id);
    if (error) { alert(error.message); return; }
    onEnrolled();
    onClose();
  }

  const isEnrolled = !!employee?.face_descriptor?.length;
  const isBusy = status === "loading" || status === "saving";
  const showCamera = cameraVisible(status);

  if (!employee) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Face Enrolment"
      description={`Enrol ${employee.full_name}'s face for facial recognition time clock`}
      size="xl"
    >
      <div className="space-y-4">
        {/* Enrolment status badge */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Status:</span>
          {isEnrolled ? (
            <Badge variant="green" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Enrolled</Badge>
          ) : (
            <Badge variant="outline">Not enrolled</Badge>
          )}
        </div>

        {/* Camera viewport — always visible while stream is active */}
        <div className="relative mx-auto aspect-video w-full max-w-sm overflow-hidden rounded-xl border bg-muted">
          <video
            ref={videoRef}
            className={`h-full w-full object-cover [transform:scaleX(-1)] transition-opacity duration-200 ${showCamera ? "opacity-100" : "opacity-0"}`}
            muted
            playsInline
          />

          {/* Idle / error placeholder */}
          {!showCamera && status !== "done" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <ScanFace className="h-12 w-12 opacity-30" />
              <span className="text-xs opacity-50">Camera off</span>
            </div>
          )}

          {/* Success overlay */}
          {status === "done" && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-500/10">
              <CheckCircle2 className="h-16 w-16 text-green-500 drop-shadow" />
            </div>
          )}

          {/* Capture progress bar */}
          {status === "capturing" && (
            <div className="absolute bottom-0 left-0 right-0">
              <div className="h-1.5 bg-black/20">
                <div className="h-full bg-primary transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
              <p className="bg-black/50 py-1 text-center text-[11px] text-white">
                Capturing frame {Math.ceil((progress / 100) * CAPTURE_SAMPLES)} of {CAPTURE_SAMPLES}…
              </p>
            </div>
          )}

          {/* Scanning indicator */}
          {status === "camera" && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] text-white">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
              Live
            </div>
          )}
        </div>

        {/* Detection feedback (inline, doesn't stop camera) */}
        {detectionMsg && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
            {detectionMsg}
          </p>
        )}

        {/* General status message */}
        {msg && (
          <p className={`text-center text-xs ${status === "camera_error" ? "text-destructive" : status === "done" ? "text-green-600 font-medium" : "text-muted-foreground"}`}>
            {msg}
          </p>
        )}

        {/* Tips shown while camera is active */}
        {status === "camera" && !detectionMsg && (
          <ul className="text-xs text-muted-foreground space-y-1 rounded-md border bg-muted/30 px-3 py-2">
            <li>• Look directly at the camera and keep still</li>
            <li>• Make sure your face is well-lit from the front</li>
            <li>• Avoid strong backlighting (e.g. window behind you)</li>
            <li>• Remove sunglasses if wearing them</li>
          </ul>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {isEnrolled && (status === "idle" || status === "camera_error") && (
            <Button variant="outline" size="sm" className="gap-1 text-destructive hover:bg-destructive/10" onClick={removeDescriptor}>
              <Trash2 className="h-3.5 w-3.5" /> Remove face
            </Button>
          )}

          {/* Start / re-enrol button */}
          {(status === "idle" || status === "camera_error" || status === "done") && (
            <Button size="sm" onClick={startEnrollment} disabled={isBusy} className="gap-1">
              {status === "done"
                ? <><RefreshCw className="h-3.5 w-3.5" /> Re-enrol</>
                : <><Camera className="h-3.5 w-3.5" /> {isEnrolled ? "Re-enrol face" : "Start camera"}</>
              }
            </Button>
          )}

          {/* Loading */}
          {status === "loading" && (
            <Button size="sm" disabled className="gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {msg.includes("model") ? "Loading models…" : "Starting camera…"}
            </Button>
          )}

          {/* Capture — shown whenever camera is live */}
          {status === "camera" && (
            <Button size="sm" onClick={captureFace} className="gap-1">
              <ScanFace className="h-3.5 w-3.5" /> Capture face
            </Button>
          )}

          {/* Capturing */}
          {status === "capturing" && (
            <Button size="sm" disabled className="gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Capturing… {progress}%
            </Button>
          )}

          {/* Saving */}
          {status === "saving" && (
            <Button size="sm" disabled className="gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={() => { stopCamera(); onClose(); }}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
