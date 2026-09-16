export type CompressImageKind = "receipt" | "screenshot" | "design";

export type PreparedUpload = {
  file: File;
  ext: "jpg" | "pdf";
};

const PRESETS: Record<
  CompressImageKind,
  { maxEdge: number; quality: number; maxBytes: number }
> = {
  receipt: { maxEdge: 1600, quality: 0.75, maxBytes: Math.round(1.5 * 1024 * 1024) },
  screenshot: { maxEdge: 1920, quality: 0.8, maxBytes: 2 * 1024 * 1024 },
  design: { maxEdge: 2500, quality: 0.85, maxBytes: Math.round(2.5 * 1024 * 1024) },
};

export function isPdfUpload(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  return t === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Could not compress this image."));
        else resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function decodeImage(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  try {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
      close: () => bitmap.close(),
    };
  } catch {
    /* fall through — HEIC often fails createImageBitmap in Chrome */
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("decode"));
      el.src = url;
    });
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => {},
    };
  } catch {
    throw new Error(
      "This photo could not be converted (often HEIC from iPhone). Save or screenshot it as JPG or PNG, then upload again.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Resize and re-encode images as JPEG. PDFs are kept as-is if they are under the size cap. */
export async function prepareStorageUpload(file: File, kind: CompressImageKind): Promise<PreparedUpload> {
  const preset = PRESETS[kind];
  if (isPdfUpload(file)) {
    if (file.size > preset.maxBytes) {
      throw new Error(`PDF must be ${(preset.maxBytes / (1024 * 1024)).toFixed(1)} MB or smaller.`);
    }
    const name = file.name.toLowerCase().endsWith(".pdf") ? file.name : "file.pdf";
    return { file: new File([file], name, { type: "application/pdf" }), ext: "pdf" };
  }

  const decoded = await decodeImage(file);
  try {
    if (!decoded.width || !decoded.height) {
      throw new Error("This image has no readable dimensions.");
    }

    let scale = Math.min(1, preset.maxEdge / Math.max(decoded.width, decoded.height));
    let quality = preset.quality;
    let blob: Blob | null = null;

    for (let attempt = 0; attempt < 8; attempt++) {
      const w = Math.max(1, Math.round(decoded.width * scale));
      const h = Math.max(1, Math.round(decoded.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not compress this image.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      decoded.draw(ctx, w, h);
      blob = await canvasToJpegBlob(canvas, quality);
      if (blob.size <= preset.maxBytes) break;
      if (quality > 0.5) {
        quality = Math.max(0.5, quality - 0.1);
      } else {
        scale *= 0.85;
      }
    }

    if (!blob) throw new Error("Could not compress this image.");
    if (blob.size > preset.maxBytes) {
      throw new Error(
        `Compressed image is still too large (${(blob.size / (1024 * 1024)).toFixed(1)} MB). Try a smaller photo.`,
      );
    }

    const outName = file.name.replace(/\.[a-zA-Z0-9]{1,8}$/, "") || "image";
    return {
      file: new File([blob], `${outName}.jpg`, { type: "image/jpeg" }),
      ext: "jpg",
    };
  } finally {
    decoded.close();
  }
}
