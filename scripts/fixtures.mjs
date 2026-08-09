/**
 * Generates one image per symbology into fixtures/, then reads each one back
 * with the exact options the app uses. Run: node scripts/fixtures.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  formatToLabel,
  prepareZXingModule as prepareReader,
  readBarcodes,
} from "zxing-wasm/reader";
import { prepareZXingModule as prepareWriter, writeBarcode } from "zxing-wasm/writer";

// The application promises fully local decoding. Make the fixture check enforce
// the same rule instead of silently falling back to zxing-wasm's default CDN.
const [readerWasm, writerWasm] = await Promise.all([
  readFile(new URL(import.meta.resolve("zxing-wasm/reader/zxing_reader.wasm"))),
  readFile(new URL(import.meta.resolve("zxing-wasm/writer/zxing_writer.wasm"))),
]);
prepareReader({ overrides: { wasmBinary: readerWasm } });
prepareWriter({ overrides: { wasmBinary: writerWasm } });

const STILL = {
  formats: [],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  tryDenoise: true,
  maxNumberOfSymbols: 16,
};

const CASES = [
  ["QRCode", "https://example.com/scan?id=42"],
  ["MicroQRCode", "MICRO-QR"],
  ["rMQRCode", "RMQR-PAYLOAD"],
  ["DataMatrix", "DATAMATRIX-PAYLOAD"],
  ["Aztec", "AZTEC-PAYLOAD"],
  ["PDF417", "PDF417-PAYLOAD-0123456789"],
  ["MicroPDF417", "MICROPDF417"],
  ["MaxiCode", "MAXICODE-PAYLOAD"],
  ["EAN13", "5901234123457"],
  ["EAN8", "96385074"],
  ["UPCA", "036000291452"],
  // UPC-E is expanded to its full UPC-A form on the way out, per the standard.
  ["UPCE", "01234565", "0012345000065"],
  ["Code39", "CODE39TEST"],
  ["Code93", "CODE93TEST"],
  ["Code128", "Code128-Payload-123"],
  ["Codabar", "A123456789B"],
  ["ITF", "12345670"],
  ["DataBar", "01234567890128"],
  ["DataBarExpanded", "(01)00012345678905"],
  ["DataBarLimited", "01234567890128"],
  ["DXFilmEdge", "79-7"],
  ["Telepen", "TELEPEN123"],
];

/**
 * ZXing normalises some retail symbologies on the way out: UPC-A comes back as
 * a 13-digit EAN, UPC-E is expanded to its full form, and GS1 DataBar text is
 * prefixed with its application identifier. Those are correct reads, so the
 * comparison strips the decoration rather than calling them failures.
 */
function matches(got, expected) {
  const strip = (s) => s.replace(/[()]/g, "").replace(/^0+/, "");
  return got === expected || strip(got) === strip(expected) || strip(got).endsWith(strip(expected));
}

const dir = new URL("../fixtures/", import.meta.url);
await mkdir(dir, { recursive: true });

let written = 0;
let passed = 0;
const failures = [];

for (const [format, payload, expected = payload] of CASES) {
  let image;
  try {
    const result = await writeBarcode(payload, { format, scale: 4 });
    if (!result.image) throw new Error(result.error || "no image");
    image = result.image;
  } catch (err) {
    console.log(`  --   ${format.padEnd(16)} could not be generated (${err.message})`);
    continue;
  }

  written++;
  await writeFile(new URL(`${format}.png`, dir), Buffer.from(await image.arrayBuffer()));

  const results = await readBarcodes(image, STILL);
  const hit = results.find((r) => r.isValid && matches(r.text, expected));
  if (hit) {
    passed++;
    console.log(`  ok   ${format.padEnd(16)} read back as ${formatToLabel(hit.format)}`);
  } else {
    const got = results.map((r) => `${r.format}:${JSON.stringify(r.text)}`).join(", ") || "nothing";
    failures.push(`${format} -> ${got}`);
    console.log(`  FAIL ${format.padEnd(16)} expected ${JSON.stringify(expected)}, got ${got}`);
  }
}

console.log(`\n${passed}/${written} generated symbologies round-tripped.`);
if (written === 0) {
  console.error("No fixtures were generated; the decoder check did not run.");
  process.exitCode = 1;
} else if (failures.length) {
  process.exitCode = 1;
}
