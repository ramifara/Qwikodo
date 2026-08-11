import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CameraModal } from "./components/CameraModal";
import { GenerateModal } from "./components/GenerateModal";
import { HistoryList } from "./components/HistoryList";
import { GenerateMark, SettingsMark } from "./components/Icons";
import { ResultLabel } from "./components/ResultLabel";
import { SettingsPanel } from "./components/SettingsPanel";
import { SourceGrid } from "./components/SourceGrid";
import { writeClipboardText } from "./lib/clipboard";
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

/** What the tray, a global hotkey, a CLI flag, or a `qwikodo://` deep link
 *  asked the app to do. Mirrors the `Action` enum on the Rust side. */
type BackendAction =
  | { kind: "ScanScreen" }
  | { kind: "ScanClipboard" }
  | { kind: "Show" }
  | { kind: "Generate"; text: string | null };

async function showAndFocus() {
  const window = getCurrentWindow();
  await window.show();
  await window.setFocus();
}

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
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateSeed, setGenerateSeed] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dropping, setDropping] = useState(false);

  const picker = useRef<HTMLInputElement>(null);
  const working = useRef(false);
  const dragDepth = useRef(0);
  const cameraReady = useMemo(cameraAvailable, []);
  const bars = useMemo(() => fingerprint(current?.content ?? ""), [current?.content]);

  useEffect(() => {
    warmDecoder().catch(() => undefined);
  }, []);

  /** Records a batch of scans, newest first, puts the first one on screen,
   *  and returns it — so a background-triggered scan can act on it. */
  const record = useCallback(
    (scans: Scan[], source: Source) => {
      let head: ScanEntry | null = null;
      for (let i = scans.length - 1; i >= 0; i--) head = add(scans[i], source);
      if (!head) return null;
      setCurrent(head);
      setAlsoFound(scans.length - 1);
      setReads((n) => n + 1);
      setStatus({
        kind: "ok",
        text: scans.length > 1 ? `Read ${scans.length} codes` : "Read 1 code",
      });
      return head;
    },
    [add],
  );

  /** `background` marks a scan triggered from outside the window (tray,
   *  hotkey, CLI, deep link): the window wasn't necessarily visible, so the
   *  result needs to pop the window and land on the clipboard on its own. */
  const run = useCallback(
    async (source: Source, busyText: string, read: () => Promise<Scan[]>, background = false) => {
      if (working.current) return;
      working.current = true;
      setStatus({ kind: "busy", text: busyText });
      try {
        const scans = await read();
        if (background) await showAndFocus();
        if (!scans.length) {
          setStatus({ kind: "error", text: "No code found", detail: NOTHING_FOUND[source] });
          return;
        }
        const head = record(scans, source);
        if (background && head) writeClipboardText(head.content).catch(() => undefined);
      } catch (err) {
        if (background) await showAndFocus();
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
    (background = false) => run("clipboard", "Reading clipboard", scanClipboard, background),
    [run],
  );
  const readScreens = useCallback(
    (background = false) => run("screen", "Reading screen", scanScreens, background),
    [run],
  );

  const onCameraRead = useCallback(
    (scans: Scan[]) => {
      setCameraOpen(false);
      record(scans, "camera");
    },
    [record],
  );

  const openGenerate = useCallback((text: string) => {
    setGenerateSeed(text);
    setGenerateOpen(true);
  }, []);

  const handleAction = useCallback(
    async (action: BackendAction) => {
      switch (action.kind) {
        case "Show":
          await showAndFocus();
          break;
        case "ScanScreen":
          await readScreens(true);
          break;
        case "ScanClipboard":
          await readClipboard(true);
          break;
        case "Generate":
          await showAndFocus();
          openGenerate(action.text ?? "");
          break;
      }
    },
    [readScreens, readClipboard, openGenerate],
  );

  useEffect(() => {
    invoke<BackendAction | null>("take_startup_action").then((action) => {
      if (action) void handleAction(action);
    });
    const unlisten = listen<BackendAction>("qwikodo://action", (e) => void handleAction(e.payload));
    return () => {
      unlisten.then((f) => f());
    };
  }, [handleAction]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.shiftKey || (IS_MAC ? !e.metaKey : !e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      const act: Record<string, () => void> = {
        o: () => picker.current?.click(),
        k: () => cameraReady && setCameraOpen(true),
        v: readClipboard,
        s: readScreens,
        g: () => openGenerate(""),
      };
      if (!act[key] || cameraOpen || generateOpen || settingsOpen) return;
      e.preventDefault();
      act[key]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cameraOpen, generateOpen, settingsOpen, cameraReady, readClipboard, readScreens, openGenerate]);

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
        <div className="brand">
          <h1 className="wordmark">Qwikodo</h1>
          <p className="promise">Nothing leaves this computer</p>
        </div>
        <div className="mast-actions">
          <button className="mast-action" onClick={() => openGenerate("")}>
            <GenerateMark />
            <span>Generate</span>
            <kbd>{MOD}G</kbd>
          </button>
          <button
            className="mast-action is-icon"
            aria-label="Settings"
            title="Settings"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsMark />
          </button>
        </div>
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
        onClipboard={() => readClipboard()}
        onScreen={() => readScreens()}
      />

      <div className="status" data-kind={status.kind} role="status">
        <span className="status-text">{status.text}</span>
        {status.detail && <span className="status-detail">{status.detail}</span>}
      </div>

      <main className="stage">
        {current ? (
          <ResultLabel key={reads} entry={current} alsoFound={alsoFound} onGenerate={openGenerate} />
        ) : (
          <div className="result is-empty">
            <span className="format">No read yet</span>
            <p className="prompt">
              Pick a source above, or drop an image anywhere on this window, or press {MOD}G to
              make one. It reads QR, Data Matrix, Aztec, PDF417 and every common barcode.
            </p>
          </div>
        )}
      </main>

      <HistoryList entries={entries} onGenerate={openGenerate} />

      {cameraOpen && (
        <CameraModal onRead={onCameraRead} onClose={() => setCameraOpen(false)} />
      )}
      {generateOpen && (
        <GenerateModal seed={generateSeed} onClose={() => setGenerateOpen(false)} />
      )}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {dropping && <div className="drop-veil">Drop to read</div>}
    </div>
  );
}
