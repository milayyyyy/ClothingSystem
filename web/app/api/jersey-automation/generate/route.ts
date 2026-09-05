import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, cmyk, StandardFonts } from "pdf-lib";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";

// ─── types ────────────────────────────────────────────────────────────────────

type Player = {
  size: string;
  number: string;
  name: string;
};

type SizeConfig = {
  id: string;
  template_id: string;
  size: string;
  pdf_path: string | null;
  name_x: number;
  name_y: number;
  name_font_size: number;
  name_cmyk_c: number;
  name_cmyk_m: number;
  name_cmyk_y: number;
  name_cmyk_k: number;
  number_x: number;
  number_y: number;
  number_font_size: number;
  number_cmyk_c: number;
  number_cmyk_m: number;
  number_cmyk_y: number;
  number_cmyk_k: number;
};

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Download a file from the jersey-templates Supabase storage bucket. */
async function downloadTemplate(
  supabase: ReturnType<typeof createClient>,
  path: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from("jersey-templates").download(path);
  if (error || !data) return null;
  const buf = await data.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * Overlay SURNAME + NUMBER on the given CMYK PDF template bytes.
 * The template's existing content (including its CMYK/SWOP ICC profile) is
 * preserved; we add DeviceCMYK text on top using pdf-lib.
 */
async function buildPlayerPdf(
  templateBytes: Uint8Array,
  player: Player,
  cfg: SizeConfig,
): Promise<Uint8Array> {
  // Load existing CMYK template — all original content is kept intact
  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const page = pages[0];

  // Embed Helvetica-Bold (built-in, no external font file required)
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ── SURNAME ──────────────────────────────────────────────────────────
  page.drawText(player.name.toUpperCase(), {
    x: cfg.name_x,
    y: cfg.name_y,
    size: cfg.name_font_size,
    font,
    color: cmyk(
      cfg.name_cmyk_c / 100,
      cfg.name_cmyk_m / 100,
      cfg.name_cmyk_y / 100,
      cfg.name_cmyk_k / 100,
    ),
  });

  // ── JERSEY NUMBER ────────────────────────────────────────────────────
  page.drawText(player.number, {
    x: cfg.number_x,
    y: cfg.number_y,
    size: cfg.number_font_size,
    font,
    color: cmyk(
      cfg.number_cmyk_c / 100,
      cfg.number_cmyk_m / 100,
      cfg.number_cmyk_y / 100,
      cfg.number_cmyk_k / 100,
    ),
  });

  return pdfDoc.save();
}

// ─── route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { templateId, players } = (await req.json()) as {
      templateId: string;
      players: Player[];
    };

    if (!templateId) {
      return NextResponse.json({ error: "templateId is required." }, { status: 400 });
    }
    if (!Array.isArray(players) || players.length === 0) {
      return NextResponse.json({ error: "players array is empty." }, { status: 400 });
    }

    const supabase = createClient();

    // ── Authorisation ─────────────────────────────────────────────────
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Fetch size configs ────────────────────────────────────────────
    const { data: sizeRows, error: sizeErr } = await supabase
      .from("jersey_template_sizes")
      .select("*")
      .eq("template_id", templateId);

    if (sizeErr) {
      return NextResponse.json({ error: sizeErr.message }, { status: 500 });
    }

    const sizeMap = new Map<string, SizeConfig>();
    for (const s of sizeRows ?? []) sizeMap.set(s.size, s as SizeConfig);

    // ── Cache template PDFs (avoid re-downloading same size) ──────────
    const templateCache = new Map<string, Uint8Array | null>();
    async function getTemplate(path: string): Promise<Uint8Array | null> {
      if (templateCache.has(path)) return templateCache.get(path)!;
      const bytes = await downloadTemplate(supabase, path);
      templateCache.set(path, bytes);
      return bytes;
    }

    // ── Build ZIP ─────────────────────────────────────────────────────
    const zip = new JSZip();
    const skipped: string[] = [];

    for (const player of players) {
      const cfg = sizeMap.get(player.size);
      if (!cfg?.pdf_path) {
        skipped.push(`${player.number}_${player.name}_${player.size} (no template PDF)`);
        continue;
      }

      const templateBytes = await getTemplate(cfg.pdf_path);
      if (!templateBytes) {
        skipped.push(`${player.number}_${player.name}_${player.size} (template download failed)`);
        continue;
      }

      try {
        const outputBytes = await buildPlayerPdf(templateBytes, player, cfg);
        // Filename: NUMBER_SURNAME_SIZE.pdf  (e.g. 10_SMITH_S.pdf)
        const filename = `${player.number}_${player.name.replace(/\s+/g, "_")}_${player.size}.pdf`;
        zip.file(filename, outputBytes);
      } catch (err) {
        skipped.push(`${player.number}_${player.name}_${player.size} (PDF build error)`);
      }
    }

    if (zip.files && Object.keys(zip.files).length === 0) {
      return NextResponse.json(
        { error: "No PDFs were generated. Make sure the selected template has PDF files uploaded for the required sizes." },
        { status: 422 },
      );
    }

    // Add a skipped-log file if some players were skipped
    if (skipped.length > 0) {
      zip.file("_skipped.txt", skipped.join("\n"));
    }

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="jersey_batch_CMYK.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    console.error("[jersey-automation/generate]", err);
    return NextResponse.json(
      { error: err?.message ?? "Unexpected server error." },
      { status: 500 },
    );
  }
}
