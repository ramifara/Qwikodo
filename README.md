# Qwikodo

Qwikodo is a small desktop app for reading QR codes and barcodes from a file, camera, clipboard,
or screen. It exists because a scanner should not need ads, an account, broad filesystem access,
or a pile of unrelated features.

Everything is decoded on your computer. There is no telemetry, sync, updater, advertising SDK,
or network client. Scan history stays in the app's local storage. The only outbound action is the
explicit **Open link** button, which hands an `http`, `https`, `mailto`, or `tel` link to your
default application.

<p align="center">
  <img src="docs/screenshots/idle.png" alt="Qwikodo idle state, ready to scan" width="270">
  <img src="docs/screenshots/result.png" alt="Qwikodo showing a decoded QR code and history" width="270">
  <img src="docs/screenshots/generate.png" alt="Qwikodo generating a QR code from text" width="270">
</p>

## What it reads

Qwikodo uses ZXing-C++ through a locally bundled WebAssembly module. Supported formats include:

- QR Code, Micro QR, rMQR, Data Matrix, Aztec, PDF417, MicroPDF417, and MaxiCode
- EAN-13, EAN-8, UPC-A, UPC-E, Code 39, Code 93, Code 128, Codabar, and ITF
- DataBar Omni, Limited, and Expanded, plus DX Film Edge and Telepen

Images can contain more than one code. Qwikodo shows the first result and saves the rest to
history.

## Scan sources and permissions

| Source | Shortcut | Access used |
| --- | --- | --- |
| File | <kbd>⌘/Ctrl</kbd> + <kbd>O</kbd> | The images selected in the native picker; drag and drop also works |
| Camera | <kbd>⌘/Ctrl</kbd> + <kbd>K</kbd> | Camera access while the scanner is open |
| Clipboard | <kbd>⌘/Ctrl</kbd> + <kbd>V</kbd> | The current clipboard image only |
| Screen | <kbd>⌘/Ctrl</kbd> + <kbd>S</kbd> | A one-time capture of each connected monitor |

- **macOS:** asks for camera access on first use and Screen Recording access when needed. If a
  screen scan is blank, enable Qwikodo in **System Settings → Privacy & Security → Screen
  Recording**.
- **Windows:** uses the system WebView2 camera support and Windows capture APIs.
- **Linux:** camera availability depends on WebKitGTK and the desktop setup. Screen capture support
  also varies between X11 and Wayland compositors. File and clipboard scanning remain available.

Qwikodo has no general filesystem, shell, or HTTP permission. Its Tauri capability allows only the
core window APIs and opening user-selected links with the four schemes listed above.

## Generate a code

Use the **Generate** button in the app header, press <kbd>⌘/Ctrl</kbd> + <kbd>G</kbd>, or use the
**As QR** button on any result or history entry to turn text back into a QR code. Copy it as an
image or save it as a PNG — nothing is written to history, since a generated code is an output,
not a read.

## Quick access

Qwikodo stays out of the way until you need it, then answers instantly:

- **Tray icon** — by default, closing the window leaves Qwikodo running quietly in the tray/menu
  bar. The tray menu can scan the screen or clipboard directly, show the window, toggle **Start at
  login**, or quit. Turn off **Keep running after close** in Settings to remove the tray icon and
  make Close quit the app completely. (On a Linux desktop with no tray support, closing the window
  quits the app instead.)
- **Global hotkey** — <kbd>Alt/Option</kbd> + <kbd>Shift</kbd> + <kbd>S</kbd> scans the screen, and
  <kbd>Alt/Option</kbd> + <kbd>Shift</kbd> + <kbd>V</kbd> scans the clipboard, from anywhere, even
  while Qwikodo is hidden. The window pops up with the result and the payload lands on your
  clipboard automatically. (Global shortcuts can't register under Wayland — see the launcher recipe
  below for a native alternative.)
- **CLI flags** — `qwikodo --scan-screen`, `qwikodo --scan-clipboard`, or `qwikodo --generate
  "text"` trigger an action whether or not Qwikodo is already running; a second launch hands its
  arguments to the running instance instead of opening a duplicate window.
- **Deep links** — `qwikodo://scan-screen`, `qwikodo://scan-clipboard`, `qwikodo://show`, and
  `qwikodo://generate?text=...` do the same from any tool that can open a URL.

The small Settings panel also lets you disable the global scan shortcuts or launch-at-login. These
preferences apply immediately and are the complete configuration surface; scan and generation
behavior remain deliberately fixed and fast.

### Launcher recipes

Bind a short alias in your launcher of choice so a scan is a keystroke away:

- **Windows (PowerToys Run / Win+R):** make a shortcut named `qs.lnk` with target
  `Qwikodo.exe --scan-screen` in a folder on your `PATH`, then type `qs` in Run or PowerToys Run.
- **macOS (Spotlight / Raycast):** create a Shortcuts.app "Open URL" action pointed at
  `qwikodo://scan-screen`, name it `qs`, and it's searchable from Spotlight; in Raycast, add a
  Quicklink for the same URL.
- **Linux (KRunner / GNOME search):** Qwikodo's installed `.desktop` file exposes *Scan screen* and
  *Scan clipboard* as desktop actions, which most application launchers surface directly. Under
  Wayland, where the global hotkey plugin can't register, bind your compositor's own shortcut
  setting to run `qwikodo --scan-screen` instead.

## Install and run from source

Prerequisites:

- Node.js 20.19 or newer and npm
- The stable Rust toolchain with `rustfmt` and `clippy`
- [Tauri's platform prerequisites](https://v2.tauri.app/start/prerequisites/)
- On Linux, the [additional xcap development libraries](https://github.com/nashaofu/xcap#linux-system-requirements)

```sh
npm ci
npm run tauri dev
```

Create a release bundle for the current platform with:

```sh
npm run tauri build
```

The source application artwork lives in `assets/macOS/AppIcon.iconset`. After updating its 1024px
master image, regenerate the native Linux, macOS, and Windows icons with `npm run icons`.

Unsigned builds are appropriate for development and CI verification. Public macOS and Windows
downloads should be code-signed; macOS downloads distributed outside the App Store should also be
notarized.

## Checks

```sh
npm run build          # TypeScript check + production web bundle
npm test               # Generate and round-trip all 22 barcode fixtures offline
npm run check:versions # Ensure npm, Cargo, and Tauri versions match
npm run check:rust     # rustfmt + clippy with warnings denied
```

The fixture check loads both ZXing WASM binaries directly from `node_modules`; a CDN outage cannot
turn it into a false pass. GitHub Actions repeats these checks and compiles native bundles on Linux,
Windows, Intel macOS, and Apple Silicon macOS.

Every pull request receives installable workflow artifacts for those four targets. Pushing a tag
matching the app version (for example, `v0.1.0`) creates a draft GitHub Release with the same
artifacts and generated release notes. macOS CI artifacts use an ad-hoc signature; Windows CI
artifacts are unsigned. Review and replace them with properly signed builds before publishing to a
general audience.

## Technical overview

Qwikodo is a Tauri 2 shell around a React interface:

- `src/lib/decode.ts` is the single decoding boundary. The ZXing reader WASM is part of the Vite
  bundle and never fetched from a CDN.
- Browser-native file input and `getUserMedia` cover files and camera frames without extra Tauri
  permissions.
- Two small Rust commands use `arboard` for clipboard images and `xcap` for monitor captures. PNG
  bytes cross Tauri's binary IPC channel rather than being expanded into JSON arrays.
- zustand persists at most 500 history entries in one local-storage key. Repeated reads within three
  seconds are deduplicated.
- Decoded payloads are rendered as text. They are never executed or opened automatically.

See [Architecture](docs/ARCHITECTURE.md) for the full data flow and security boundary.

## Contributing and security

Contributions that keep Qwikodo focused, private, and lightweight are welcome. Read
[CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report vulnerabilities as
described in [SECURITY.md](SECURITY.md), not in a public issue.

Qwikodo is available under the [MIT License](LICENSE).
