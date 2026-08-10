import { prepareZXingModule, writeBarcode } from "zxing-wasm/writer";
import wasmUrl from "zxing-wasm/writer/zxing_writer.wasm?url";

// Resolve the writer binary from the bundle, never from a CDN — same offline
// rule as the reader. This module is only reached via a dynamic `import()`
// from the generate UI, so the 633 KB writer wasm never touches startup.
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith(".wasm") ? wasmUrl : prefix + path,
  },
});

export interface Generated {
  svg: string;
  image: Blob;
}

/** Renders `text` as a QR code. Throws if the text is empty or too long to fit. */
export async function generateQr(text: string): Promise<Generated> {
  const result = await writeBarcode(text, {
    format: "QRCode",
    scale: 8,
    options: "ecLevel=M",
  });
  if (!result.image) {
    throw new Error(result.error || "Couldn't make a code from that text.");
  }
  return { svg: result.svg, image: result.image };
}
