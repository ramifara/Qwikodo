import {
  formatToLabel,
  prepareZXingModule,
  readBarcodes,
  type ReaderOptions,
} from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

// Resolve the decoder binary from the bundle, never from a CDN. The app has to
// work with the network unplugged.
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? wasmUrl : prefix + path,
  },
});

/** Warms the wasm module so the first scan isn't the slow one. */
export function warmDecoder() {
  return prepareZXingModule({ fireImmediately: true });
}

/** Still images: accuracy over speed. `formats: []` means every symbology. */
const STILL: ReaderOptions = {
  formats: [],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  tryDenoise: true,
  maxNumberOfSymbols: 16,
};

/** Live camera frames: speed over accuracy, since we get 10 tries a second. */
const LIVE: ReaderOptions = {
  formats: [],
  tryHarder: false,
  tryRotate: false,
  tryInvert: false,
  tryDownscale: true,
  maxNumberOfSymbols: 4,
};

export interface Scan {
  text: string;
  format: string;
}

function toScans(results: Awaited<ReturnType<typeof readBarcodes>>): Scan[] {
  const seen = new Set<string>();
  const scans: Scan[] = [];
  for (const r of results) {
    if (!r.isValid || !r.text || seen.has(r.text)) continue;
    seen.add(r.text);
    scans.push({ text: r.text, format: formatToLabel(r.format) ?? r.format });
  }
  return scans;
}

/** Decodes a still image. Falls back to a canvas pass for formats the
 *  webview's image decoder handles but `createImageBitmap` refuses (SVG). */
export async function decodeImage(blob: Blob): Promise<Scan[]> {
  try {
    return toScans(await readBarcodes(blob, STILL));
  } catch {
    return toScans(await readBarcodes(await rasterize(blob), STILL));
  }
}

export async function decodeFrame(frame: ImageData): Promise<Scan[]> {
  return toScans(await readBarcodes(frame, LIVE));
}

/** Longest side we hand to the decoder. Covers a 4K display untouched. */
const MAX_EDGE = 4096;

async function rasterize(blob: Blob): Promise<ImageData> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Couldn't open a drawing surface for that image.");
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } finally {
    URL.revokeObjectURL(url);
  }
}
