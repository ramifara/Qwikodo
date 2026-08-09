import { CameraMark, ClipboardMark, FileMark, ScreenMark } from "./Icons";

interface Props {
  mod: string;
  busy: boolean;
  cameraReady: boolean;
  onFile: () => void;
  onCamera: () => void;
  onClipboard: () => void;
  onScreen: () => void;
}

export function SourceGrid({
  mod,
  busy,
  cameraReady,
  onFile,
  onCamera,
  onClipboard,
  onScreen,
}: Props) {
  return (
    <div className="sources">
      <button className="source" disabled={busy} onClick={onFile}>
        <FileMark />
        <span className="source-name">File</span>
        <kbd>{mod}O</kbd>
      </button>

      <button
        className="source"
        disabled={busy || !cameraReady}
        onClick={onCamera}
        title={cameraReady ? undefined : "This system exposes no camera to the app."}
      >
        <CameraMark />
        <span className="source-name">Camera</span>
        <kbd>{mod}K</kbd>
      </button>

      <button className="source" disabled={busy} onClick={onClipboard}>
        <ClipboardMark />
        <span className="source-name">Clipboard</span>
        <kbd>{mod}V</kbd>
      </button>

      <button className="source" disabled={busy} onClick={onScreen}>
        <ScreenMark />
        <span className="source-name">Screen</span>
        <kbd>{mod}S</kbd>
      </button>
    </div>
  );
}
