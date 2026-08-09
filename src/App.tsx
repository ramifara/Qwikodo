import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraModal } from "./components/CameraModal";
import { HistoryList } from "./components/HistoryList";
import { ResultLabel } from "./components/ResultLabel";
import { SourceGrid } from "./components/SourceGrid";
import { warmDecoder, type Scan } from "./lib/decode";
import { fingerprint } from "./lib/payload";
import {
  cameraAvailable,
  NoInput,
  scanClipboard,
  scanFiles,
  scanScreens,
  type Source,
} from "./lib/sources";
import { useHistory, type ScanEntry } from "./store/history";

const IS_MAC = navigator.userAgent.includes("Mac");
const MOD = IS_MAC ? "⌘" : "Ctrl+";

/** What to say when a source works but holds no code. */
const NOTHING_FOUND: Record<Source, string | undefined> = {
  file: "Try a larger or sharper image.",
  camera: undefined,
  clipboard: undefined,
  screen: IS_MAC
    ? "If the screen came back blank, allow Qwikodo under Privacy & Security › Screen Recording."
    : "If the screen came back blank, your desktop may be blocking screen capture.",
};

/** What to say when a source itself fails. The raw cause follows in brackets. */
const CANNOT_READ: Record<Source, string> = {
  file: "That image couldn't be opened.",
  camera: "The camera couldn't be read.",
  clipboard: "The clipboard couldn't be read.",
  screen: "The screen couldn't be captured.",
};

/** The state word stays short enough to shout; the detail speaks in sentences. */
type Status = {
  kind: "idle" | "busy" | "ok" | "error";
  text: string;
  detail?: string;
};

export default function App() {
  const entries = useHistory((s) => s.entries);
  const add = useHistory((s) => s.add);

  const [current, setCurrent] = useState<ScanEntry | null>(null);
  const [alsoFound, setAlsoFound] = useState(0);
  // Bumped on every read so the label reprints even when the same code comes
  // back and history quietly deduplicates it.
  const [reads, setReads] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "Ready" });
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dropping, setDropping] = useState(false);

  const picker = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const dragDepth = useRef(0);
  const cameraReady = useMemo(cameraAvailable, []);
  const bars = useMemo(() => fingerprint(current?.content ?? ""), [current?.content]);

  useEffect(() => {
    warmDecoder().catch(() => undefined);
  }, []);

  /** Records a batch of scans, newest first, and puts the first one on screen. */
  const record = useCallback(
    (scans: Scan[], source: Source) => {
      let head: ScanEntry | null = null;
      for (let i = scans.length - 1; i >= 0; i--) head = add(scans[i], source);
      if (!head) return;
      setCurrent(head);
      setAlsoFound(scans.length - 1);
      setReads((n) => n + 1);
      setStatus({
        kind: "ok",
        text: scans.length > 1 ? `Read ${scans.length} codes` : "Read 1 code",
      });
    },
    [add],
  );

  const run = useCallback(
    async (source: Source, busyText: string, read: () => Promise<Scan[]>) => {
      if (working.current) return;
      working.current = true;
      setStatus({ kind: "busy", text: busyText });
      try {
        const scans = await read();
        if (!scans.length) {
          setStatus({ kind: "error", text: "No code found", detail: NOTHING_FOUND[source] });
          return;
        }
        record(scans, source);
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        setStatus(
          err instanceof NoInput
            ? { kind: "error", text: "Nothing to read", detail: cause }
            : { kind: "error", text: "Can't read", detail: `${CANNOT_READ[source]} (${cause})` },
        );
      } finally {
        working.current = false;
      }
    },
    [record],
  );

  const readFiles = useCallback(
    (files: File[]) =>
      run("file", files.length > 1 ? `Reading ${files.length} images` : "Reading image", () =>
        scanFiles(files),
      ),
    [run],
  );
  const readClipboard = useCallback(
    () => run("clipboard", "Reading clipboard", scanClipboard),
    [run],
  );
  const readScreens = useCallback(() => run("screen", "Reading screen", scanScreens), [run]);

  const onCameraRead = useCallback(
    (scans: Scan[]) => {
      setCameraOpen(false);
      record(scans, "camera");
    },
    [record],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.shiftKey || (IS_MAC ? !e.metaKey : !e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      const act: Record<string, () => void> = {
        o: () => picker.current?.click(),
        k: () => cameraReady && setCameraOpen(true),
        v: readClipboard,
        s: readScreens,
      };
      if (!act[key] || cameraOpen) return;
      e.preventDefault();
      act[key]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cameraOpen, cameraReady, readClipboard, readScreens]);

  return (
    <div
      className="app"
      onDragEnter={(e) => {
        e.preventDefault();
        if (++dragDepth.current === 1) setDropping(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        if (--dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDropping(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDropping(false);
        const files = Array.from(e.dataTransfer.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length) readFiles(files);
      }}
    >
      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) readFiles(files);
        }}
      />

      <header className="masthead">
        <h1 className="wordmark">Qwikodo</h1>
        <p className="promise">Nothing leaves this computer</p>
      </header>

      <div className={current ? "fingerprint" : "fingerprint is-blank"} aria-hidden="true">
        {bars.map((width, i) => (
          <span key={i} style={{ flexGrow: width }} data-ink={i % 2 === 0 ? "" : undefined} />
        ))}
      </div>

      <SourceGrid
        mod={MOD}
        busy={status.kind === "busy"}
        cameraReady={cameraReady}
        onFile={() => picker.current?.click()}
        onCamera={() => setCameraOpen(true)}
        onClipboard={readClipboard}
        onScreen={readScreens}
      />

      <div className="status" data-kind={status.kind} role="status">
        <span className="status-text">{status.text}</span>
        {status.detail && <span className="status-detail">{status.detail}</span>}
      </div>

      <main className="stage">
        {current ? (
          <ResultLabel key={reads} entry={current} alsoFound={alsoFound} />
        ) : (
          <div className="result is-empty">
            <span className="format">No read yet</span>
            <p className="prompt">
              Pick a source above, or drop an image anywhere on this window. It reads QR, Data
              Matrix, Aztec, PDF417 and every common barcode.
            </p>
          </div>
        )}
      </main>

      <HistoryList entries={entries} />

      {cameraOpen && (
        <CameraModal onRead={onCameraRead} onClose={() => setCameraOpen(false)} />
      )}
      {dropping && <div className="drop-veil">Drop to read</div>}
    </div>
  );
}
