# Qwikodo architecture

Qwikodo keeps acquisition platform-specific and decoding platform-independent. Every source ends
as pixels in the same local ZXing-C++ WebAssembly reader.

## Data flow

| Source | Acquisition boundary | Data handed to the decoder |
| --- | --- | --- |
| File | Browser file input or drag and drop | The selected image `Blob` |
| Camera | `getUserMedia`, video element, off-screen canvas | An `ImageData` frame about ten times per second |
| Clipboard | `arboard` in the Rust process | PNG bytes over Tauri binary IPC |
| Screen | `xcap` in the Rust process | One PNG per monitor over Tauri binary IPC |

`src/lib/sources.ts` normalizes the four paths into `Scan[]`. `src/App.tsx` records a successful
batch through `src/store/history.ts`, shows the first result, and keeps any additional codes in
history.

## Frontend boundary

`src/lib/decode.ts` configures zxing-wasm before the first decode. Vite imports
`zxing_reader.wasm` as a local asset and the Emscripten `locateFile` hook points directly to it.
Still images use rotation, inversion, downscaling, denoising, and `tryHarder`; live frames use a
lighter option set to keep camera scanning responsive.

The decoder caps a still image at 16 symbols and a camera frame at 4. Duplicate text within one
image is removed before state updates. The history store then suppresses an immediate repeat of the
same payload and retains at most 500 entries.

The frontend does not parse a payload into executable markup. React renders its contents as text.
Payload recognition only adds a descriptive badge or makes the explicit **Open link** control
available.

## Native boundary

`src-tauri/src/lib.rs` exposes three commands:

- `read_clipboard_image` converts clipboard RGBA pixels to PNG.
- `capture_screens` hides Qwikodo, waits for the compositor, captures each monitor, restores the
  window, and stores the PNGs in memory.
- `take_capture` drains one pending screen PNG into a binary IPC response.

Screen captures are held only long enough for the frontend to request them. They are not written to
disk. Clipboard pixels and captures use fast PNG compression because latency matters more than
temporary buffer size.

## Permissions and network boundary

The Tauri capability grants core defaults plus a URL opener restricted to `http`, `https`,
`mailto`, and `tel`. There is no filesystem, shell, process, or HTTP plugin. The content-security
policy permits the local WASM runtime, bundled fonts, in-memory image/media URLs, and Tauri IPC.

Network access is not required at runtime. The only network-adjacent behavior is passing a link to
the operating system after an explicit user action; Qwikodo does not fetch that link itself.

## Persistence

zustand's persist middleware writes a single `qwikodo-history` value to the webview's local storage.
Each entry contains the decoded text, format, source, timestamp, and random ID. Qwikodo has no other
application database, sync layer, export, or background service.

## Release surface

The application version appears in `package.json`, `src-tauri/Cargo.toml`, and
`src-tauri/tauri.conf.json`; all three must stay aligned. Native bundles are built on their target
operating systems in GitHub Actions. Code signing and macOS notarization are deliberately separate
from compilation so pull requests never need release credentials.
