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
const SWP_NOSIZE: u32 = 0x0001;
const SWP_NOMOVE: u32 = 0x0002;
const SWP_NOZORDER: u32 = 0x0004;
const SWP_NOACTIVATE: u32 = 0x0010;
const SWP_FRAMECHANGED: u32 = 0x0020;

#[link(name = "user32")]
extern "system" {
    pub fn GetWindowLongW(hwnd: Hwnd, index: i32) -> i32;
    fn SetWindowLongW(hwnd: Hwnd, index: i32, value: i32) -> i32;
    fn SetWindowPos(hwnd: Hwnd, after: Hwnd, x: i32, y: i32, w: i32, h: i32, flags: u32) -> i32;
    fn GetClientRect(hwnd: Hwnd, rect: *mut WinRect) -> i32;
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
    let ex = (GetWindowLongW(hwnd, GWL_EXSTYLE) & !WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW;
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
    (r - l) >= mw - 24 && (b - t) >= mh - 24
}
pub fn cursor_pos() -> Option<Point> {
    let mut p = Point::default();
    if unsafe { GetCursorPos(&mut p) } == TRUE {
        Some(p)
    } else {
        None
    }
}
