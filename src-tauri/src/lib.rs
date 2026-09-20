use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicI64, Ordering};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};


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

/// --monitor <n> aims every window this process creates at one display, so a test
/// run can be kept entirely off the screen the user is working on.
fn monitor_index() -> Option<usize> {
    arg_value("--monitor")
        .and_then(|s| s.parse::<usize>().ok())
        .filter(|n| *n >= 1)
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
        let (style, ex, cw, ch) = unsafe { win32::strip_frame(h.0 as win32::Hwnd) };
        let _ = boot_note(
            app.clone(),
            format!("[layer] style=0x{:08X} ex=0x{:08X} client={}x{}", style, ex, cw, ch),
        );
    }
    refresh_layer_cache(app);
    Ok(())
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
    let _ = if show { win.show() } else { win.hide() };
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
                let body = js.clone();
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
}

fn spawn_foreground_watch(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last = String::new();
        loop {
            std::thread::sleep(std::time::Duration::from_millis(700));
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
               maximised panel and the shell windows cover the screen for other reasons */
            let full = kind == "app" && unsafe { win32::is_fullscreen(hwnd) };
            let stamp = format!("{}|{}|{}|{}", kind, title, over, full);
            if stamp == last {
                continue;
            }
            last = stamp;
            let _ = app.emit_to(
                LAYER,
                "command",
                ForegroundFrame {
                    kind: "foreground",
                    what: kind.to_string(),
                    over,
                    fullscreen: full,
                },
            );
        }
    });
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

            build_layer(&handle)?;
            spawn_cursor_feed(handle.clone());
            spawn_foreground_watch(handle.clone());

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
                if let tauri::WindowEvent::Resized(_) = event {
                    let app = window.app_handle().clone();
                    refresh_layer_cache(&app);
                    let _ = app.emit_to(
                        LAYER,
                        "command",
                        serde_json::json!({ "type": "relayout" }),
                    );
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
