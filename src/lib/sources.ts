import { invoke } from "@tauri-apps/api/core";
import { decodeImage, type Scan } from "./decode";

export type Source = "file" | "camera" | "clipboard" | "screen";

/** Reads every image the picker returned, in order. */
export async function scanFiles(files: File[]): Promise<Scan[]> {
  const scans: Scan[] = [];
  for (const file of files) {
    scans.push(...(await decodeImage(file)));
  }
  return dedupe(scans);
}

/** Pulls an image off the system clipboard. Empty response means no image. */
export async function scanClipboard(): Promise<Scan[]> {
  const bytes = await invoke<ArrayBuffer>("read_clipboard_image");
  if (bytes.byteLength === 0) {
    throw new NoInput("The clipboard has no image in it. Copy one and try again.");
  }
  return decodeImage(new Blob([bytes], { type: "image/png" }));
}

/** Hides the window, grabs every monitor, and reads them all. */
export async function scanScreens(): Promise<Scan[]> {
  const count = await invoke<number>("capture_screens");
  const scans: Scan[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = await invoke<ArrayBuffer>("take_capture", { index: i });
    scans.push(...(await decodeImage(new Blob([bytes], { type: "image/png" }))));
  }
  return dedupe(scans);
}

export function cameraAvailable(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === "function";
}

/** Thrown when a source had nothing to read, as opposed to failing to read it. */
export class NoInput extends Error {}

function dedupe(scans: Scan[]): Scan[] {
  const seen = new Set<string>();
  return scans.filter((s) => (seen.has(s.text) ? false : (seen.add(s.text), true)));
}
