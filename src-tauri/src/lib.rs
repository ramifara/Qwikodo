use std::io::Cursor;
use std::sync::Mutex;

use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{ExtendedColorType, ImageEncoder};
use tauri::{Manager, State, Window};

/// Holds PNG buffers between `capture_screens` and the `take_capture` reads that
/// drain them. Screens can be tens of megabytes; keeping them here lets the
/// frontend pull each one as raw binary instead of JSON-encoded numbers.
#[derive(Default)]
struct CaptureBuf(Mutex<Vec<Vec<u8>>>);

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

    let result = (|| -> Result<Vec<Vec<u8>>, String> {
        let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
        let mut shots = Vec::with_capacity(monitors.len());
        for monitor in monitors {
            let img = monitor.capture_image().map_err(|e| e.to_string())?;
            shots.push(encode_png(img.width(), img.height(), img.as_raw())?);
        }
        Ok(shots)
    })();

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(CaptureBuf::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture_screens,
            take_capture,
            read_clipboard_image
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
