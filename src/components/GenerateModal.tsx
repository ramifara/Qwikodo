import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Generated } from "../lib/encode";

function toBytes(blob: Blob): Promise<number[]> {
  return blob.arrayBuffer().then((buf) => Array.from(new Uint8Array(buf)));
}

export function GenerateModal({ seed, onClose }: { seed: string; onClose: () => void }) {
  const [text, setText] = useState(seed);
  const [result, setResult] = useState<Generated | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => textareaRef.current?.focus(), []);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 1600);
    return () => clearTimeout(t);
  }, [note]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setError(null);
    if (!text.trim()) {
      setResult(null);
      setUrl(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { generateQr } = await import("../lib/encode");
        const made = await generateQr(text);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(made.image);
        setResult(made);
        setUrl(objectUrl);
      } catch (err) {
        if (cancelled) return;
        setResult(null);
        setUrl(null);
        setError(err instanceof Error ? err.message : "Couldn't make a code from that text.");
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [text]);

  const copyImage = async () => {
    if (!result) return;
    await invoke("write_clipboard_image", { bytes: await toBytes(result.image) });
    setNote("Copied");
  };

  const savePng = async () => {
    if (!result) return;
    const saved = await invoke<boolean>("save_png", { bytes: await toBytes(result.image) });
    if (saved) setNote("Saved");
  };

  return (
    <div className="viewfinder-scrim" role="dialog" aria-modal="true" aria-label="Generate a code">
      <div className="viewfinder generate">
        <div className="generate-body">
          <textarea
            ref={textareaRef}
            className="generate-input"
            placeholder="Type or paste anything — a link, Wi-Fi details, plain text…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
          />
          <div className="generate-preview">
            {url ? (
              <img src={url} alt="Generated code" />
            ) : (
              <span className="generate-hint">
                {error ?? "A QR code appears here as you type"}
              </span>
            )}
          </div>
        </div>
        <div className="viewfinder-bar">
          <span className="vf-status">{note ?? "Nothing leaves this computer"}</span>
          <button className="act" onClick={copyImage} disabled={!result}>
            Copy image
          </button>
          <button className="act" onClick={savePng} disabled={!result}>
            Save PNG
          </button>
          <button className="act" onClick={onClose} autoFocus={!seed}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
