//! The handful of Win32 entry points this app needs, declared by hand.
//!
//! Pulling in the `windows` crate would be the conventional choice and it is a good
//! one for anything larger; here it would add a dependency tree, compile time and
//! installer bytes to reach five functions that have stable, trivial signatures.

use std::ffi::c_void;

pub type Hwnd = *mut c_void;
pub type Handle = *mut c_void;

pub const TRUE: i32 = 1;

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}


const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;

#[repr(C)]
pub struct WinRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

#[link(name = "user32")]
extern "system" {
    pub fn GetCursorPos(point: *mut Point) -> i32;
    pub fn GetForegroundWindow() -> Hwnd;
    pub fn GetClassNameW(hwnd: Hwnd, class: *mut u16, max: i32) -> i32;
    pub fn GetWindowThreadProcessId(hwnd: Hwnd, pid: *mut u32) -> u32;
    pub fn GetWindowTextW(hwnd: Hwnd, text: *mut u16, max: i32) -> i32;
    pub fn GetWindowRect(hwnd: Hwnd, rect: *mut WinRect) -> i32;
}

#[link(name = "kernel32")]
extern "system" {
    pub fn OpenProcess(access: u32, inherit: i32, pid: u32) -> Handle;
    pub fn CloseHandle(handle: Handle) -> i32;
    pub fn QueryFullProcessImageNameW(handle: Handle, flags: u32, buffer: *mut u16, size: *mut u32) -> i32;
}

/// Window title, used to tell this app's two windows apart without a crate.
pub fn title_of(hwnd: Hwnd) -> String {
    let mut buf = [0u16; 256];
    let n = unsafe { GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
    if n <= 0 {
        return String::new();
    }
    from_wide(&buf)
}

fn from_wide(buffer: &[u16]) -> String {
    let end = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..end])
}

/// Window class name of a window, e.g. "Progman" or "Chrome_WidgetWin_1".
pub fn class_of(hwnd: Hwnd) -> String {
    let mut buf = [0u16; 256];
    let n = unsafe { GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
    if n <= 0 {
        return String::new();
    }
    from_wide(&buf)
}

/// Process name (stem of the executable) owning a window, e.g. "WINWORD".
pub fn process_of(hwnd: Hwnd) -> String {
    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    if pid == 0 {
        return String::new();
    }
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() {
        return String::new();
    }
    let mut buf = [0u16; 512];
    let mut len = buf.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut len) };
    unsafe { CloseHandle(handle) };
    if ok == 0 {
        return String::new();
    }
    let path = from_wide(&buf[..len as usize]);
    let file = path.rsplit(['\\', '/']).next().unwrap_or("");
    file.trim_end_matches(".exe").to_string()
}

/// Screen rectangle of a window, in physical pixels.
pub fn rect_of(hwnd: Hwnd) -> Option<(i32, i32, i32, i32)> {
    let mut r = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
    if unsafe { GetWindowRect(hwnd, &mut r) } == 0 {
        return None;
    }
    Some((r.left, r.top, r.right, r.bottom))
}

/// The Downloads folder as the shell sees it. `USERPROFILE` + "Downloads" is wrong on
/// any machine where the known folder has been redirected (OneDrive does this on setup),
/// and wrong in the other direction on machines that have no Downloads at all, which is
/// what the first version of the receipt writer found in practice.
#[repr(C)]
pub struct KnownFolderId {
    pub l: u32,
    pub w1: u16,
    pub w2: u16,
    pub w3: [u8; 8],
}

pub const FOLDERID_DOWNLOADS: KnownFolderId = KnownFolderId {
    l: 0x7d83_ee9d,
    w1: 0xaf62,
    w2: 0x49da,
    w3: [0x89, 0x40, 0xa2, 0xbc, 0xa4, 0x21, 0x83, 0x0e],
};

#[link(name = "shell32")]
extern "system" {
    pub fn SHGetKnownFolderPath(id: *const KnownFolderId, flags: u32, token: *mut c_void, out: *mut *mut u16) -> i32;
}

#[link(name = "ole32")]
extern "system" {
    pub fn CoTaskMemFree(p: *mut c_void);
}

/// # Safety
/// Wraps a shell call that hands back an allocated wide string, which is freed here.
pub fn known_folder(id: &KnownFolderId) -> Option<std::path::PathBuf> {
    unsafe {
        let mut raw: *mut u16 = std::ptr::null_mut();
        if SHGetKnownFolderPath(id, 0, std::ptr::null_mut(), &mut raw) < 0 || raw.is_null() {
            return None;
        }
        let mut units = Vec::new();
        let mut i = 0usize;
        loop {
            let c = *raw.add(i);
            if c == 0 {
                break;
            }
            units.push(c);
            i += 1;
            if i > 4096 {
                break;
            }
        }
        CoTaskMemFree(raw as *mut c_void);
        if units.is_empty() {
            return None;
        }
        Some(std::path::PathBuf::from(String::from_utf16_lossy(&units)))
    }
}

pub const RGN_OR: i32 = 2;

#[link(name = "user32")]
extern "system" {
    pub fn SetWindowRgn(hwnd: Hwnd, rgn: *mut c_void, redraw: i32) -> i32;
}

#[link(name = "gdi32")]
extern "system" {
    pub fn CreateRectRgn(x1: i32, y1: i32, x2: i32, y2: i32) -> *mut c_void;
    pub fn CombineRgn(dest: *mut c_void, src1: *mut c_void, src2: *mut c_void, mode: i32) -> i32;
    pub fn DeleteObject(obj: *mut c_void) -> i32;
}

/// Apply a union of device-rectangle spans as the window region. An empty slice
/// clears the region, which returns the window to a plain rectangle.
///
/// SetWindowRgn takes ownership of the region handle, so it is deliberately not
/// deleted here; every temporary is.
///
/// # Safety
/// `hwnd` must be a live window handle and `spans` must be in physical device
/// coordinates relative to that window's origin.
pub unsafe fn apply_region(hwnd: Hwnd, spans: &[(i32, i32, i32, i32)]) -> bool {
    if spans.is_empty() {
        return SetWindowRgn(hwnd, std::ptr::null_mut(), TRUE) != 0;
    }
    let acc = CreateRectRgn(0, 0, 0, 0);
    if acc.is_null() {
        return false;
    }
    for (x, y, w, h) in spans {
        let tmp = CreateRectRgn(*x, *y, *x + *w, *y + *h);
        if tmp.is_null() {
            continue;
        }
        CombineRgn(acc, tmp, acc, RGN_OR);
        DeleteObject(tmp);
    }
    SetWindowRgn(hwnd, acc, TRUE) != 0
}

/* ------------------------------------------------------------- window frame */

pub const GWL_STYLE: i32 = -16;
pub const GWL_EXSTYLE: i32 = -20;
pub const WS_POPUP: i32 = -0x8000_0000;
pub const WS_CAPTION: i32 = 0x00C0_0000;
pub const WS_SYSMENU: i32 = 0x0008_0000;
pub const WS_BORDER: i32 = 0x0080_0000;
pub const WS_DLGFRAME: i32 = 0x0040_0000;
pub const WS_THICKFRAME: i32 = 0x0004_0000;
pub const WS_MINIMIZEBOX: i32 = 0x0002_0000;
pub const WS_MAXIMIZEBOX: i32 = 0x0001_0000;
pub const WS_EX_TOOLWINDOW: i32 = 0x0000_0080;
pub const WS_EX_APPWINDOW: i32 = 0x0004_0000;
/// Same numeric value as WS_SYSMENU and no relation to it: styles and ex-styles are
/// separate slots, and this is the one the window manager writes to for transparency.
pub const WS_EX_LAYERED: i32 = 0x0008_0000;
const SWP_NOSIZE: u32 = 0x0001;
const SWP_NOMOVE: u32 = 0x0002;
const SWP_NOZORDER: u32 = 0x0004;
const SWP_NOACTIVATE: u32 = 0x0010;
const SWP_FRAMECHANGED: u32 = 0x0020;

#[link(name = "user32")]
extern "system" {
    pub fn GetWindowLongW(hwnd: Hwnd, index: i32) -> i32;
    fn SetWindowLongW(hwnd: Hwnd, index: i32, value: i32) -> i32;
    fn SetWinEventHook(eventMin: u32, eventMax: u32, module: Handle, cb: EventProc, idProcess: u32, idThread: u32, flags: u32) -> Handle;
    fn UnhookWinEvent(hook: Handle) -> i32;
    fn SetWindowPos(hwnd: Hwnd, after: Hwnd, x: i32, y: i32, w: i32, h: i32, flags: u32) -> i32;
    fn GetClientRect(hwnd: Hwnd, rect: *mut WinRect) -> i32;
}

type EventProc = unsafe extern "system" fn(Handle, u32, Hwnd, i32, i32, u32, u32);

pub const EVENT_OBJECT_REORDER: u32 = 0x8004;
pub const EVENT_OBJECT_LOCATIONCHANGE: u32 = 0x800B;
const WINEVENT_OUTOFCONTEXT: u32 = 0;

/// The hook handle, kept so a second call replaces the first rather than stacking watchers.
static STYLE_HOOK: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
/// The event hook is process-wide, so the callback needs to know which of this process's
/// several windows it is being asked about.
static GUARDED_HWND: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

/// How many times the hook found a dirty style and cleared it. Without this, "no repairs in
/// the log" cannot be read as anything: it is the same observation as "nothing happened this
/// run", and only one of them is a fix.
pub static STYLE_STRIPPED: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

/// (hooked, strips so far) — enough for the log to tell "watching" from "watching and acting".
pub fn guard_status() -> (bool, isize) {
    (
        STYLE_HOOK.load(std::sync::atomic::Ordering::Relaxed) != 0,
        STYLE_STRIPPED.load(std::sync::atomic::Ordering::Relaxed),
    )
}

/// Watch for the caption being put back on the desktop layer, and take it off on the spot.
///
/// `strip_frame` clears WS_CAPTION and the toolkit puts it back — measured, twice a minute,
/// always as a whole cached style set (0x14C80000 / 0x00040118) that also drops
/// WS_EX_LAYERED and WS_EX_TOOLWINDOW. Every repair after that is a SetWindowLong +
/// SWP_FRAMECHANGED, i.e. the window is *rebuilt* around the caption: the client area jumps
/// by the caption's height and the non-client strip is repainted white with the window title
/// in it. Turning off DWM's non-client rendering did not stop the bar, so the paint is
/// classic NC, and a poll cannot win the race — it only bounds how long the bar is up.
///
/// The mechanism is a WinEvent hook on this process's own z-order and geometry changes,
/// which is what every one of those rewrites is a side effect of. Measured on the machine
/// that reported it: two strips inside 24 seconds, and the 120 ms poll below found nothing
/// dirty once — the hook is faster than anything that asks on a timer.
///
/// A window-procedure subclass was tried first and is not what does this job. Patching
/// GWLP_WNDPROC is invisible to the toolkit here: it delivers messages through a
/// SetWindowSubclass chain that calls the procedure it captured at install time, not the
/// slot, so the patch reported "installed" while seeing zero style changes (seen=0 against
/// stripped=2). An interception that never runs is worse than none, because it reads as a
/// fix — see the counters, which exist precisely so this claim can be checked.
///
/// Out-of-context is also the only kind of hook that can live in an exe: an in-context one
/// has to be in a DLL, and asking for one here fails outright (measured: the install
/// returned null). Out-of-context runs on the thread that installed it — the main thread,
/// which owns this window — and unlike a procedure patch, a style write from there is legal.
///
/// The hook lives for the process: it is scoped to this pid and to two events, the layer is
/// only destroyed on exit, and there is no place in this app's shutdown that would reliably
/// call UnhookWinEvent before the window is gone.
pub unsafe fn watch_layer_styles(hwnd: Hwnd) -> bool {
    GUARDED_HWND.store(hwnd as isize, std::sync::atomic::Ordering::Relaxed);
    let old = STYLE_HOOK.swap(0, std::sync::atomic::Ordering::Relaxed);
    if old != 0 {
        let _ = UnhookWinEvent(old as Handle);
    }
    let hook = SetWinEventHook(
        EVENT_OBJECT_REORDER,
        EVENT_OBJECT_LOCATIONCHANGE,
        std::ptr::null_mut(),
        layer_event_proc,
        std::process::id(),
        0,
        WINEVENT_OUTOFCONTEXT,
    );
    STYLE_HOOK.store(hook as isize, std::sync::atomic::Ordering::Relaxed);
    !hook.is_null()
}

unsafe extern "system" fn layer_event_proc(
    _hook: Handle,
    _event: u32,
    hwnd: Hwnd,
    _id: i32,
    _child: i32,
    _thread: u32,
    _time: u32,
) {
    let want = GUARDED_HWND.load(std::sync::atomic::Ordering::Relaxed);
    if want == 0 || hwnd as isize != want {
        return;
    }
    let style = GetWindowLongW(hwnd, GWL_STYLE);
    let ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
    if style & FRAME_BITS != 0
        || ex & WS_EX_APPWINDOW != 0
        || ex & WS_EX_LAYERED == 0
        || ex & WS_EX_TOOLWINDOW == 0
    {
        STYLE_STRIPPED.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        strip_frame(hwnd);
    }
}

/// The bits that must stay off the desktop layer, whatever the toolkit does with them.
pub const FRAME_BITS: i32 = WS_CAPTION | WS_SYSMENU | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX;

/// Strip the caption and the shell presence from the desktop layer.
///
/// `decorations(false)` + `skip_taskbar(true)` still leave WS_CAPTION / WS_SYSMENU /
/// WS_EX_APPWINDOW on the HWND. WM_NCCALCSIZE hides the frame so the client area is
/// correct, but the shell keeps giving the window a taskbar button and an Alt+Tab entry,
/// and a blue caption is painted whenever the window region is cleared — which is exactly
/// what happens as the layer is shown. Returns the style bits and client size afterwards.
pub unsafe fn strip_frame(hwnd: Hwnd) -> (i32, i32, i32, i32) {
    let style = (GetWindowLongW(hwnd, GWL_STYLE) & !FRAME_BITS) | WS_POPUP;
    SetWindowLongW(hwnd, GWL_STYLE, style);
    /* Re-assert WS_EX_LAYERED alongside the other two. Measured, not assumed: the style
       rewrite that brings the caption back writes the whole cached set — 0x14C80000 /
       0x00040118 — which carries neither LAYERED nor TOOLWINDOW, and the repair that
       follows has so far only put TOOLWINDOW back. So every caption incident was also a
       lost-layered incident, on a window whose entire job is to be transparent. This is
       not the bit being toggled for effect: the layer is created with LAYERED on
       (0x000800B8 in the same boot log) and works, which is the state being restored. */
    let ex = (GetWindowLongW(hwnd, GWL_EXSTYLE) & !WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW | WS_EX_LAYERED;
    SetWindowLongW(hwnd, GWL_EXSTYLE, ex);
    SetWindowPos(
        hwnd,
        std::ptr::null_mut(),
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
    );
    let mut r = WinRect {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    GetClientRect(hwnd, &mut r);
    (
        GetWindowLongW(hwnd, GWL_STYLE),
        GetWindowLongW(hwnd, GWL_EXSTYLE),
        r.right,
        r.bottom,
    )
}

#[link(name = "dwmapi")]
extern "system" {
    fn DwmSetWindowAttribute(hwnd: Hwnd, attr: u32, value: *const u32, size: u32) -> i32;
}

/// Never let DWM paint the non-client area of the desktop layer, whatever the style bits
/// currently say.
///
/// `decorations(false)` makes the client area fill the window through WM_NCCALCSIZE, but DWM
/// still owns the strip it would have reserved and paints it white with the window title in
/// it the moment WS_CAPTION comes back — which it does, repeatedly, because the toolkit
/// rewrites the style it built with. That is the "Pin To-Do 桌面卡片层" bar the user
/// reported, and it is only *visible* while the region covers the top of the window, which
/// is exactly the scatter and the modal — matching where they found it. Stripping the bits
/// faster treats the symptom for 120 ms at a time; this turns off the painter.
pub unsafe fn forbid_nc_painting(hwnd: Hwnd) {
    let policy: u32 = 1; /* DWMNCRP_DISABLED */
    DwmSetWindowAttribute(hwnd, 2 /* DWMWA_NCRENDERING_POLICY */, &policy, 4);
}

/// The panel's share of the same idea: drop only the caption, keep the sizing border
/// and the taskbar button. DWM will paint a blue title bar for a window that carries
/// WS_CAPTION even when WM_NCCALCSIZE has already given the client area back, which is
/// the flash seen as the window is revealed after its first paint. Returns the style and
/// the client size afterwards so the caller can prove nothing moved.
pub unsafe fn strip_caption(hwnd: Hwnd) -> (i32, i32, i32) {
    let style = GetWindowLongW(hwnd, GWL_STYLE) & !(WS_CAPTION | WS_BORDER | WS_DLGFRAME);
    SetWindowLongW(hwnd, GWL_STYLE, style);
    SetWindowPos(
        hwnd,
        std::ptr::null_mut(),
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
    );
    let mut r = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
    GetClientRect(hwnd, &mut r);
    (GetWindowLongW(hwnd, GWL_STYLE), r.right, r.bottom)
}

/// Put the window back at the front of the topmost band.
///
/// `always_on_top(true)` sets WS_EX_TOPMOST once, at creation, and the bit survives
/// hide/show — so probing the style says "topmost" and looks fine. What does not survive is
/// the *position within that band*: a window re-entered after a show lands at the bottom of
/// it, under every other topmost window on the desk. That is the "卡片堆不在其他应用前了"
/// shape — still topmost, still behind a terminal. Re-issuing the same insertion is the
/// documented way to move back to the front of the band.
pub unsafe fn reassert_topmost(hwnd: Hwnd) {
    SetWindowPos(
        hwnd,
        -1isize as Hwnd, // HWND_TOPMOST
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
    );
}

pub fn foreground() -> Hwnd {
    unsafe { GetForegroundWindow() }
}

/* ------------------------------------------------------------- fullscreen test */

const MONITOR_DEFAULTTONEAREST: u32 = 2;

#[repr(C)]
struct MonitorInfo {
    cb_size: u32,
    rc_monitor: WinRect,
    rc_work: WinRect,
    dw_flags: u32,
}

#[link(name = "user32")]
extern "system" {
    fn MonitorFromWindow(hwnd: Hwnd, flags: u32) -> Hwnd;
    fn GetMonitorInfoW(mon: Hwnd, info: *mut MonitorInfo) -> i32;
}

/// True when the window covers its whole monitor — the shape of "watching a video" and of
/// every borderless-fullscreen game. A *maximised* window is not fullscreen: it stops at
/// the work area, so comparing against the monitor rect rather than the work area is what
/// separates the two. The tolerance is Windows' invisible resize border.
///
/// The upper bound is what the first version was missing: a window that covers **more**
/// than one monitor is not a film on this one, it is the surface the desktop is drawn on.
/// Measured on the machine that reported it — the wallpaper is 3840x1168 across two
/// 1920-wide displays, and a desktop organiser that draws the wallpaper itself
/// (`TXMiniSkin`) sits in the same band, so every click on the desktop read as "a video
/// started" and the deck hid itself. A genuine multi-monitor game now keeps the deck
/// visible; that is the cheaper of the two errors, because the other one happens on every
/// desktop click.
pub unsafe fn is_fullscreen(hwnd: Hwnd) -> bool {
    let (l, t, r, b) = match rect_of(hwnd) {
        Some(v) => v,
        None => return false,
    };
    let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
    if mon.is_null() {
        return false;
    }
    let mut info = MonitorInfo {
        cb_size: std::mem::size_of::<MonitorInfo>() as u32,
        rc_monitor: WinRect { left: 0, top: 0, right: 0, bottom: 0 },
        rc_work: WinRect { left: 0, top: 0, right: 0, bottom: 0 },
        dw_flags: 0,
    };
    if GetMonitorInfoW(mon, &mut info) == 0 {
        return false;
    }
    let mw = info.rc_monitor.right - info.rc_monitor.left;
    let mh = info.rc_monitor.bottom - info.rc_monitor.top;
    let w = r - l;
    let h = b - t;
    (w >= mw - 24 && h >= mh - 24) && (w <= mw + 24 && h <= mh + 24)
}
pub fn cursor_pos() -> Option<Point> {
    let mut p = Point::default();
    if unsafe { GetCursorPos(&mut p) } == TRUE {
        Some(p)
    } else {
        None
    }
}
