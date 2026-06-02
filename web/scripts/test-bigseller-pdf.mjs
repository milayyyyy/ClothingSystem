import { readFileSync } from "fs";
import { pathToFileURL } from "url";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function extractText(pdfPath) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"),
  ).href;
  const data = readFileSync(pdfPath);
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const chunks = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const text = await page.getTextContent();
    chunks.push(
      text.items
        .map((it) => ("str" in it ? String(it.str || "").trim() : ""))
        .filter(Boolean)
        .join("\n"),
    );
  }
  return chunks.join("\n");
}

// Dynamic import via tsx from project root
const pdfPath = process.argv[2] || "/Users/kzagado/Documents/BigSeller - Orders1.pdf";

const joined = await extractText(pdfPath);
console.log("--- TEXT (first 2000 chars) ---\n", joined.slice(0, 2000));

const { parseBigSellerRowsFromText } = await import("../lib/bigseller-pdf-pick-list.ts");
const { linesFromPdfRows } = await import("../lib/order-record-bigseller-import.ts");

const rows = parseBigSellerRowsFromText(joined);
console.log("\n--- PARSED ROWS ---\n", JSON.stringify(rows, null, 2));
console.log("\n--- IMPORT LINES ---\n", JSON.stringify(linesFromPdfRows(rows), null, 2));
