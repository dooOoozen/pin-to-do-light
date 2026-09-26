use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicI64, AtomicIsize, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};


mod net;
mod secrets;
mod shell;
mod win32;

const DATA_FILE: &str = "dashboard1971-data.json";
/// The folder the Electron build keeps its data in, taken over on first run so the
/// port starts with the tasks that already exist rather than a sample deck.
const LEGACY_DIR: &str = "DASHBOARD 1971";
const LAYER: &str = "main";
const PANEL: &str = "dashboard";
const LAYER_TITLE: &str = "Pin To-Do 卡片层";
const PANEL_TITLE: &str = "Pin To-Do 任务面板";

/* ------------------------------------------------------------------ storage
   The renderer owns the state reducer (shared/data.js moved over untouched), so the
   boundary carries JSON strings rather than a Rust mirror of the schema. */

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn data_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(DATA_FILE))
}

#[tauri::command]
fn state_load(app: AppHandle) -> Result<Option<String>, String> {
    let path = data_path(&app)?;
    if path.exists() {
        return std::fs::read_to_string(path).map(Some).map_err(|e| e.to_string());
    }
    // one-time takeover of the Electron build's data file
    if let Some(parent) = path.parent().and_then(|p| p.parent()) {
        let legacy = parent.join(LEGACY_DIR).join(DATA_FILE);
        if legacy.exists() {
            if let Ok(text) = std::fs::read_to_string(&legacy) {
                let _ = std::fs::write(&path, text.as_bytes());
                return Ok(Some(text));
            }
        }
    }
    Ok(None)
}

#[tauri::command]
fn state_save(app: AppHandle, json: String) -> Result<(), String> {
    let path = data_path(&app)?;
    let tmp = path.with_file_name(format!("{}.tmp", DATA_FILE));
    std::fs::write(&tmp, json.as_bytes()).map_err(|e| e.to_string())?;
    // rename, not overwrite: never leave a half-written data file behind
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn state_commit(app: AppHandle, json: String) -> Result<(), String> {
    state_save(app.clone(), json.clone())?;
    let _ = app.emit("state", json);
    Ok(())
}

/* ------------------------------------------------------------------ geometry */

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Rect {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn work_area_rect<R: Runtime>(app: &AppHandle<R>) -> Result<(Rect, f64), String> {
    let monitor = pick_monitor(app)?;
    let scale = monitor.scale_factor();
    let wa = monitor.work_area();
    Ok((
        Rect {
            x: (f64::from(wa.position.x) / scale).round() as i32,
            y: (f64::from(wa.position.y) / scale).round() as i32,
            width: (f64::from(wa.size.width) / scale).round() as u32,
            height: (f64::from(wa.size.height) / scale).round() as u32,
        },
        scale,
    ))
}


/// Which display the deck lives on, 0-based; -1 means "the primary, as always".
///
/// The renderer owns this as a setting and pushes it down on every state sync, because the
/// host has no reason to know about preferences. It is a process-global rather than a
/// re-read of the data file because `pick_monitor` runs on the window-manager path, where
/// touching the disk is not an option.
static DECK_MONITOR: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(-1);

fn monitor_index() -> Option<usize> {
    /* The command line seeds this once, at startup, and never outranks it again — see the
       store in `setup`. While the flag was consulted on every read, a deck launched with
       `--monitor 2` ignored 切换屏幕 for the rest of the session: the write landed in
       DECK_MONITOR and the next read went straight back to the command line, which is what
       "第二屏卡片可以正常放到上面了，但是切换不了第一屏" was. */
    let chosen = DECK_MONITOR.load(Ordering::Relaxed);
    if chosen >= 0 {
        Some(chosen as usize + 1)
    } else {
        None
    }
}

/// Every display the shell knows about, in logical coordinates, so the settings panel can
/// offer a choice rather than guess how many screens there are.
#[tauri::command]
fn monitors(app: AppHandle) -> Result<serde_json::Value, String> {
    let list = app.available_monitors().map_err(|e| e.to_string())?;
    let primary = app.primary_monitor().map_err(|e| e.to_string())?;
    let out: Vec<serde_json::Value> = list
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let wa = m.work_area();
            let is_primary = primary
                .as_ref()
                .map(|p| p.name() == m.name())
                .unwrap_or(i == 0);
            serde_json::json!({
                "index": i,
                "name": m.name().cloned().unwrap_or_default(),
                "x": wa.position.x,
                "y": wa.position.y,
                "width": wa.size.width,
                "height": wa.size.height,
                "scale": m.scale_factor(),
                "primary": is_primary,
            })
        })
        .collect();
    Ok(serde_json::json!({ "monitors": out }))
}

/// Move the deck to another display. No-ops when nothing changed, so the renderer can call
/// this on every state sync without bouncing the window around.
#[tauri::command]
fn set_deck_monitor(app: AppHandle, index: isize) -> Result<serde_json::Value, String> {
    let count = app.available_monitors().map_err(|e| e.to_string())?.len() as isize;
    let want = if index >= count { -1 } else { index };
    let prev = DECK_MONITOR.swap(want, Ordering::Relaxed);
    let (rect, _) = work_area_rect(&app)?;
    if let Some(win) = app.get_webview_window(LAYER) {
        let _ = win.set_position(tauri::LogicalPosition::new(f64::from(rect.x), f64::from(rect.y)));
        let _ = win.set_size(tauri::LogicalSize::new(
            f64::from(rect.width),
            f64::from(rect.height),
        ));
        refresh_layer_cache(&app);
    }
    Ok(serde_json::json!({
        "changed": prev != want,
        "index": want,
        "count": count,
        "rect": { "x": rect.x, "y": rect.y, "width": rect.width, "height": rect.height },
    }))
}

fn pick_monitor<R: Runtime>(app: &AppHandle<R>) -> Result<tauri::Monitor, String> {
    match monitor_index() {
        None => app
            .primary_monitor()
            .map_err(|e| e.to_string())?
            .ok_or("no primary monitor".into()),
        Some(n) => {
            let monitors = app.available_monitors().map_err(|e| e.to_string())?;
            let count = monitors.len();
            monitors
                .into_iter()
                .nth(n - 1)
                .ok_or_else(|| format!("no monitor #{n} of {count}"))
        }
    }
}

#[tauri::command]
fn work_area(app: AppHandle) -> Result<Rect, String> {
    work_area_rect(&app).map(|r| r.0)
}

/* ------------------------------------------------------------------ layer window */

static CURSOR_ON: AtomicBool = AtomicBool::new(false);
static LAYER_X: AtomicI32 = AtomicI32::new(0);
static LAYER_Y: AtomicI32 = AtomicI32::new(0);
static LAYER_W: AtomicI32 = AtomicI32::new(0);
static LAYER_H: AtomicI32 = AtomicI32::new(0);
/// physical pixels per CSS pixel, times 1000 so it fits in an atomic integer
static SCALE_X1000: AtomicI32 = AtomicI32::new(1000);
static FORCE_SHOW_UNTIL: AtomicI64 = AtomicI64::new(0);
/// The layer's HWND, so a background thread can keep an eye on its styles without
/// asking Tauri for a window handle off the main thread.
static LAYER_HWND: AtomicIsize = AtomicIsize::new(0);

/// The layer's last observed style, extended style and non-client height, so a caption
/// incident can be reported as the transition that caused it instead of inferred from
/// whichever sample the log happened to catch. -1 means "no previous sample", which is not the
/// same statement as "0", and the difference is what makes the first line after boot readable.
static FRAME_LAST_STYLE: AtomicIsize = AtomicIsize::new(-1);
static FRAME_LAST_EX: AtomicIsize = AtomicIsize::new(-1);
static FRAME_LAST_NC: AtomicIsize = AtomicIsize::new(-1);
/// Whether the current "style bits clean, non-client height nonzero" episode has been said
/// out loud yet, so the 120 ms poll reports it once rather than eight times a second.
static FRAME_NC_NOTED: AtomicI32 = AtomicI32::new(0);
static FRAME_DIRTY: AtomicI32 = AtomicI32::new(0);
/// Region hit testing replaces the WS_EX_TRANSPARENT toggle entirely: the toggle is
/// what tauri#15947 reports as turning transparent areas black, and it cannot be
/// combined with a region anyway (MSDN: with WS_EX_TRANSPARENT the shape is ignored).
static SHAPE_MODE: AtomicBool = AtomicBool::new(true);
static SHAPE_WORKS: AtomicBool = AtomicBool::new(true);
static LAST_SHAPE_MODE: Mutex<String> = Mutex::new(String::new());
/// Where the user left the panel. An unpositioned window is cascaded by the OS,
/// which on a multi-monitor desktop drops it on the other screen — away from the
/// deck it was opened from — and moves it again on every single open.
static PANEL_GEO: Mutex<Option<(i32, i32, u32, u32)>> = Mutex::new(None);
/// The view an opener asked for, held until the freshly created panel asks for it.
static PANEL_VIEW: Mutex<String> = Mutex::new(String::new());

/// Where panic_note can land before an AppHandle exists, and what the panic hook
/// uses: with `panic = "abort"` a panic otherwise kills the app without a trace.
static LOG_PATH: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

fn panic_note(text: &str) {
    use std::io::Write;
    if let Some(path) = LOG_PATH.get() {
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(f, "PANIC {text}");
        }
    }
}

/// Why the cursor feed stopped is impossible to see from the page alone, and every
/// early-return in the loop is silent, so each one gets its own counter.
static FEED_EMITTED: AtomicI64 = AtomicI64::new(0);
static FEED_OFF: AtomicI64 = AtomicI64::new(0);
static FEED_POSFAIL: AtomicI64 = AtomicI64::new(0);
static FEED_UNCHANGED: AtomicI64 = AtomicI64::new(0);
static FEED_NOWIN: AtomicI64 = AtomicI64::new(0);
static FEED_EMITFAIL: AtomicI64 = AtomicI64::new(0);

fn refresh_layer_cache<R: Runtime>(app: &AppHandle<R>) {
    let Some(win) = app.get_webview_window(LAYER) else {
        return;
    };
    if let Ok(pos) = win.outer_position() {
        LAYER_X.store(pos.x, Ordering::Relaxed);
        LAYER_Y.store(pos.y, Ordering::Relaxed);
    }
    if let Ok(size) = win.outer_size() {
        LAYER_W.store(size.width as i32, Ordering::Relaxed);
        LAYER_H.store(size.height as i32, Ordering::Relaxed);
    }
    let scale = win.scale_factor().unwrap_or(1.0);
    SCALE_X1000.store((scale * 1000.0).round() as i32, Ordering::Relaxed);
}

/// The layer is NOT declared in tauri.conf.json: a `resizable: false` window pins its
/// min/max track size to the configured one, so a later set_size() to the work area is
/// silently clamped back. It has to be created at the right size in the first place.
fn build_layer(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(LAYER).is_some() {
        return Ok(());
    }
    let (wa, _) = work_area_rect(app)?;
    let win = WebviewWindowBuilder::new(app, LAYER, WebviewUrl::App("overlay.html".into()))
        .title(LAYER_TITLE)
        .inner_size(f64::from(wa.width), f64::from(wa.height))
        .position(f64::from(wa.x), f64::from(wa.y))
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .closable(false)
        .shadow(false)
        .visible(false)
        .focused(false)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = win.set_ignore_cursor_events(true);
    /* before the first frame is composed: the shell reads the ex-styles when the window
       is created, and a taskbar button appears the moment the layer is shown */
    if let Ok(h) = win.hwnd() {
        LAYER_HWND.store(h.0 as isize, Ordering::Relaxed);
        let (style, ex, cw, ch) = unsafe { win32::strip_frame(h.0 as win32::Hwnd) };
        /* the two HRESULTs, once: an attribute the OS refused to apply and one it
           applied have looked identical in every log so far */
        let dwm = unsafe { win32::forbid_nc_painting(h.0 as win32::Hwnd) };
        /* the refusal has to be in place before the first activation, and it is the message
           side of the same problem: the attributes tell the painter not to run, this answers
           the activation's repaint request without drawing */
        let guard = unsafe { win32::guard_nc_messages(h.0 as win32::Hwnd) };
        /* installed from here because setup runs on the thread that owns the window, and the
           hook is called back on the thread that installs it */
        let hooked = unsafe { win32::watch_layer_styles(h.0 as win32::Hwnd) };
        /* the frame is composed at creation with the toolkit's own style, before any of the
           watchers below can exist — so the settle ladder has to start here, not only when
           the layer is shown again later */
        spawn_frame_settle(app.clone(), "build");
        let _ = boot_note(
            app.clone(),
            format!(
                "[layer] style=0x{:08X} ex=0x{:08X} client={}x{} · hook={} · {} · {}",
                style, ex, cw, ch, hooked, dwm, guard
            ),
        );
    }
    refresh_layer_cache(app);
    Ok(())
}

/// Something in the toolkit puts WS_CAPTION / WS_EX_APPWINDOW back on the layer after it
/// is built — measured, not assumed: the strip logs 0x84000000 / 0x000800B8 at creation
/// and the live window reads 0x14C80000 / 0x00040118 again a few seconds later. Those bits
/// are what give a desktop widget a taskbar button and let DWM paint a native blue caption
/// the moment the window region is cleared, so they have to stay off. Idempotent, and it
/// logs only on the transition so the log also names when the styles got undone.
fn repair_layer_frame(app: &AppHandle) {
    let h = LAYER_HWND.load(Ordering::Relaxed);
    if h == 0 {
        return;
    }
    let hwnd = h as win32::Hwnd;
    let (style, ex) = unsafe {
        (
            win32::GetWindowLongW(hwnd, win32::GWL_STYLE),
            win32::GetWindowLongW(hwnd, win32::GWL_EXSTYLE),
        )
    };
    /* the hook's scoreboard on the same transition as everything else: `stripped=0` and no
       repairs means nothing happened this run, `stripped=7` and no repairs means the hook
       caught them before this poll could look. Those read identically without this number. */
    let (hooked, stripped) = win32::guard_status();
    let guard = format!("hook={} stripped={}", hooked, stripped);
    /* the measurement that does not depend on the style bits at all: window height minus
       client height is the caption's own size, so `nc=31` says a bar is being painted right
       now whatever `style` claims, and `nc=0` says the bar on the screen is not this window's
       non-client area. Read together with the transition log below, the two settle which of
       the three standing explanations is true — a write we miss, a write we make ourselves,
       or a bar that belongs to a window we have never looked at. */
    let nc = unsafe { win32::surface_of(hwnd) }.non_client();
    let prev_style = FRAME_LAST_STYLE.swap(style as isize, Ordering::SeqCst) as i32;
    let prev_ex = FRAME_LAST_EX.swap(ex as isize, Ordering::SeqCst) as i32;
    let prev_nc = FRAME_LAST_NC.swap(nc as isize, Ordering::SeqCst) as i32;
    if prev_style >= 0 && (style != prev_style || ex != prev_ex || nc != prev_nc) {
        let _ = boot_note(
            app.clone(),
            format!(
                "[layer] frame CHANGED style {:#010X}->{:#010X} ex {:#010X}->{:#010X} nc {}->{} · {}",
                prev_style, style, prev_ex, ex, prev_nc, nc, guard
            ),
        );
        /* the tree, only when something moved: this is the line that can name the window
           holding the bar, and it is too chatty to print every tick */
        let _ = boot_note(app.clone(), format!("[layer] tree {}", unsafe { win32::frame_report(hwnd) }));
    }
    /* WS_EX_LAYERED belongs to this window the same way WS_POPUP does — the log has seen
       the toolkit's rewrite drop it (0x14C80000/0x00040118 carries neither LAYERED nor
       TOOLWINDOW) — so its absence counts as dirty and strip_frame puts it back. The same
       predicate the hook uses, now including the activation bit: see win32::frame_dirty. */
    let dirty = win32::frame_dirty(style, ex);
    if !dirty {
        if nc > 0 && FRAME_NC_NOTED.swap(1, Ordering::Relaxed) == 0 {
            /* bits clean, bar measured: the case the style bits cannot see, and the reason the
               caption kept surviving every fix aimed at them. Once per episode — the poll runs
               at 120 ms and this state can persist for seconds. */
            let _ = boot_note(
                app.clone(),
                format!("[layer] bits clean but nc={} · {}", nc, guard),
            );
        }
        if nc == 0 {
            FRAME_NC_NOTED.store(0, Ordering::Relaxed);
        }
        if FRAME_DIRTY.swap(0, Ordering::Relaxed) != 0 {
            let _ = boot_note(app.clone(), format!("[layer] frame clean · {}", guard));
        }
        return;
    }
    FRAME_DIRTY.store(1, Ordering::Relaxed);
    /* both sides of the strip, not just what was masked off: the interesting question is
       what the window looked like before (caption back, LAYERED gone) and what it looks
       like after, and 0xC00000 alone does not distinguish a caption incident from a
       transparency incident — the white bar the user reports is the first and the
       unpaintable layer would be the second */
    let (ns, nex, _, _) = unsafe { win32::strip_frame(hwnd) };
    let _ = boot_note(
        app.clone(),
        format!(
            "[layer] frame repaired: was 0x{:08X}/0x{:08X} -> 0x{:08X}/0x{:08X} · {}",
            style, ex, ns, nex, guard
        ),
    );
}

#[tauri::command]
fn place_layer(app: AppHandle) -> Result<Rect, String> {
    let (wa, _) = work_area_rect(&app)?;
    if let Some(win) = app.get_webview_window(LAYER) {
        let _ = win.set_position(tauri::LogicalPosition::new(f64::from(wa.x), f64::from(wa.y)));
        let _ = win.set_size(tauri::LogicalSize::new(
            f64::from(wa.width),
            f64::from(wa.height),
        ));
        refresh_layer_cache(&app);
    }
    Ok(wa)
}

#[tauri::command]
fn set_click_through(app: AppHandle, ignore: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(LAYER) {
        win.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Transient show/hide driven by the renderer's visibility policy. Distinct from the
/// `overlay` *setting*, which is the user's preference and lives in the state.
#[tauri::command]
fn overlay_show(app: AppHandle, show: bool) -> Result<(), String> {
    let Some(win) = app.get_webview_window(LAYER) else {
        return Ok(());
    };
    // deliberately does not touch CURSOR_ON: overlay visibility and feed lifetime are
    // separate decisions, and coupling them deadlocks the desktop-only rule
    if show {
        /* the same race as the panel: the region is what hides the caption, and it is
           not re-applied until the renderer notices the window came back */
        if let Ok(h) = win.hwnd() {
            unsafe { win32::strip_frame(h.0 as win32::Hwnd) };
        }
    }
    let _ = if show { win.show() } else { win.hide() };
    if show {
        /* showing re-enters the z-order at the bottom of the topmost band, so the deck can
           be flagged topmost and still sit under a terminal. Put it back at the front. */
        if let Ok(h) = win.hwnd() {
            unsafe { win32::reassert_topmost(h.0 as win32::Hwnd) };
        }
    }

    if show {
        spawn_frame_settle(app.clone(), "show");
    }
    Ok(())
}

#[tauri::command]
fn force_show(app: AppHandle, ms: i64) -> Result<(), String> {
    FORCE_SHOW_UNTIL.store(now_ms() + ms, Ordering::Relaxed);
    overlay_show(app.clone(), true)?;
    let _ = app.emit_to(LAYER, "command", serde_json::json!({ "type": "awake" }));
    Ok(())
}

/// --no-shape drops back to the toggling path, for A/B against the region.
fn shape_disabled_by_args() -> bool {
    std::env::args().any(|a| a == "--no-shape")
}

/// Opens the task panel at start-up. Only exists so the panel can be exercised from
/// a script: WebView2 must be created on the main thread, and that mistake produces a
/// white window and then a dead process, which is not observable any other way.
fn open_panel_at_boot() -> bool {
    std::env::args().any(|a| a == "--panel")
}

/// value of a `--flag <value>` argument
fn arg_value(flag: &str) -> Option<String> {
    let mut it = std::env::args();
    while let Some(a) = it.next() {
        if a == flag {
            return it.next();
        }
    }
    None
}

/// Injects a JS file into one window so behaviour can be asserted from outside.
/// ExecuteScript runs in the page's main world and is not subject to the page CSP,
/// and the page reports its verdict back through boot_note into the same log.
fn spawn_script_channel(app: &AppHandle, label: &'static str, flag: &str, settle_ms: u64) {
    let Some(path) = arg_value(flag) else { return };
    let runner = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(settle_ms));
        let js = match std::fs::read_to_string(&path) {
            Ok(js) => js,
            Err(e) => {
                let _ = boot_note(runner, format!("[test] cannot read {path}: {e}"));
                return;
            }
        };
        /* the panel is not necessarily open yet, so wait for the window itself */
        for _ in 0..40 {
            if runner.get_webview_window(label).is_some() {
                let inject = runner.clone();
                /* Waiting for the *bridge*, not just the window. A panel created by a click
                   rather than by `--panel` is injected with the moment its HWND exists, while
                   its own scripts are still loading, so `window.API` is undefined and every
                   `API.bootNote` in the test file was caught by its own try/catch and dropped:
                   the run looked silent, i.e. like a test that found nothing, four times over. */
                let body = String::from(
                    "(function(){var t=0;function run(){if(!window.API||!window.API.bootNote){if(t++<80){setTimeout(run,250);}return;}",
                ) + &js
                    + "}run();})();";
                let _ = runner.run_on_main_thread(move || {
                    if let Some(win) = inject.get_webview_window(label) {
                        let _ = boot_note(inject.clone(), format!("[test] eval -> {label}"));
                        let _ = win.eval(&body);
                    }
                });
                return;
            }
            std::thread::sleep(std::time::Duration::from_millis(300));
        }
        let _ = boot_note(runner, format!("[test] no {label} window for {path}"));
    });
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub fn force_show_active() -> bool {
    FORCE_SHOW_UNTIL.load(Ordering::Relaxed) > now_ms()
}

/* ------------------------------------------------------------------ cursor feed
   Electron's setIgnoreMouseEvents(true, {forward:true}) handed the page a mousemove
   even while the window was click-through. Tauri has no equivalent and the
   maintainers have declined it (tauri#6164), so the approach-the-edge gesture has to
   be driven from a real cursor position instead. */

#[derive(Serialize, Clone)]
struct CursorFrame {
    #[serde(rename = "type")]
    kind: &'static str,
    x: i32,
    y: i32,
    inside: bool,
}

fn spawn_cursor_feed(app: AppHandle) {
    std::thread::spawn(move || {
        let mut tick = 0u32;
        let mut last = win32::Point { x: i32::MIN, y: i32::MIN };
        loop {
            if !CURSOR_ON.load(Ordering::Relaxed) {
                FEED_OFF.fetch_add(1, Ordering::Relaxed);
                std::thread::sleep(std::time::Duration::from_millis(200));
                tick = 0;
                continue;
            }
            std::thread::sleep(std::time::Duration::from_millis(16));
            // the layer only moves when a display changes, so resync once a second
            if tick % 60 == 0 {
                refresh_layer_cache(&app);
            }
            tick = tick.wrapping_add(1);

            let Some(pt) = win32::cursor_pos() else {
                FEED_POSFAIL.fetch_add(1, Ordering::Relaxed);
                continue;
            };
            if pt.x == last.x && pt.y == last.y {
                FEED_UNCHANGED.fetch_add(1, Ordering::Relaxed);
                continue;
            }
            last = pt;
            let scale = f64::from(SCALE_X1000.load(Ordering::Relaxed)) / 1000.0;
            let x = ((pt.x - LAYER_X.load(Ordering::Relaxed)) as f64 / scale).round() as i32;
            let y = ((pt.y - LAYER_Y.load(Ordering::Relaxed)) as f64 / scale).round() as i32;
            let inside = x >= 0
                && y >= 0
                && x < LAYER_W.load(Ordering::Relaxed)
                && y < LAYER_H.load(Ordering::Relaxed);
            let Some(win) = app.get_webview_window(LAYER) else {
                FEED_NOWIN.fetch_add(1, Ordering::Relaxed);
                continue;
            };
            if let Err(e) = win.emit(
                "command",
                CursorFrame {
                    kind: "cursor",
                    x,
                    y,
                    inside,
                },
            ) {
                if FEED_EMITFAIL.load(Ordering::Relaxed) == 0 {
                    let _ = boot_note(app.clone(), format!("[feed] emit failed: {e}"));
                }
                FEED_EMITFAIL.fetch_add(1, Ordering::Relaxed);
            } else {
                FEED_EMITTED.fetch_add(1, Ordering::Relaxed);
            }
        }
    });
}

/// The renderer owns the geometry (it is the only thing that knows where the cards
/// are) and pushes spans in CSS pixels; the scale to device pixels happens here,
/// next to the cache that already tracks it for the cursor feed.
#[tauri::command]
/// `None` means the whole window is ours (scatter, modal, drag); `Some(vec![])`
/// means nothing of ours is on screen. Collapsing the two together would shrink the
/// layer to a pixel exactly when it has to stay clickable.
fn set_layer_shape(win: tauri::WebviewWindow, spans: Vec<Span>) -> Result<(), String> {
    if !SHAPE_MODE.load(Ordering::Relaxed) {
        return Ok(());
    }
    // CSS px -> device px: a window region is in the window's own physical space
    let scale = win.scale_factor().unwrap_or(1.0);
    let mut rects: Vec<(i32, i32, i32, i32)> = spans
        .iter()
        .take(4096)
        .map(|s| {
            (
                (s.x * scale).round() as i32,
                (s.y * scale).round() as i32,
                (s.width * scale).round() as i32,
                (s.height * scale).round() as i32,
            )
        })
        .map(|(x, y, w, h)| (x, y, w.max(1), h.max(1)))
        .collect();
    let kind = if rects.is_empty() {
        // nothing of ours on screen: one dead pixel keeps the layer click-through
        // everywhere that matters without claiming the whole work area
        rects = vec![(0, 0, 1, 1)];
        "empty(1px)"
    } else {
        "spans"
    };
    if let Ok(mut prev) = LAST_SHAPE_MODE.lock() {
        if *prev != kind {
            *prev = kind.to_string();
            let _ = boot_note(
                win.app_handle().clone(),
                format!("[shape] {kind} {} rects", rects.len()),
            );
        }
    }
    let hwnd = win.hwnd().map_err(|e| e.to_string())?.0 as win32::Hwnd;
    if unsafe { !win32::apply_region(hwnd, &rects) } {
        SHAPE_WORKS.store(false, Ordering::Relaxed);
        let _ = boot_note(
            win.app_handle().clone(),
            "[shape] SetWindowRgn failed; falling back to toggling".into(),
        );
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Span {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[tauri::command]
fn cursor_watch(app: AppHandle, on: bool) {
    CURSOR_ON.store(on, Ordering::Relaxed);
    if !on {
        let _ = boot_note(app, "cursor_watch(false): feed stopped by the renderer".into());
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FeedStats {
    on: bool,
    emitted: i64,
    off: i64,
    pos_fail: i64,
    unchanged: i64,
    no_window: i64,
    emit_fail: i64,
    layer: Rect,
    scale: f64,
    cursor: (i32, i32),
}

#[tauri::command]
fn feed_stats() -> FeedStats {
    let pt = win32::cursor_pos().map(|p| (p.x, p.y)).unwrap_or((0, 0));
    FeedStats {
        on: CURSOR_ON.load(Ordering::Relaxed),
        emitted: FEED_EMITTED.load(Ordering::Relaxed),
        off: FEED_OFF.load(Ordering::Relaxed),
        pos_fail: FEED_POSFAIL.load(Ordering::Relaxed),
        unchanged: FEED_UNCHANGED.load(Ordering::Relaxed),
        no_window: FEED_NOWIN.load(Ordering::Relaxed),
        emit_fail: FEED_EMITFAIL.load(Ordering::Relaxed),
        layer: Rect {
            x: LAYER_X.load(Ordering::Relaxed),
            y: LAYER_Y.load(Ordering::Relaxed),
            width: LAYER_W.load(Ordering::Relaxed) as u32,
            height: LAYER_H.load(Ordering::Relaxed) as u32,
        },
        scale: f64::from(SCALE_X1000.load(Ordering::Relaxed)) / 1000.0,
        cursor: pt,
    }
}

/* ------------------------------------------------------------------ foreground watch
   Replaces the PowerShell child process the Electron build spawned: same 700 ms poll,
   same classification, but it never touches the shell's execution policy and cannot
   die and need respawning. */

static FOREGROUND_ON: AtomicBool = AtomicBool::new(false);

#[derive(Serialize, Clone)]
struct ForegroundFrame {
    #[serde(rename = "type")]
    kind: &'static str,
    what: String,
    /// Whether the window in front actually overlaps the screen the layer lives on.
    /// On a multi-monitor desktop, working on the other display is not "another app
    /// covering the desktop", and hiding the deck for it is wrong.
    over: bool,
    /// The window in front covers its whole monitor: a film or a game. The deck has no
    /// business being on top of that, whatever the desktop-only setting says.
    fullscreen: bool,
    /// The window that decided the frame, so a wrong hiding is diagnosable after the
    /// fact: "the deck vanished when I clicked the desktop" needs the class name, not a
    /// guess about which of the four rules fired.
    who: String,
}

fn spawn_foreground_watch(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = String::new();
        loop {
            std::thread::sleep(std::time::Duration::from_millis(700));
            /* the frame guard is its own thread on purpose: this loop may idle out
               whenever the visibility policy stops needing foreground frames, and the
               caption bits come back whether or not it is watching */
            if !FOREGROUND_ON.load(Ordering::Relaxed) {
                continue;
            }
            let hwnd = win32::foreground();
            let class = win32::class_of(hwnd);
            let proc = win32::process_of(hwnd);
            let title = win32::title_of(hwnd);
            let kind = shell::classify(&class, &proc, &title).as_str();
            let over = match win32::rect_of(hwnd) {
                Some((l, t, r, b)) => {
                    let lx = LAYER_X.load(Ordering::Relaxed);
                    let ly = LAYER_Y.load(Ordering::Relaxed);
                    let lw = LAYER_W.load(Ordering::Relaxed);
                    let lh = LAYER_H.load(Ordering::Relaxed);
                    r > lx && l < lx + lw && b > ly && t < ly + lh
                }
                None => true,
            };
            /* only a foreign application can be "the film you are watching": our own
               maximised panel and the shell windows cover the screen for other reasons.
               `over` is part of the test rather than an extra: a film on the screen the
               deck is NOT on is nobody's business, and the deck on the second display has
               no reason to disappear when the first one goes full screen. */
            let full = kind == "app"
                && over
                && !shell::is_shell_proc(&proc)
                && !shell::is_desktop_surface(&class, &proc)
                && unsafe { win32::is_fullscreen(hwnd) };
            let stamp = format!("{}|{}|{}|{}", kind, title, over, full);
            if stamp == last {
                continue;
            }
            last = stamp;
            let who = format!("{}|{}", class, proc);
            let _ = app.emit_to(
                LAYER,
                "command",
                ForegroundFrame {
                    kind: "foreground",
                    what: kind.to_string(),
                    over,
                    fullscreen: full,
                    who,
                },
            );
        }
    });
}

/// Keep the caption off the desktop layer on its own clock.
///
/// Something in the toolkit puts WS_CAPTION and friends back — it owns the style it built
/// the window with and re-applies that on activation and resize, so stripping it once is
/// not a fix. Between the re-add and the strip, a window whose region covers the whole
/// client paints a white title bar reading "Pin To-Do 桌面卡片层", which is the flash the
/// user reports. The window-event hook answers it the moment the event reaches us; this is
/// the backstop for the cases where it does not, and at two `GetWindowLongW` calls a tick
/// it is not worth being cleverer about. 120 ms keeps the flash shorter than the blink it
/// was reported as, and stays readable in the log, which names every repair.
/// Re-strip and re-compose the layer's frame a few times after it becomes visible.
///
/// The caption is composed by DWM at moments none of the style watchers see: measured, a boot
/// where the window was created, shown, and never once wrote a style we caught — no hook
/// strip, no repair, and a caption band on screen the whole time, on a window whose style
/// reads clean and whose non-client height is 0. The frame was latched once, at creation, and
/// nothing since has asked the compositor to build another one.
///
/// Only a size change does that, so this asks for one — a pixel out and a pixel back — on a
/// short ladder after the window appears. It runs from the build path as well as from
/// `overlay_show`, because the startup path is exactly the one that was never covered.
fn spawn_frame_settle(app: AppHandle, why: &'static str) {
    std::thread::spawn(move || {
        let mut slept = 0u64;
        for step in [150u64, 450, 900, 1_650] {
            std::thread::sleep(std::time::Duration::from_millis(step));
            slept += step;
            let h = LAYER_HWND.load(Ordering::Relaxed);
            if h == 0 {
                return;
            }
            let hwnd = h as win32::Hwnd;
            let (style, ex) = unsafe {
                (
                    win32::GetWindowLongW(hwnd, win32::GWL_STYLE),
                    win32::GetWindowLongW(hwnd, win32::GWL_EXSTYLE),
                )
            };
            let dirty = win32::frame_dirty(style, ex);
            let (ns, nex, _, _) = unsafe { win32::strip_frame(hwnd) };
            let did = unsafe { win32::recompose_frame_slow(hwnd) };
            let _ = boot_note(
                app.clone(),
                format!(
                    "[layer] settle({}) at {}ms: {} 0x{:08X}/0x{:08X} -> 0x{:08X}/0x{:08X} recompose={} ncRefused={}",
                    why,
                    slept,
                    if dirty { "DIRTY" } else { "clean" },
                    style, ex, ns, nex, did, win32::nc_refused()
                ),
            );
        }
    });
}

fn spawn_frame_guard(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = -1isize;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(120));
            repair_layer_frame(&app);
            /* say so when the hook has had to act: the poll below it will find nothing to
               repair in exactly the same situation where nothing happened at all, and the
               two are only distinguishable by this line. */
            /* the hook's own account of what it caught, written out here because that is the
               thread holding an app handle. Every line names the bits that were wrong, the
               event that woke us, the thread which caused it, and the window in front at the
               time — the four things the bare counter never told. */
            for e in win32::drain_frame_events() {
                let _ = boot_note(app.clone(), format!("[layer] {}", e));
            }
            /* the deferred half of every repair the hook made: reallocating the surface in
               the same breath as the strip puts the caption back, because the paint for the
               captioned style was already on its way */
            let due = win32::RECOMPOSE_DUE.load(Ordering::Relaxed);
            if due != 0 {
                let now_tick = unsafe { win32::GetTickCount() };
                if now_tick.wrapping_sub(due) as i32 >= 0 {
                    win32::RECOMPOSE_DUE.store(0, Ordering::Relaxed);
                    let h = LAYER_HWND.load(Ordering::Relaxed);
                    if h != 0 {
                        /* on this thread, which is allowed to sleep — the realloc only works
                           if the compositor gets a chance to see the smaller size first */
                        let did = unsafe { win32::recompose_frame_slow(h as win32::Hwnd) };
                        let _ = boot_note(
                            app.clone(),
                            format!("[layer] deferred recompose due={}ms ago acted={}", now_tick.wrapping_sub(due), did),
                        );
                    }
                }
            }
            let now = win32::guard_status().1;
            if now != last {
                last = now;
                let _ = boot_note(
                    app.clone(),
                    format!("[layer] style guard: stripped={}", now),
                );
            }
        }
    });
}

/// The hook's recent strips, for a test script to poll at its own rate. Peeked rather than
/// drained, so the guard thread still gets to write every one of them into the boot log.
#[tauri::command]
fn layer_frame_events() -> String {
    let v = win32::peek_frame_events(8);
    if v.is_empty() {
        return "none".to_string();
    }
    v.join(" || ")
}

/// Let the card layer be activated, or refuse it — the keyboard door for the modals, and the
/// switch that decides whether DWM ever gets to compose the white band. See `win32::set_focusable`.
#[tauri::command]
fn layer_focus(app: AppHandle, on: bool) -> String {
    let h = LAYER_HWND.load(Ordering::Relaxed);
    if h == 0 {
        return "layer hwnd not registered".to_string();
    }
    let line = unsafe { win32::set_focusable(h as win32::Hwnd, on) };
    let _ = boot_note(app, format!("[layer] focus {}", line));
    line
}

#[tauri::command]
fn layer_frame_report() -> String {
    /* the caption question asked from the renderer's side. The 120 ms guard can only ever
       look at the handle this process chose to keep, so a bar painted by a window outside
       that handle — the WebView2 child, or something else entirely — is invisible to it.
       A test script polling this every few hundred ms can line a screenshot up with the
       window that owns the strip. */
    let h = LAYER_HWND.load(Ordering::Relaxed);
    if h == 0 {
        return "layer hwnd not registered".to_string();
    }
    unsafe { win32::frame_report(h as win32::Hwnd) }
}

#[tauri::command]
fn foreground_watch(on: bool) {
    FOREGROUND_ON.store(on, Ordering::Relaxed);
}

/* ------------------------------------------------------------------ panel window */

#[derive(Serialize, Clone)]
struct PanelCmd<'a> {
    #[serde(rename = "type")]
    kind: &'a str,
    view: &'a str,
}

fn panel_or_create(app: &AppHandle, view: &str) -> Result<(), String> {
    /* A detached thread, and specifically NOT run_on_main_thread — measured, not
       guessed. Hopping to the event-loop thread and calling build() from inside that
       task writes "[panel] creating" and then never returns: WebView2 needs the loop
       to keep running while it attaches the controller, and the task *is* the loop.
       The white panel the deck's ▤ produced was that half-created frame — a window
       with the right geometry whose owner was pin-tauri rather than msedgewebview2,
       i.e. no webview attached at all. From its own thread, wry posts the creation to
       the loop and blocks here instead, which is the shape --panel has always used. */
    let runner = app.clone();
    let view = view.to_string();
    std::thread::spawn(move || {
        if let Err(e) = build_or_show_panel(&runner, &view) {
            let _ = boot_note(runner.clone(), format!("[panel] FAILED {e}"));
        }
    });
    Ok(())
}

fn build_or_show_panel(app: &AppHandle, view: &str) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(PANEL) {
        let _ = boot_note(app.clone(), "[panel] re-shown".into());
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
        if !view.is_empty() {
            let _ = win.emit("command", PanelCmd { kind: "view", view });
        }
        return Ok(());
    }
    let cached = PANEL_GEO.lock().ok().and_then(|g| *g);
    let (pw, ph) = cached.map(|g| (g.2, g.3)).unwrap_or((1240, 800));
    let mut b = WebviewWindowBuilder::new(app, PANEL, WebviewUrl::App("dashboard.html".into()))
        .title(PANEL_TITLE)
        .decorations(false)
        .inner_size(f64::from(pw), f64::from(ph))
        .min_inner_size(900.0, 600.0)
        .resizable(true)
        /* the deck's ▤ is a click in a topmost but non-foreground layer, so without
           this the panel is created behind whatever the user was actually typing in */
        .focused(true)
        /* never reveal an unpopulated window: the chrome is static markup and paints
           first, the view list / deck list / ledger rows come from JS, so showing at
           creation is exactly the "half-empty panel" flash */
        .visible(false);
    b = match cached {
        Some((x, y, _, _)) => b.position(f64::from(x), f64::from(y)),
        None => match work_area_rect(app) {
            /* first open: centre it on the work area the card layer lives in */
            Ok((wa, _)) => b.position(
                f64::from(wa.x) + (f64::from(wa.width) - f64::from(pw)) / 2.0,
                f64::from(wa.y) + (f64::from(wa.height) - f64::from(ph)) / 2.0,
            ),
            Err(_) => b,
        },
    };
    /* breadcrumbs on both sides of build(): "creating" with no "built" means the
       call never returned, which is a different failure from an Err, and the two
       look identical from the screen */
    let _ = boot_note(app.clone(), format!("[panel] creating {pw}x{ph}"));
    let win = b.build().map_err(|e| e.to_string())?;
    let _ = boot_note(
        app.clone(),
        format!("[panel] built visible={}", win.is_visible().unwrap_or(false)),
    );
    /* A page that never reports a first render must not leave the window invisible
       forever, so reveal it after a grace period regardless */
    let watcher = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(2500));
        if let Some(w) = watcher.get_webview_window(PANEL) {
            if !w.is_visible().unwrap_or(false) {
                let _ = boot_note(watcher.clone(), "[panel] reveal fallback".into());
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
    });
    if !view.is_empty() {
        /* Stashed rather than emitted: the page has not executed a single line at
           this point, so a command sent now is dropped before any listener exists.
           The dashboard asks for it once its own listeners are bound. */
        if let Ok(mut v) = PANEL_VIEW.lock() {
            *v = view.to_string();
        }
    }
    Ok(())
}

#[tauri::command]
fn panel_take_view(app: AppHandle) -> String {
    let taken = PANEL_VIEW
        .lock()
        .map(|mut v| std::mem::take(&mut *v))
        .unwrap_or_default();
    if !taken.is_empty() {
        let _ = boot_note(app, format!("[panel] view={taken}"));
    }
    taken
}

#[tauri::command]
fn panel_ready(app: AppHandle) {
    if let Some(w) = app.get_webview_window(PANEL) {
        let hidden = !w.is_visible().unwrap_or(false);
        if hidden {
            /* the caption has to be off before the window is composited, not after:
               DWM paints a blue title bar for any window still carrying WS_CAPTION when
               it first shows, which is the flash this used to leave behind */
            if let Ok(h) = w.hwnd() {
                let (style, cw, ch) = unsafe { win32::strip_caption(h.0 as win32::Hwnd) };
                let _ = boot_note(
                    app.clone(),
                    format!("[panel] caption off 0x{:08X} client={}x{}", style, cw, ch),
                );
            }
            let _ = boot_note(app.clone(), "[panel] first paint, revealing".into());
        }
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn open_dashboard(app: AppHandle, view: Option<String>) -> Result<(), String> {
    panel_or_create(&app, view.as_deref().unwrap_or(""))
}

#[tauri::command]
fn toggle_dashboard(app: AppHandle) -> Result<(), String> {
    match app.get_webview_window(PANEL) {
        Some(win) if win.is_visible().unwrap_or(false) => {
            let _ = win.close();
        }
        _ => panel_or_create(&app, "")?,
    }
    Ok(())
}

#[tauri::command]
fn close_dashboard(app: AppHandle) {
    if let Some(win) = app.get_webview_window(PANEL) {
        let _ = win.close();
    }
}

#[tauri::command]
fn send_command(app: AppHandle, label: String, payload: serde_json::Value) -> Result<(), String> {
    let _ = app.emit_to(label.as_str(), "command", payload);
    Ok(())
}

/* ------------------------------------------------------------------ host sync: tray,
   autostart and the global shortcut are all driven by a small summary the renderer
   pushes after every state change, so the reducer never has to be duplicated here. */

#[derive(Serialize, Deserialize, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    #[serde(default)]
    pub open_count: usize,
    #[serde(default)]
    pub overlay: bool,
    #[serde(default)]
    pub desktop_only: bool,
    #[serde(default)]
    pub launch_at_login: bool,
    #[serde(default)]
    pub shortcuts: bool,
    #[serde(default)]
    pub hotkey: String,
    #[serde(default)]
    pub reminders: bool,
}

#[derive(Default)]
struct HostState {
    summary: Mutex<Summary>,
    hotkey: Mutex<Option<String>>,
}

fn toggle_panel(app: &AppHandle) {
    match app.get_webview_window(PANEL) {
        Some(win) => {
            if win.is_visible().unwrap_or(false) {
                let _ = win.close();
            } else {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }
        None => {
            let _ = panel_or_create(app, "");
        }
    }
}

fn tray_command<R: Runtime>(app: &AppHandle<R>, action: &str) {
    let _ = app.emit_to(
        LAYER,
        "command",
        serde_json::json!({ "type": "tray", "action": action }),
    );
}

fn build_menu<R: Runtime>(app: &AppHandle<R>, s: &Summary) -> tauri::Result<Menu<R>> {
    let header = MenuItem::with_id(app, "header", format!("PIN TO-DO · 未完成 {}", s.open_count), false, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let panel = MenuItem::with_id(app, "panel", "打开/关闭任务面板", true, None::<&str>)?;
    let quick = MenuItem::with_id(app, "quick-add", "新建任务（快速）", true, None::<&str>)?;
    let layer = CheckMenuItem::with_id(app, "overlay", "桌面卡片层", true, s.overlay, None::<&str>)?;
    let dedupe = CheckMenuItem::with_id(
        app,
        "desktop-only",
        "仅在桌面显示（其他窗口在前台时隐藏）",
        true,
        s.desktop_only,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let autostart = CheckMenuItem::with_id(
        app,
        "autostart",
        "开机自动启动",
        true,
        s.launch_at_login,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(app, "settings", "设置…", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出 Pin To-Do", true, None::<&str>)?;
    Menu::with_items(
        app,
        &[
            &header, &sep1, &panel, &quick, &layer, &dedupe, &sep2, &autostart,
            &settings, &sep3, &quit,
        ],
    )
}

fn refresh_tray<R: Runtime>(app: &AppHandle<R>, s: &Summary) {
    let Some(tray) = app.tray_by_id("pin-tray") else {
        return;
    };
    if let Ok(menu) = build_menu(app, s) {
        let _ = tray.set_menu(Some(menu));
    }
    let _ = tray.set_tooltip(Some(format!("Pin To-Do · 未完成 {}", s.open_count)));
}

/// Electron writes "Control+Alt+T"; Tauri's parser wants "Ctrl+Alt+T".
fn to_accelerator(raw: &str) -> String {
    raw.replace("Control", "Ctrl")
}

fn apply_hotkey(app: &AppHandle, s: &Summary) {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
    let gs = app.global_shortcut();
    let previous = app.state::<HostState>().hotkey.lock().ok().and_then(|g| g.clone());
    // (previous registration, if any, is released before re-binding)
    if let Some(old) = previous {
        let _ = gs.unregister(old.as_str());
    }
    if !s.shortcuts || s.hotkey.trim().is_empty() {
        if let Ok(mut g) = app.state::<HostState>().hotkey.lock() {
            *g = None;
        }
        return;
    }
    let accel = to_accelerator(s.hotkey.trim());
    match accel.parse::<tauri_plugin_global_shortcut::Shortcut>() {
        Ok(shortcut) => {
            let outcome = gs.on_shortcut(shortcut, |app, _sc, event| {
                if event.state == ShortcutState::Pressed {
                    let _ = force_show(app.clone(), 6000);
                    tray_command(app, "quick-add");
                }
            });
            match outcome {
                Ok(_) => {
                    if let Ok(mut g) = app.state::<HostState>().hotkey.lock() {
                        *g = Some(accel);
                    }
                }
                Err(e) => eprintln!("[hotkey] {accel} unavailable: {e}"),
            }
        }
        Err(e) => eprintln!("[hotkey] cannot parse {accel}: {e}"),
    }
}

fn apply_autostart(app: &AppHandle, on: bool) {
    use tauri_plugin_autostart::ManagerExt;
    let handle = app.autolaunch();
    let _ = if on { handle.enable() } else { handle.disable() };
}

#[tauri::command]
fn sync_host(app: AppHandle, summary: Summary) -> Result<(), String> {
    let host = app.state::<HostState>();
    let changed = {
        let stored = host.summary.lock().map_err(|e| e.to_string())?;
        *stored != summary
    };
    if !changed {
        return Ok(());
    }
    if let Ok(mut g) = host.summary.lock() {
        *g = summary.clone();
    }
    refresh_tray(&app, &summary);
    apply_hotkey(&app, &summary);
    apply_autostart(&app, summary.launch_at_login);
    // the host has no console and these three are silent when they fail, so record
    // what was actually agreed with the OS
    let bound = app
        .state::<HostState>()
        .hotkey
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    let _ = boot_note(
        app.clone(),
        format!(
            "host sync: tray={} hotkey={:?} autostart={}",
            app.tray_by_id("pin-tray").is_some(),
            bound,
            summary.launch_at_login
        ),
    );
    Ok(())
}

/// Page zoom, applied by the webview itself rather than with CSS. The command takes
/// the calling window so each window keeps its own factor, the way
/// `BrowserWindow.fromWebContents(e.sender)` worked in the Electron build.
#[tauri::command]
fn set_webview_zoom(win: tauri::WebviewWindow, factor: f64) -> Result<(), String> {
    let msg = win.set_zoom(factor).map_err(|e| e.to_string());
    if let Err(ref e) = msg {
        let _ = boot_note(win.app_handle().clone(), format!("[zoom] {factor}: {e}"));
    }
    msg
}

#[tauri::command]
fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
    Ok(())
}

/// A receipt is worth keeping only if the user can find it again, so the writer lives
/// here rather than in an `<a download>` that silently drops files into wherever the
/// webview feels like putting them. It reports the path back so the renderer can say
/// where the file went.
#[tauri::command]
fn save_png(app: AppHandle, data_url: String, name: String, dir: String) -> Result<serde_json::Value, String> {
    let comma = data_url.find(',').ok_or("not a data url")?;
    let bytes = b64_decode(&data_url[comma + 1..])?;
    if bytes.len() < 8 || &bytes[0..8] != b"\x89PNG\r\n\x1a\n" {
        return Err("payload is not a PNG".into());
    }
    let dir = if dir.trim().is_empty() { receipts_dir(&app)? } else { PathBuf::from(dir.trim()) };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    /* Windows will not accept these in a filename, and the day's receipt is named after
       the day, so replacing rather than rejecting keeps the timed print from failing
       on a machine with an odd user name */
    let safe: String = name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect();
    let path = dir.join(safe);
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "path": path.display().to_string(),
        "dir": dir.display().to_string(),
    }))
}

/// An empty path means "the folder you decided on", not "no folder": the receipt's own
/// 打开文件夹 button has nothing to name until a save has told it where the file went,
/// and a button that answers "not a folder" on a machine that has never printed is the
/// button the user judges the app by.
#[tauri::command]
fn open_dir(app: AppHandle, path: String) -> Result<(), String> {
    let dir = if path.trim().is_empty() {
        let d = receipts_dir(&app)?;
        std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
        d
    } else {
        PathBuf::from(path.trim())
    };
    if !dir.is_dir() {
        return Err("not a folder".into());
    }
    // explorer.exe reports failure through its exit code even when it worked, so the
    // spawn is the only signal worth checking
    std::process::Command::new("explorer")
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// The settings panel shows the folder it would actually write to, so it asks rather
/// than re-deriving the Downloads path in JavaScript (where OneDrive redirection makes
/// a hand-written guess wrong).
#[tauri::command]
fn receipt_dir(app: AppHandle) -> Result<String, String> {
    let dir = receipts_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.display().to_string())
}

fn receipts_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dl = win32::known_folder(&win32::FOLDERID_DOWNLOADS);
    Ok(match dl {
        Some(p) if p.is_dir() => p.join("Pin To-Do"),
        _ => config_dir(app)?.join("receipts"),
    })
}

/* ---------------------------------------------------------------- agent transport
   Everything the language model can do is reachable through these four commands, and the
   shape is deliberate: the renderer composes an OpenAI-compatible request and names the
   endpoint, while the secret and the socket stay on this side. A non-streaming round trip
   is enough here — one turn is one short JSON answer with at most a couple of tool calls,
   and the UI is a confirmation sheet rather than a chat window. */

/// Turn a base URL into a chat endpoint. Accepts what a user will actually paste —
/// `https://api.x.com/v1`, with or without a trailing slash, or the full endpoint — and
/// produces one of each.
fn chat_endpoint(base: &str) -> Result<String, String> {
    let trimmed = base.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("还没有填写接口地址".to_string());
    }
    if trimmed.ends_with("/chat/completions") {
        return Ok(trimmed.to_string());
    }
    Ok(format!("{}/chat/completions", trimmed))
}

#[tauri::command]
fn ai_chat(app: AppHandle, base: String, model: String, body: String) -> Result<String, String> {
    let url = chat_endpoint(&base)?;
    let key = secrets::load().unwrap_or_default();
    let started = std::time::Instant::now();
    let (status, text) = net::post_json(&url, &body, &key)?;
    /* the request body carries the user's task list and the header carries the key, so the
       log records only what cannot be inferred from a working call anyway: where it went,
       which model answered, how long, how big, and what the provider said when it refused */
    let host = url.split('/').nth(2).unwrap_or("?");
    let _ = boot_note(
        app.clone(),
        format!(
            "[ai] {} {} -> {} in {}ms, {}B",
            host,
            model,
            status,
            started.elapsed().as_millis(),
            text.len()
        ),
    );
    if (200..300).contains(&status) {
        return Ok(text);
    }
    let mut snippet: String = text.chars().take(400).collect();
    if text.chars().count() > 400 {
        snippet.push('…');
    }
    Err(format!("HTTP {} · {}", status, snippet))
}

/// Ask the endpoint what it serves. Free of token cost, and it answers the two questions
/// the settings screen cannot otherwise: is this URL + key reachable at all, and is this
/// an OpenAI-shaped provider or a Gemini-shaped one.
///
/// The second one is not academic — Google's `/v1beta` is its native API, whose request
/// body looks nothing like OpenAI's, while its OpenAI-compatible layer lives at
/// `/v1beta/openai`. Pointing the agent at the native URL produces a 404 that reads like a
/// broken key, so the shape is reported and the settings screen turns it into a sentence.
#[tauri::command]
fn ai_models(app: AppHandle, base: String) -> Result<serde_json::Value, String> {
    let trimmed = base.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("还没有填写接口地址".to_string());
    }
    let url = format!("{}/models", trimmed);
    let key = secrets::load().unwrap_or_default();
    let started = std::time::Instant::now();
    let (status, text) = net::get_json(&url, &key)?;
    let ms = started.elapsed().as_millis() as u64;
    let _ = boot_note(
        app.clone(),
        format!(
            "[ai] GET {} -> {} in {}ms, {}B",
            trimmed,
            status,
            ms,
            text.len()
        ),
    );
    let v: serde_json::Value = serde_json::from_str(&text).unwrap_or(serde_json::Value::Null);
    let mut ids: Vec<String> = Vec::new();
    let mut shape = "unknown";
    if let Some(arr) = v.get("data").and_then(|d| d.as_array()) {
        shape = "openai";
        for m in arr {
            if let Some(id) = m.get("id").and_then(|i| i.as_str()) {
                ids.push(id.to_string());
            }
        }
    } else if let Some(arr) = v.get("models").and_then(|d| d.as_array()) {
        // Gemini answers with {"models":[{"name":"models/gemini-2.5-flash", …}]}
        shape = "gemini";
        for m in arr {
            if let Some(n) = m.get("name").and_then(|i| i.as_str()) {
                ids.push(n.trim_start_matches("models/").to_string());
            }
        }
    }
    /* providers disagree on whether `error` is a string or an object with a message, and
       this text is the whole point of the button — it is what tells the user their model
       name is wrong rather than "连接失败" */
    let err = match v.get("error") {
        Some(e) => e
            .get("message")
            .and_then(|m| m.as_str())
            .or_else(|| e.as_str())
            .unwrap_or("")
            .to_string(),
        None => String::new(),
    };
    let err: String = err.chars().take(240).collect();
    Ok(serde_json::json!({
        "status": status,
        "ms": ms,
        "shape": shape,
        "count": ids.len(),
        "models": ids.into_iter().take(80).collect::<Vec<_>>(),
        "error": err,
    }))
}

/// The agent's own trace, kept in the host because the two windows are separate webviews:
/// the turn happens in the card layer, the debug view is read in the panel, and neither
/// shares a variable with the other.
///
/// Deliberately **not** in the data file. That file is the user's only copy of their tasks,
/// it has no backup, and it is exportable in two clicks — diagnostic noise has no business
/// living there, and a ring of the last steps is exactly what a restart is allowed to
/// forget.
static AI_TRACE: Mutex<Vec<serde_json::Value>> = Mutex::new(Vec::new());
const AI_TRACE_CAP: usize = 80;

#[tauri::command]
fn ai_trace(entry: String) -> usize {
    let v: serde_json::Value =
        serde_json::from_str(&entry).unwrap_or_else(|_| serde_json::json!({ "raw": entry }));
    let mut g = AI_TRACE.lock().unwrap_or_else(|p| p.into_inner());
    g.push(v);
    if g.len() > AI_TRACE_CAP {
        let excess = g.len() - AI_TRACE_CAP;
        g.drain(0..excess);
    }
    g.len()
}

#[tauri::command]
fn ai_trace_list() -> Vec<serde_json::Value> {
    AI_TRACE.lock().unwrap_or_else(|p| p.into_inner()).clone()
}

#[tauri::command]
fn ai_trace_clear() -> usize {
    let mut g = AI_TRACE.lock().unwrap_or_else(|p| p.into_inner());
    g.clear();
    g.len()
}

#[tauri::command]
fn ai_key_save(key: String) -> Result<String, String> {
    secrets::save(&key)?;
    Ok(secrets::hint())
}

#[tauri::command]
fn ai_key_hint() -> String {
    secrets::hint()
}

#[tauri::command]
fn ai_key_clear() -> Result<String, String> {
    secrets::clear()?;
    Ok(secrets::hint())
}

/// base64 by hand: the alternative was a new direct dependency on a crate that is only
/// already in the tree because something else pulls it in, and this is 25 lines that
/// cannot change under us.
fn b64_decode(s: &str) -> Result<Vec<u8>, String> {
    fn val(c: u8) -> Result<u32, String> {
        match c {
            b'A'..=b'Z' => Ok((c - b'A') as u32),
            b'a'..=b'z' => Ok((c - b'a') as u32 + 26),
            b'0'..=b'9' => Ok((c - b'0') as u32 + 52),
            b'+' => Ok(62),
            b'/' => Ok(63),
            _ => Err("bad base64 character".into()),
        }
    }
    let mut out = Vec::with_capacity(s.len() / 4 * 3 + 3);
    let mut acc: u32 = 0;
    let mut bits = 0u32;
    for &c in s.as_bytes() {
        if c == b'=' {
            break;
        }
        if c == b'\n' || c == b'\r' || c == b' ' {
            continue;
        }
        acc = (acc << 6) | val(c)?;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((acc >> bits) & 0xFF) as u8);
        }
    }
    Ok(out)
}

#[tauri::command]
fn boot_note(app: AppHandle, note: String) -> Result<(), String> {
    use std::io::Write;
    let path = config_dir(&app)?.join("boot.log");
    // this runs for the lifetime of a 24/7 widget, so the log may not grow without
    // bound: keep the newest half whenever it doubles past the cap
    const CAP: u64 = 192 * 1024;
    if std::fs::metadata(&path).map(|m| m.len() > CAP * 2).unwrap_or(false) {
        if let Ok(all) = std::fs::read(&path) {
            let keep = &all[(all.len() - (all.len() / 2))..];
            let _ = std::fs::write(&path, keep);
        }
    }
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    writeln!(f, "{}", note).map_err(|e| e.to_string())
}

#[tauri::command]
fn app_info(app: AppHandle) -> serde_json::Value {
    serde_json::json!({
        "version": app.package_info().version.to_string(),
        "mode": "tauri",
        "platform": std::env::consts::OS,
        "shape": SHAPE_MODE.load(Ordering::Relaxed) && SHAPE_WORKS.load(Ordering::Relaxed),
        "forceShowing": force_show_active(),
        "dataFile": data_path(&app).map(|p| p.display().to_string()).unwrap_or_default(),
    })
}

/* ------------------------------------------------------------------ app */

pub fn run() {
    std::panic::set_hook(Box::new(|info| panic_note(&info.to_string())));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            // a second launch should wake the existing layer, not stack a second one
            let _ = build_layer(app);
            let _ = overlay_show(app.clone(), true);
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_notification::init())
        .manage(HostState::default())
        .invoke_handler(tauri::generate_handler![
            state_load,
            state_save,
            state_commit,
            work_area,
            place_layer,
            set_click_through,
            overlay_show,
            force_show,
            cursor_watch,
            feed_stats,
            set_layer_shape,
            foreground_watch,
            send_command,
            open_dashboard,
            panel_take_view,
            panel_ready,
            toggle_dashboard,
            close_dashboard,
            set_webview_zoom,
            sync_host,
            notify,
            save_png,
            open_dir,
            receipt_dir,
            monitors,
            set_deck_monitor,
            ai_chat,
            ai_models,
            ai_trace,
            ai_trace_list,
            ai_trace_clear,
            ai_key_save,
            ai_key_hint,
            layer_frame_report,
            layer_frame_events,
            layer_focus,
            ai_key_clear,
            boot_note,
            app_info
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            if let Ok(dir) = config_dir(&handle) {
                let _ = LOG_PATH.set(dir.join("boot.log"));
            }
            if shape_disabled_by_args() {
                SHAPE_MODE.store(false, Ordering::Relaxed);
            }
            /* The command line says where the deck should *start*, and only while its display
               is still "auto": a person who has chosen a screen in settings has said so in the
               store, and a flag they never typed must not move them back after every launch. */
            if DECK_MONITOR.load(Ordering::Relaxed) < 0 {
                if let Some(n) = arg_value("--monitor").and_then(|s| s.parse::<isize>().ok()) {
                    if n >= 1 {
                        DECK_MONITOR.store(n - 1, Ordering::Relaxed);
                    }
                }
            }

            build_layer(&handle)?;
            spawn_cursor_feed(handle.clone());
            spawn_foreground_watch(handle.clone());
            spawn_frame_guard(handle.clone());

            if std::env::args().any(|a| a == "--test-clear-region") {
                // does clearing the region make the transparent layer opaque? that
                // would show up as "everything went white", not as a region bug
                let app = handle.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(6));
                    let Some(win) = app.get_webview_window(LAYER) else { return };
                    let hwnd = match win.hwnd() { Ok(h) => h.0 as win32::Hwnd, Err(_) => return };
                    let cleared = unsafe { win32::apply_region(hwnd, &[]) };
                    let _ = boot_note(app.clone(), format!("[test] SetWindowRgn(NULL) -> {cleared}"));
                });
            }
            /* WebView2 gives a Tauri build no debugging port, so this is the only
               outside-in channel: see spawn_script_channel. */
            spawn_script_channel(&handle, LAYER, "--test-script", 2600);
            spawn_script_channel(&handle, PANEL, "--test-script-panel", 3000);
            if open_panel_at_boot() {
                // deliberately off the main thread: the deck's own button reaches this
                // through a command worker, and that is the path that goes white
                let app = handle.clone();
                std::thread::spawn(move || {
                    /* --panel-view exercises the stash-and-pull path too: a view
                       handed to a panel that does not exist yet has to survive until
                       its own listeners are bound */
                    let view = arg_value("--panel-view").unwrap_or_default();
                    let _ = panel_or_create(&app, &view);
                });
            }

            let image = tauri::include_image!("icons/tray.png");
            TrayIconBuilder::with_id("pin-tray")
                .icon(image)
                .menu(&build_menu(&handle, &Summary {
                    overlay: true,
                    desktop_only: true,
                    shortcuts: true,
                    reminders: true,
                    ..Default::default()
                })?)
                .tooltip("Pin To-Do")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_panel(tray.app_handle());
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "panel" => toggle_panel(app),
                    "settings" => {
                        let _ = panel_or_create(app, "settings");
                    }
                    other => tray_command(app, other),
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            /* Tauri has no monitor hotplug event either, so a work-area change is
               caught as the resulting resize of the layer: re-cache the origin the
               cursor feed subtracts and let the renderer redo its layout */
            if window.label() == LAYER {
                /* The toolkit's own activation and resize paths are the likely places the
                   caption bits come back (tao rewrites GWL_STYLE from a cached style there),
                   so strip on those events rather than waiting for the 700 ms backstop: a
                   restored WS_CAPTION on a window whose region covers the whole client is a
                   white title bar reading "Pin To-Do 桌面卡片层" until the next repair.
                   repair_layer_frame no-ops when the style is already clean, and logs when
                   it is not — which also names the event that dirtied it. */
                /* The band is not a live caption and not a style write: measured across a
                   focus round trip, the style never changes and no repair fires, yet a cool
                   grey strip with the window title appears the moment the layer is activated
                   and stays. It is painted into the layered window's own redirection surface —
                   DWM reports no frame at all (extended bounds == window rect) while the strip
                   is plainly on screen. Only a size change reallocates that surface, and the
                   moment it becomes visible to the user is when focus leaves this window, when
                   the stale caption is shown in the inactive colour. So: one realloc, shortly
                   after the loss. Not on Resized — that is what the realloc itself causes, and
                   arming there would loop. */
                if matches!(event, tauri::WindowEvent::Focused(false)) {
                    win32::arm_recompose(300);
                }
                if let tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Focused(_) = event {
                    let app = window.app_handle().clone();
                    if matches!(event, tauri::WindowEvent::Resized(_)) {
                        refresh_layer_cache(&app);
                        let _ = app.emit_to(
                            LAYER,
                            "command",
                            serde_json::json!({ "type": "relayout" }),
                        );
                    }
                    repair_layer_frame(&app);
                }
                return;
            }
            // tell the layer when the panel opens or closes: it changes what the deck
            // may show and what the desktop-only rule should ignore
            if window.label() != PANEL {
                return;
            }
            match event {
                tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed => {
                    /* only on CloseRequested: by Destroyed the geometry is already
                       gone, and a window closed while minimised reports the
                       off-screen park position, which would hide the next open */
                    if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                        if let (Ok(pos), Ok(size)) = (window.outer_position(), window.outer_size()) {
                            if pos.x > -32000 && pos.y > -32000 {
                                let s = window.scale_factor().unwrap_or(1.0);
                                if let Ok(mut g) = PANEL_GEO.lock() {
                                    *g = Some((
                                        (f64::from(pos.x) / s).round() as i32,
                                        (f64::from(pos.y) / s).round() as i32,
                                        (f64::from(size.width) / s).round().max(900.0) as u32,
                                        (f64::from(size.height) / s).round().max(600.0) as u32,
                                    ));
                                }
                            }
                        }
                    }
                    let app = window.app_handle().clone();
                    let _ = app.emit_to(
                        LAYER,
                        "command",
                        serde_json::json!({ "type": "dashboard-state", "open": false }),
                    );
                }
                tauri::WindowEvent::Focused(focused) => {
                    let app = window.app_handle().clone();
                    let _ = app.emit_to(
                        LAYER,
                        "command",
                        serde_json::json!({ "type": "dashboard-state", "open": *focused }),
                    );
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Pin To-Do");
}
