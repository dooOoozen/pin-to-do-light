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
    pub fn GetCurrentThreadId() -> u32;
    pub fn GetTickCount() -> u32;
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

#[link(name = "user32")]
extern "system" {
    fn GetWindow(hwnd: Hwnd, cmd: u32) -> Hwnd;
    fn RedrawWindow(hwnd: Hwnd, rect: *const WinRect, region: Handle, flags: u32) -> i32;
}

const GW_HWNDNEXT: u32 = 2;
const GW_CHILD: u32 = 5;

/// What a window claims about itself (style bits) beside what it has (a non-client strip the
/// client rect cannot see). The white bar has been argued about entirely from the style bits
/// for three rounds now, and the two cases that keep being conflated are only told apart by
/// the second number: `nc=31` is a caption being painted whatever the bits say, while
/// `nc=0` with a bar on screen means the bar belongs to some *other* window in this tree.
pub struct Surface {
    pub hwnd: isize,
    pub class: String,
    pub title: String,
    pub proc: String,
    pub style: i32,
    pub ex: i32,
    pub rect: (i32, i32, i32, i32),
    pub client: (i32, i32),
}

impl Surface {
    pub fn non_client(&self) -> i32 {
        (self.rect.3 - self.rect.1) - self.client.1
    }

    pub fn one_line(&self) -> String {
        format!(
            "hwnd=0x{:X} class={} rect={}x{} client={}x{} nc={} style=0x{:08X} ex=0x{:08X} proc={} title={}",
            self.hwnd as usize,
            if self.class.is_empty() { "?" } else { &self.class },
            self.rect.2 - self.rect.0,
            self.rect.3 - self.rect.1,
            self.client.0,
            self.client.1,
            self.non_client(),
            self.style,
            self.ex,
            if self.proc.is_empty() { "?" } else { &self.proc },
            self.title,
        )
    }
}

pub unsafe fn surface_of(hwnd: Hwnd) -> Surface {
    let mut r = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
    let _ = GetWindowRect(hwnd, &mut r);
    let mut c = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
    let _ = GetClientRect(hwnd, &mut c);
    Surface {
        hwnd: hwnd as isize,
        class: class_of(hwnd),
        title: title_of(hwnd),
        proc: process_of(hwnd),
        style: GetWindowLongW(hwnd, GWL_STYLE),
        ex: GetWindowLongW(hwnd, GWL_EXSTYLE),
        rect: (r.left, r.top, r.right, r.bottom),
        client: (c.right - c.left, c.bottom - c.top),
    }
}

/// The layer window, its direct children, and whatever is in front of it, on one line.
///
/// The WebView2 child (`Chrome_WidgetWin_1`) is a real window with its own style bits, and no
/// instrument so far has ever looked at it — every reading has been taken from the top-level
/// handle this process holds. If the caption is being restored on the child, or if the bar on
/// screen belongs to a different window entirely, this is the only way to see it.
pub unsafe fn frame_report(root: Hwnd) -> String {
    let mut lines = vec![format!("layer {}", surface_of(root).one_line())];
    let mut kid = GetWindow(root, GW_CHILD);
    let mut guard = 0;
    while !kid.is_null() && guard < 12 {
        lines.push(format!("child {}", surface_of(kid).one_line()));
        kid = GetWindow(kid, GW_HWNDNEXT);
        guard += 1;
    }
    if guard == 0 {
        lines.push("child none".to_string());
    }
    let fg = GetForegroundWindow();
    if !fg.is_null() {
        lines.push(format!("fg {}", surface_of(fg).one_line()));
    }
    lines.join(" | ")
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
/// "A click on me must not make me the active window." The layer carries this whenever
/// nothing on it needs the keyboard, which is the state the user is looking at when the
/// white band appears — see `set_focusable`.
pub const WS_EX_NOACTIVATE: i32 = 0x0800_0000;
/// Same numeric value as WS_SYSMENU and no relation to it: styles and ex-styles are
/// separate slots, and this is the one the window manager writes to for transparency.
pub const WS_EX_LAYERED: i32 = 0x0008_0000;
const SWP_NOSIZE: u32 = 0x0001;
const SWP_NOMOVE: u32 = 0x0002;
const SWP_NOZORDER: u32 = 0x0004;
const SWP_NOACTIVATE: u32 = 0x0010;
const SWP_FRAMECHANGED: u32 = 0x0020;

/* RedrawWindow flags, and only the ones this needs. */
const RDW_INVALIDATE: u32 = 0x0001;
const RDW_ERASE: u32 = 0x0004;
const RDW_ALLCHILDREN: u32 = 0x0080;
const RDW_FRAME: u32 = 0x0200;
const RDW_UPDATENOW: u32 = 0x0100;

#[link(name = "user32")]
extern "system" {
    pub fn GetWindowLongW(hwnd: Hwnd, index: i32) -> i32;
    fn SetWindowLongW(hwnd: Hwnd, index: i32, value: i32) -> i32;
    fn SetWinEventHook(eventMin: u32, eventMax: u32, module: Handle, cb: EventProc, idProcess: u32, idThread: u32, flags: u32) -> Handle;
    fn UnhookWinEvent(hook: Handle) -> i32;
    fn SetWindowPos(hwnd: Hwnd, after: Hwnd, x: i32, y: i32, w: i32, h: i32, flags: u32) -> i32;
    fn GetClientRect(hwnd: Hwnd, rect: *mut WinRect) -> i32;
    fn SetForegroundWindow(hwnd: Hwnd) -> i32;
    fn BringWindowToTop(hwnd: Hwnd) -> i32;
    fn AttachThreadInput(to: u32, from: u32, attach: i32) -> i32;
    fn IsWindow(hwnd: Hwnd) -> i32;
    fn GetShellWindow() -> Hwnd;
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

/// The thread that installed the hook — for an out-of-context hook, the thread its callback
/// runs on. The event carries the id of the thread that *caused* it, so comparing the two is
/// the first real evidence about who writes WS_CAPTION back: our own message loop, or some
/// other process. Three rounds of "the toolkit does it" have never named a toolkit.
static MAIN_TID: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// When a strip happened too recently to trust, in GetTickCount units; 0 means nothing due.
///
/// The caption is not drawn by DWM's frame — measured, `DWMWA_EXTENDED_FRAME_BOUNDS` reports
/// the same top edge as the window rect while a caption is plainly on screen — it is painted
/// into the layered window's own redirection surface by the classic non-client painter, and
/// that surface is only rebuilt when the window changes size. So the strip has to be followed
/// by a reallocation *after* the queued paint has landed: recomposing inside the same call as
/// the strip reallocates the surface and then the paint arrives and fills it with a caption
/// again, which is exactly what the field showed.
pub static RECOMPOSE_DUE: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

/// What the hook caught, in its own words, waiting for the guard thread to write it out.
///
/// The hook is the component that has actually been catching these writes — `stripped=2` in a
/// run where the 120 ms poll never once found the window dirty — and until now it did so
/// without leaving a single line behind, because it runs on the main thread and has no
/// `AppHandle` to log with. So the one witness that exists was testifying inaudibly: we knew
/// twice something happened, and nothing about what. It leaves the description here instead,
/// and the guard thread, which does have an app handle, drains it.
static FRAME_EVENTS: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());

/// Schedule a surface reallocation `ms` from now, for whoever is watching the clock.
pub fn arm_recompose(ms: u32) {
    let at = unsafe { GetTickCount() }.wrapping_add(ms);
    RECOMPOSE_DUE.store(at, std::sync::atomic::Ordering::Relaxed);
}

pub fn note_frame_event(line: String) {
    if let Ok(mut q) = FRAME_EVENTS.lock() {
        if q.len() >= 48 {
            q.remove(0);
        }
        q.push(line);
    }
}

/// Take everything queued — for the log, which should see each event exactly once.
pub fn drain_frame_events() -> Vec<String> {
    match FRAME_EVENTS.lock() {
        Ok(mut q) => std::mem::take(&mut *q),
        Err(_) => Vec::new(),
    }
}

/// Look without taking, so a test script polling at 4 Hz can line an event up with what the
/// renderer saw at that instant while the Rust log still gets every one of them.
pub fn peek_frame_events(limit: usize) -> Vec<String> {
    match FRAME_EVENTS.lock() {
        Ok(q) => q.iter().rev().take(limit).rev().cloned().collect(),
        Err(_) => Vec::new(),
    }
}

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
    MAIN_TID.store(GetCurrentThreadId(), std::sync::atomic::Ordering::Relaxed);
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
    event: u32,
    hwnd: Hwnd,
    _id: i32,
    _child: i32,
    event_thread: u32,
    event_time: u32,
) {
    let want = GUARDED_HWND.load(std::sync::atomic::Ordering::Relaxed);
    if want == 0 || hwnd as isize != want {
        return;
    }
    let style = GetWindowLongW(hwnd, GWL_STYLE);
    let ex = GetWindowLongW(hwnd, GWL_EXSTYLE);
    if frame_dirty(style, ex) {
        let n = STYLE_STRIPPED.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
        let before = surface_of(hwnd).one_line();
        strip_frame(hwnd);
        let after = surface_of(hwnd).one_line();
        /* which bits were wrong, and who was in front when it happened. The event carries the
           id of the thread that caused it, which is the closest thing to naming a culprit that
           a style write allows: three rounds of "the toolkit puts it back" have never said
           which toolkit, and this is the first field that could. */
        let mut bits = Vec::new();
        if style & FRAME_BITS != 0 { bits.push(format!("style+{:#010X}", style & FRAME_BITS)); }
        if ex & WS_EX_APPWINDOW != 0 { bits.push("APPWINDOW".to_string()); }
        if ex & WS_EX_LAYERED == 0 { bits.push("no-LAYERED".to_string()); }
        if ex & WS_EX_TOOLWINDOW == 0 { bits.push("no-TOOLWINDOW".to_string()); }
        /* the bit that decides whether a click on the layer activates it, and so whether DWM
           composes the band at all. Named separately from no-LAYERED because the two failures
           look the same in the ex word and mean opposite things on screen. */
        if ex & WS_EX_NOACTIVATE == 0 { bits.push(if focus_intent() { "focusable" } else { "no-NOACTIVATE" }.to_string()); }
        let fg = GetForegroundWindow();
        let fg_line = if fg.is_null() { "-".to_string() } else {
            format!("{}|{}", surface_of(fg).class, surface_of(fg).proc)
        };
        note_frame_event(format!(
            "hook strip #{} {} ev=0x{:X} tid={} main={} same={} lag={}ms t={} [{}] before[{}] after[{}]",
            n,
            if hwnd as isize == want { "self" } else { "other" },
            event,
            event_thread,
            MAIN_TID.load(std::sync::atomic::Ordering::Relaxed),
            if event_thread == MAIN_TID.load(std::sync::atomic::Ordering::Relaxed) { "yes" } else { "no" },
            GetTickCount().wrapping_sub(event_time) as i64,
            event_time,
            bits.join(","),
            before,
            after
        ) + " fg=" + fg_line.as_str());
    }
}

/// The bits that must stay off the desktop layer, whatever the toolkit does with them.
pub const FRAME_BITS: i32 = WS_CAPTION | WS_SYSMENU | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX;

/// Whether the layer is allowed to become the active window right now. This is an *intent*,
/// kept in one place so the four writers of the style (the hook, the poll, the settle ladder
/// and `strip_frame` itself) all put the same ex-bit back when the toolkit overwrites them.
/// Off is the resting state: see `set_focusable`.
static LAYER_FOCUSABLE: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn focus_intent() -> bool {
    std::sync::atomic::AtomicBool::load(&LAYER_FOCUSABLE, std::sync::atomic::Ordering::Relaxed)
}

/// The window that held the activation before the layer borrowed it, so borrowing it is
/// reversible. `set_focusable` is the only writer.
static PRE_FG_HWND: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);

/// One definition of "the frame is wrong", because the caption outlived a fix that was
/// written into three of the four places that check it and not the fourth.
pub fn frame_dirty(style: i32, ex: i32) -> bool {
    style & FRAME_BITS != 0
        || ex & WS_EX_APPWINDOW != 0
        || ex & WS_EX_LAYERED == 0
        || ex & WS_EX_TOOLWINDOW == 0
        || (ex & WS_EX_NOACTIVATE != 0) == focus_intent()
}

/// Which ex-bits the layer must carry given the current intent.
fn wanted_ex_bits(ex: i32) -> i32 {
    let mut e = (ex & !WS_EX_APPWINDOW) | WS_EX_TOOLWINDOW | WS_EX_LAYERED;
    e = if focus_intent() {
        e & !WS_EX_NOACTIVATE
    } else {
        e | WS_EX_NOACTIVATE
    };
    e
}

/// Open the desktop layer to the keyboard, or shut it again.
///
/// The white band is not a live caption: `nc=0` while it is on screen, and the style reads
/// clean. It is a frame DWM composed into the window's redirection surface at the moment the
/// layer was *activated*, and nothing takes it away again but a reallocation of that surface
/// — measured: a 1px resize with a wait between the halves, where `RedrawWindow` and a bare
/// `SWP_FRAMECHANGED` both leave it. Every fix so far has been aimed at removing the band
/// after it appeared, which is why it has been a flash for three rounds of work.
///
/// The trigger is activation, and the layer is activated by a click on it — which it needs
/// for exactly one thing: typing into a modal. So refuse activation the rest of the time and
/// the event that composes the band never happens. A stray click on the desktop, a click on
/// another screen, and 打开设置 / 打开任务面板 all stop being triggers; the modal still gets
/// its keyboard because it asks for this first.
///
/// Turning it back off hands the activation to whoever held it before the modal and then
/// schedules the realloc: a window that stays the active window keeps giving DWM a reason to
/// paint the caption it composed, and the realloc would only be handed a fresh band.
pub unsafe fn set_focusable(hwnd: Hwnd, on: bool) -> String {
    std::sync::atomic::AtomicBool::store(&LAYER_FOCUSABLE, on, std::sync::atomic::Ordering::SeqCst);
    let before = GetWindowLongW(hwnd, GWL_EXSTYLE);
    SetWindowLongW(hwnd, GWL_EXSTYLE, wanted_ex_bits(before));
    SetWindowPos(
        hwnd,
        std::ptr::null_mut(),
        0,
        0,
        0,
        0,
        SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
    );
    /* The click that opened the modal landed on this window but, until a moment ago, could
       not activate it — so the input the modal focuses would have had no keyboard to reach.
       A bare SetForegroundWindow is refused here (measured: returns 0 while the desktop holds
       the foreground), which is the documented foreground lock rather than a bug in the call.
       The pair the documentation offers for exactly this is to share the foreground thread's
       input queue for the duration of the call and bring the window to the top of its own
       z-order band, and it is worth naming in the log which of the two did it. */
    let how: String;
    if on {
        let fg = GetForegroundWindow();
        if !fg.is_null() && fg != hwnd {
            PRE_FG_HWND.store(fg as isize, std::sync::atomic::Ordering::Relaxed);
            let ftid = GetWindowThreadProcessId(fg, std::ptr::null_mut());
            let me = GetCurrentThreadId();
            let attached = ftid != 0 && ftid != me && AttachThreadInput(me, ftid, TRUE) != 0;
            let top = BringWindowToTop(hwnd);
            let set = SetForegroundWindow(hwnd);
            if attached {
                AttachThreadInput(me, ftid, 0);
            }
            how = format!("top={} setfg={} attach={}", top, set, attached);
        } else {
            how = "already-foreground".to_string();
        }
        /* becoming the foreground window is the moment the band is composed — measured, every
           `focus focusable=true` line the user has reported a band after. Clearing it while
           the modal is still up beats clearing it when the modal closes, because by then the
           person has watched it sit there for as long as they took to type. */
        arm_recompose(420);
    } else {
        let fg = GetForegroundWindow();
        let prev = PRE_FG_HWND.swap(0, std::sync::atomic::Ordering::Relaxed);
        /* only when the layer still holds the activation: that means the close came from a
           click inside it, which is the case where focus going back where it came from is
           what a person expects. If they have clicked elsewhere in the meantime, that other
           window has it fair and square and this must not reach for it. */
        if !fg.is_null() && fg == hwnd {
            let target = if prev != 0 && IsWindow(prev as Hwnd) != 0 {
                prev as Hwnd
            } else {
                GetShellWindow()
            };
            if !target.is_null() && target != hwnd {
                how = format!("back={:X}:{}", target as usize, SetForegroundWindow(target));
            } else {
                how = "back:none".to_string();
            }
        } else {
            how = "already-inactive".to_string();
        }
        arm_recompose(300);
    }
    let after = GetWindowLongW(hwnd, GWL_EXSTYLE);
    format!(
        "focusable={} ex {:#08X}->{:#08X} {} nc={}",
        on,
        before,
        after,
        how,
        surface_of(hwnd).non_client()
    )
}

/// Strip the caption and the shell presence from the desktop layer.
///
/// `decorations(false)` + `skip_taskbar(true)` still leave WS_CAPTION / WS_SYSMENU /
/// WS_EX_APPWINDOW on the HWND. WM_NCCALCSIZE hides the frame so the client area is
/// correct, but the shell keeps giving the window a taskbar button and an Alt+Tab entry,
/// and a blue caption is painted whenever the window region is cleared — which is exactly
/// what happens as the layer is shown. Returns the style bits and client size afterwards.
pub unsafe fn strip_frame(hwnd: Hwnd) -> (i32, i32, i32, i32) {
    /* decided before anything is written, because the recomposition below is only worth its
       cost when a frame was actually up there to throw away */
    let was_dirty = frame_dirty(
        GetWindowLongW(hwnd, GWL_STYLE),
        GetWindowLongW(hwnd, GWL_EXSTYLE),
    );
    let style = (GetWindowLongW(hwnd, GWL_STYLE) & !FRAME_BITS) | WS_POPUP;
    SetWindowLongW(hwnd, GWL_STYLE, style);
    /* Re-assert WS_EX_LAYERED alongside the other two. Measured, not assumed: the style
       rewrite that brings the caption back writes the whole cached set — 0x14C80000 /
       0x00040118 — which carries neither LAYERED nor TOOLWINDOW, and the repair that
       follows has so far only put TOOLWINDOW back. So every caption incident was also a
       lost-layered incident, on a window whose entire job is to be transparent. This is
       not the bit being toggled for effect: the layer is created with LAYERED on
       (0x000800B8 in the same boot log) and works, which is the state being restored.
       WS_EX_NOACTIVATE rides along from the current intent (`wanted_ex_bits`), because this
       function runs from four places and the last thing needed is one of them quietly
       handing the layer back to the keyboard. */
    let ex = wanted_ex_bits(GetWindowLongW(hwnd, GWL_EXSTYLE));
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
    /* SWP_FRAMECHANGED asks for a full non-client recalculation and repaint, which is also
       the rasterizer's second chance to draw a caption — so the painter switch is re-asserted
       here, not only once at creation. */
    let _ = forbid_nc_painting(hwnd);
    /* and the pixels it already laid down have to be asked for back */
    wipe_caption_paint(hwnd);
    if was_dirty {
        recompose_frame(hwnd);
    }
    /* armed for every caller, not just the hook: whoever takes the caption off has to be the
       one that schedules the surface realloc ~260 ms later, because the paint for the
       captioned style is usually still in flight at this point and lands on top of anything
       done synchronously here */
    arm_recompose(260);
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
///
/// Two attributes, because they disable different painters and the first one was already in
/// place when the bar survived:
///   2 DWMWA_NCRENDERING_POLICY   = DISABLED — the old composition path
///   8 DWMWA_NONCLIENT_RAST_STYLE = NONE     — the Win10+ non-client rasterizer, which is the
///       one that draws a caption on a window whose WM_NCCALCSIZE already gave the client the
///       whole frame. Measured: the incident leaves `nc=0` on the window the whole time, i.e.
///       no space is taken and still a bar appears — that is a rasterizer, not a layout.
///
/// The index here was 34 and the value 3 until this was checked against the header. On Win11
/// 34 is `DWMWA_BORDER_COLOR` and its argument is a COLORREF, so the "rasterizer off" call that
/// reported S_OK twelve times was in fact asking for a near-black window border — and the real
/// switch had never been touched. Both are corrected; 34 is now explicitly `COLOR_NONE`, which
/// is the honest version of what the old call pretended to do. Every HRESULT is logged, because
/// an attribute the OS refused and one it applied have looked identical in every log so far.
pub unsafe fn forbid_nc_painting(hwnd: Hwnd) -> String {
    let policy: u32 = 1; /* DWMNCRP_DISABLED */
    let rast: u32 = 1; /* NonClientRastaStyleNone */
    let border: u32 = 0xFFFF_FFFE; /* DWMWA_COLOR_NONE */
    let a = DwmSetWindowAttribute(hwnd, 2 /* DWMWA_NCRENDERING_POLICY */, &policy, 4);
    let b = DwmSetWindowAttribute(hwnd, 8 /* DWMWA_NONCLIENT_RAST_STYLE */, &rast, 4);
    let c = DwmSetWindowAttribute(hwnd, 34 /* DWMWA_BORDER_COLOR */, &border, 4);
    format!(
        "ncpolicy={:#010X} rastsyle={:#010X} border={:#010X}",
        a, b, c
    )
}

/* ------------------------------------------------------------------ messages */

const WM_NCACTIVATE: u32 = 0x0086;

/// `SubclassProc` has one more pair of arguments than a window procedure, which is how the
/// chain hands back what `SetWindowSubclass` was given.
pub type SubclassProc =
    unsafe extern "system" fn(hwnd: Hwnd, msg: u32, w: isize, l: isize, id: usize, item: usize) -> isize;

#[link(name = "comctl32")]
extern "system" {
    fn SetWindowSubclass(hwnd: Hwnd, pfn: SubclassProc, id: usize, item: usize) -> i32;
    fn DefSubclassProc(hwnd: Hwnd, msg: u32, w: isize, l: isize) -> isize;
}

/// How many activation repaints the subclass has refused. Counted because "installed" is not
/// "called": the `GWLP_WNDPROC` patch below reported a non-null previous procedure and then
/// never saw a single message, since tao's own subclass calls the procedure it captured at
/// install time. A `SetWindowSubclass` entry is inserted above that chain, so this one does
/// get first look — and the counter is what proves it rather than the return value.
static NC_REFUSED: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
static GUARDED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

pub fn nc_refused() -> isize {
    NC_REFUSED.load(std::sync::atomic::Ordering::Relaxed)
}

unsafe extern "system" fn refuse_nc_paint(
    hwnd: Hwnd,
    msg: u32,
    w: isize,
    l: isize,
    _id: usize,
    _item: usize,
) -> isize {
    if msg == WM_NCACTIVATE {
        /* Answer "yes, the non-client area is up to date" and draw nothing. The message is the
           activation's own repaint request: it is what lays the caption into the window's
           redirection surface, and `WM_NCCALCSIZE` has already given the client that ground —
           so the only pixels this paint can produce are ours. */
        NC_REFUSED.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        return TRUE as isize;
    }
    DefSubclassProc(hwnd, msg, w, l)
}

/// Put the refusal in front of the toolkit's window procedure, once per window.
pub unsafe fn guard_nc_messages(hwnd: Hwnd) -> String {
    if GUARDED.swap(true, std::sync::atomic::Ordering::Relaxed) {
        return format!("ncguard=already refused={}", nc_refused());
    }
    let ok = SetWindowSubclass(hwnd, refuse_nc_paint, 0x5054_4E43, 0);
    format!("ncguard={} refused={}", ok != 0, nc_refused())
}

/// Make DWM let go of a frame it has already composed.
///
/// Measured from outside the process, on a band that was on screen and would not go away:
/// `RedrawWindow` with `RDW_FRAME | RDW_ERASE | RDW_UPDATENOW` left it, `SetWindowPos` with
/// `SWP_FRAMECHANGED` and no size change left it, and a resize of one pixel and back took it
/// with it. The difference is that only the last one gives the compositor a new frame to build
/// — the others ask the window to repaint the surface *under* the frame, which was never the
/// problem. One pixel, restored in the same call pair, with the recalculation on the way back
/// so the client area ends where it started.
///
/// The flag is not ceremony: the resize arrives as a `Resized` window event, which is one of
/// the things that calls `strip_frame`, and a repair that triggers itself is a loop.
static RECOMPOSING: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// The same reallocation, with a wait between the two halves — and the wait is the whole
/// point. Measured: shrinking and restoring in one breath leaves the band exactly where it
/// was, because the compositor never observes a size to change to; the same pair with 250 ms
/// between them takes it with it. Call this from a thread that is allowed to sleep.
pub unsafe fn recompose_frame_slow(hwnd: Hwnd) -> bool {
    if RECOMPOSING.load(std::sync::atomic::Ordering::SeqCst) {
        return false;
    }
    RECOMPOSING.store(true, std::sync::atomic::Ordering::SeqCst);
    let mut r = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
    GetWindowRect(hwnd, &mut r);
    let w = r.right - r.left;
    let h = r.bottom - r.top;
    let done = if w > 2 && h > 2 {
        SetWindowPos(hwnd, std::ptr::null_mut(), r.left, r.top, w - 1, h - 1, SWP_NOZORDER | SWP_NOACTIVATE);
        std::thread::sleep(std::time::Duration::from_millis(250));
        SetWindowPos(hwnd, std::ptr::null_mut(), r.left, r.top, w, h, SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
        true
    } else {
        false
    };
    RECOMPOSING.store(false, std::sync::atomic::Ordering::SeqCst);
    done
}

pub unsafe fn recompose_frame(hwnd: Hwnd) -> bool {
    if RECOMPOSING.load(std::sync::atomic::Ordering::SeqCst) {
        return false;
    }
    RECOMPOSING.store(true, std::sync::atomic::Ordering::SeqCst);
    let mut r = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
    GetWindowRect(hwnd, &mut r);
    let w = r.right - r.left;
    let h = r.bottom - r.top;
    let moved = if w > 2 && h > 2 {
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            r.left,
            r.top,
            w - 1,
            h - 1,
            SWP_NOZORDER | SWP_NOACTIVATE,
        );
        SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            r.left,
            r.top,
            w,
            h,
            SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        );
        true
    } else {
        false
    };
    RECOMPOSING.store(false, std::sync::atomic::Ordering::SeqCst);
    moved
}

/// Erase a caption band that is no longer there.
///
/// The style write lands and is undone again inside 63 ms, and in that window DWM composes a
/// caption — then nothing ever asks for those pixels back, because the window's style is now
/// clean, its non-client height is 0, and its client area was never invalidated. That is why
/// three rounds of "strip it faster" could not fix a bar that *is* already stripped: the race
/// is won, and the painting is left behind on screen. This forces the frame and the client to
/// be repainted synchronously, as part of the repair rather than after it.
///
/// RDW_UPDATENOW rather than a bare invalidate, because the point of the exercise is that the
/// band is gone before this call returns; the children are included so the WebView repaints
/// over the strip as well, and the whole thing runs a couple of times per boot at most.
pub unsafe fn wipe_caption_paint(hwnd: Hwnd) {
    RedrawWindow(
        hwnd,
        std::ptr::null(),
        std::ptr::null_mut(),
        RDW_INVALIDATE | RDW_ERASE | RDW_FRAME | RDW_ALLCHILDREN | RDW_UPDATENOW,
    );
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
