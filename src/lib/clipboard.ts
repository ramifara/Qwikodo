import { invoke } from "@tauri-apps/api/core";

/**
 * Puts text on the system clipboard via the Rust side. Used after a
 * background-triggered scan, where the webview's own clipboard API is
 * unreliable while the window is unfocused or still hidden.
 */
export async function writeClipboardText(text: string): Promise<void> {
  await invoke("write_clipboard_text", { text });
}

/** Copies text, falling back to a scratch textarea where the async API is blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const scratch = document.createElement("textarea");
    scratch.value = text;
    scratch.setAttribute("readonly", "");
    scratch.style.position = "fixed";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(scratch);
    return ok;
  }
}
