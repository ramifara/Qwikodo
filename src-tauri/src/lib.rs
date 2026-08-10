use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{EncodableLayout, ExtendedColorType, GenericImageView, ImageEncoder};
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, State, Window};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_deep_link::DeepLinkExt as _;
use tauri_plugin_dialog::DialogExt as _;
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt as _, Modifiers, Shortcut, ShortcutState,
};

/// Holds PNG buffers between `capture_screens` and the `take_capture` reads that
/// drain them. Screens can be tens of megabytes; keeping them here lets the
/// frontend pull each one as raw binary instead of JSON-encoded numbers.
#[derive(Default)]
struct CaptureBuf(Mutex<Vec<Vec<u8>>>);

/// Set once the tray icon is successfully created. Close-to-tray only makes
/// sense when there's a tray to return to (stock GNOME, for instance, has
/// none), so window close falls back to quitting outright when this is false.
#[derive(Default)]
struct HasTray(AtomicBool);

/// Something the tray, a global hotkey, a CLI flag, or a `qwikodo://` deep
/// link asked the app to do. All four funnel through `dispatch` below.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(tag = "kind", content = "text")]
enum Action {
    ScanScreen,
    ScanClipboard,
    Show,
    Generate(Option<String>),
}

/// Buffers the most recent action for a frontend that isn't listening yet,
/// e.g. a cold start triggered by a CLI flag or deep link. Drained once by
/// `take_startup_action` right after the window mounts.
#[derive(Default)]
struct PendingAction(Mutex<Option<Action>>);

/// Broadcasts `action` to any listening webview and buffers it for a
/// frontend that hasn't mounted yet.
fn dispatch<R: tauri::Runtime>(app: &tauri::AppHandle<R>, action: Action) {
    let _ = app.emit("qwikodo://action", action.clone());
    *app.state::<PendingAction>().0.lock().unwrap() = Some(action);
}

fn encode_png(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    // Fast compression: these buffers are decoded immediately and thrown away,
    // so encode time matters far more than file size.
    PngEncoder::new_with_quality(
        Cursor::new(&mut out),
        CompressionType::Fast,
        FilterType::NoFilter,
    )
    .write_image(rgba, width, height, ExtendedColorType::Rgba8)
    .map_err(|e| e.to_string())?;
    Ok(out)
}

fn capture_all_screens() -> Result<Vec<Vec<u8>>, String> {
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let mut shots = Vec::with_capacity(monitors.len());
    for monitor in monitors {
        let img = monitor.capture_image().map_err(|e| e.to_string())?;
        shots.push(encode_png(img.width(), img.height(), img.as_raw())?);
    }
    Ok(shots)
}

/// Captures every monitor and returns how many images are waiting.
/// The window hides itself first so the app never scans its own UI.
#[tauri::command]
async fn capture_screens(window: Window, buf: State<'_, CaptureBuf>) -> Result<usize, String> {
    let was_visible = window.is_visible().unwrap_or(true);
    if was_visible {
        let _ = window.hide();
        // Give the compositor time to actually clear the window off screen.
        std::thread::sleep(std::time::Duration::from_millis(280));
    }

    let result = capture_all_screens();

    if was_visible {
        let _ = window.show();
        let _ = window.set_focus();
    }

    let shots = result?;
    let count = shots.len();
    *buf.0.lock().map_err(|e| e.to_string())? = shots;
    Ok(count)
}

/// Drains one pending capture as raw PNG bytes.
#[tauri::command]
fn take_capture(index: usize, buf: State<'_, CaptureBuf>) -> Result<tauri::ipc::Response, String> {
    let mut shots = buf.0.lock().map_err(|e| e.to_string())?;
    let bytes = shots
        .get_mut(index)
        .map(std::mem::take)
        .ok_or_else(|| format!("no capture at index {index}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Reads an image off the system clipboard as PNG bytes.
/// An empty response means the clipboard holds no image.
#[tauri::command]
async fn read_clipboard_image() -> Result<tauri::ipc::Response, String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    match clipboard.get_image() {
        Ok(img) => {
            let png = encode_png(img.width as u32, img.height as u32, &img.bytes)?;
            Ok(tauri::ipc::Response::new(png))
        }
        Err(arboard::Error::ContentNotAvailable) => Ok(tauri::ipc::Response::new(Vec::new())),
        Err(e) => Err(e.to_string()),
    }
}

/// Puts text on the system clipboard. Used after a background-triggered scan,
/// where the webview's own clipboard API is unreliable while unfocused.
#[tauri::command]
fn write_clipboard_text(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

/// Puts a generated code's PNG bytes on the system clipboard as an image.
#[tauri::command]
fn write_clipboard_image(bytes: Vec<u8>) -> Result<(), String> {
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    let (width, height) = img.dimensions();
    let rgba = img.to_rgba8();
    let mut clipboard = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    clipboard
        .set_image(arboard::ImageData {
            width: width as usize,
            height: height as usize,
            bytes: std::borrow::Cow::Borrowed(rgba.as_bytes()),
        })
        .map_err(|e| e.to_string())
}

/// Shows a native save dialog and writes a generated code's PNG bytes to disk.
/// Returns `false` if the user closed the dialog without picking a location.
#[tauri::command]
async fn save_png(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<bool, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("PNG image", &["png"])
        .set_file_name("qwikodo-code.png")
        .blocking_save_file();
    let Some(path) = path else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(path, bytes).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Drains the action buffered for this cold start, if any. Called once by
/// the frontend right after it mounts.
#[tauri::command]
fn take_startup_action(pending: State<'_, PendingAction>) -> Option<Action> {
    pending.0.lock().unwrap().take()
}

/// Reads `--scan-screen`, `--scan-clipboard`, and `--generate [text]` out of
/// CLI args. Deliberately hand-rolled instead of pulling in `tauri-plugin-cli`
/// (and the clap dependency tree it drags along) for three flags.
fn action_for_cli(args: &[String]) -> Option<Action> {
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        match arg.as_str() {
            "--scan-screen" => return Some(Action::ScanScreen),
            "--scan-clipboard" => return Some(Action::ScanClipboard),
            "--generate" => {
                let text = iter.next().filter(|a| !a.starts_with("--")).cloned();
                return Some(Action::Generate(text));
            }
            _ => {}
        }
    }
    None
}

/// Maps a `qwikodo://<host>?<query>` deep link to an action.
fn action_for_deep_link(
    host: &str,
    mut query: impl Iterator<Item = (String, String)>,
) -> Option<Action> {
    match host {
        "scan-screen" => Some(Action::ScanScreen),
        "scan-clipboard" => Some(Action::ScanClipboard),
        "show" => Some(Action::Show),
        "generate" => Some(Action::Generate(
            query.find(|(k, _)| k == "text").map(|(_, v)| v),
        )),
        _ => None,
    }
}

/// Builds the tray icon and its menu. Returns `Err` if the platform has no
/// tray to build onto (e.g. a stock GNOME session without an extension).
fn build_tray<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let scan_screen = MenuItemBuilder::with_id("scan-screen", "Scan screen").build(app)?;
    let scan_clipboard = MenuItemBuilder::with_id("scan-clipboard", "Scan clipboard").build(app)?;
    let show = MenuItemBuilder::with_id("show", "Show Qwikodo").build(app)?;
    let autostart_item = CheckMenuItemBuilder::with_id("autostart", "Start at login")
        .checked(app.autolaunch().is_enabled().unwrap_or(false))
        .build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[&scan_screen, &scan_clipboard, &show])
        .separator()
        .item(&autostart_item)
        .separator()
        .item(&quit)
        .build()?;

    let toggle_target = autostart_item.clone();
    let mut tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "scan-screen" => dispatch(app, Action::ScanScreen),
            "scan-clipboard" => dispatch(app, Action::ScanClipboard),
            "show" => dispatch(app, Action::Show),
            "autostart" => {
                let mgr = app.autolaunch();
                let enabled = mgr.is_enabled().unwrap_or(false);
                let toggled = if enabled { mgr.disable() } else { mgr.enable() };
                if toggled.is_ok() {
                    let _ = toggle_target.set_checked(!enabled);
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                dispatch(tray.app_handle(), Action::Show);
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
}

/// Handles a batch of deep-link URLs, dispatching whichever ones map to a
/// known action.
fn handle_deep_links<R: tauri::Runtime>(app: &tauri::AppHandle<R>, urls: Vec<url::Url>) {
    for url in urls {
        let query: Vec<(String, String)> = url
            .query_pairs()
            .map(|(k, v)| (k.into_owned(), v.into_owned()))
            .collect();
        if let Some(action) = action_for_deep_link(url.host_str().unwrap_or(""), query.into_iter())
        {
            dispatch(app, action);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let args: Vec<String> = argv.into_iter().skip(1).collect();
            if let Some(action) = action_for_cli(&args) {
                dispatch(app, action);
            } else if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--hidden"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            app.manage(CaptureBuf::default());
            app.manage(PendingAction::default());
            app.manage(HasTray::default());

            let has_tray = build_tray(app.handle()).is_ok();
            if !has_tray {
                eprintln!("qwikodo: no tray available on this desktop; close will quit");
            }
            app.state::<HasTray>().0.store(has_tray, Ordering::Relaxed);

            let deep_link_handle = app.handle().clone();
            app.deep_link()
                .on_open_url(move |event| handle_deep_links(&deep_link_handle, event.urls()));
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                handle_deep_links(app.handle(), urls);
            }

            let gs = app.global_shortcut();
            for (mods, code, action) in [
                (
                    Modifiers::ALT | Modifiers::SHIFT,
                    Code::KeyS,
                    Action::ScanScreen,
                ),
                (
                    Modifiers::ALT | Modifiers::SHIFT,
                    Code::KeyV,
                    Action::ScanClipboard,
                ),
            ] {
                let shortcut = Shortcut::new(Some(mods), code);
                let registered = gs.on_shortcut(shortcut, move |app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        dispatch(app, action.clone());
                    }
                });
                if let Err(e) = registered {
                    eprintln!("qwikodo: couldn't register global shortcut: {e}");
                }
            }

            let args: Vec<String> = std::env::args().skip(1).collect();
            let hidden = args.iter().any(|a| a == "--hidden");
            if let Some(action) = action_for_cli(&args) {
                dispatch(app.handle(), action);
            } else if !hidden {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window
                    .app_handle()
                    .state::<HasTray>()
                    .0
                    .load(Ordering::Relaxed)
                {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            capture_screens,
            take_capture,
            read_clipboard_image,
            write_clipboard_text,
            write_clipboard_image,
            save_png,
            take_startup_action,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, _event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = _event {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        #[cfg(not(target_os = "macos"))]
        let _ = app_handle;
    });
}
